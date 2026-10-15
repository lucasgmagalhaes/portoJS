import { parseSave } from '../src/core/index.js';
import { describe, expect, it } from 'vitest';
import { ManualClock, SaveCorruptedError, createCore, createSave } from '../src/core/index.js';
import { challenges, resources } from '../src/mechanics/index.js';

function build() {
  const clock = new ManualClock(0);
  const game = createCore({
    clock,
    plugins: [
      resources({
        resources: { gold: { initial: 100 }, gems: {} },
        generators: {
          miner: { cost: { resource: 'gold', base: 10, growth: 1 }, produces: 'gold', rate: 10 },
        },
        upgrades: {
          pick: {
            cost: { resource: 'gold', base: 5, growth: 1 },
            effects: [{ all: true, multiplier: 2 }],
          },
        },
      }),
      challenges<'gold' | 'gems', 'miner', 'slow' | 'poor'>({
        checkIntervalMs: 100,
        definitions: {
          slow: {
            goal: (g) => g.earned('gold').gte(500),
            modifiers: [{ resource: 'gold', multiplier: 0.1 }],
            reward: [{ resource: 'gold', multiplier: 2 }],
            keep: { upgrades: ['pick'] },
          },
          poor: { goal: (g) => g.amount('gems').gte(1) },
        },
      }),
    ],
  });
  return { clock, game };
}

describe('challenges', () => {
  it('starts a challenge: resets the run, keeps what is listed and applies the handicap', () => {
    const { game } = build();
    game.buyUpgrade('pick');
    game.add('gems', 5);
    const events: string[] = [];
    game.on('challengeStarted', (e) => events.push(e.id));
    expect(game.startChallenge('slow')).toBe(true);
    expect(events).toEqual(['slow']);
    expect(game.activeChallenge()).toBe('slow');
    expect(game.upgradeLevel('pick')).toBe(1);
    expect(game.amount('gems').isZero()).toBe(true);
    game.buy('miner');
    expect(game.rate('gold').toNumber()).toBeCloseTo(2, 9);
  });

  it('only one challenge at a time', () => {
    const { game } = build();
    expect(game.startChallenge('slow')).toBe(true);
    expect(game.startChallenge('poor')).toBe(false);
    expect(game.activeChallenge()).toBe('slow');
    expect(() => game.startChallenge('nope' as 'slow')).toThrow(/unknown challenge/);
  });

  it('completing it lifts the handicap and grants the reward permanently', () => {
    const { clock, game } = build();
    const done: Array<[string, boolean]> = [];
    game.on('challengeCompleted', (e) => done.push([e.id, e.firstTime]));
    game.startChallenge('slow');
    game.buy('miner');
    expect(game.rate('gold').toNumber()).toBeCloseTo(1, 9);
    game.add('gold', 600);
    clock.advance(200);
    game.update();
    expect(done).toEqual([['slow', true]]);
    expect(game.activeChallenge()).toBeUndefined();
    expect(game.isChallengeCompleted('slow')).toBe(true);
    expect(game.completedChallenges()).toEqual(['slow']);
    expect(game.rate('gold').toNumber()).toBeCloseTo(20, 9);
  });

  it('replaying a completed challenge does not stack the reward', () => {
    const { clock, game } = build();
    const first: boolean[] = [];
    game.on('challengeCompleted', (e) => first.push(e.firstTime));
    for (let i = 0; i < 2; i++) {
      game.startChallenge('slow');
      game.add('gold', 600);
      clock.advance(200);
      game.update();
    }
    expect(first).toEqual([true, false]);
    expect(game.completedChallenges()).toEqual(['slow']);
    game.buy('miner');
    expect(game.rate('gold').toNumber()).toBeCloseTo(20, 9);
  });

  it('exiting abandons it and resets the run', () => {
    const { game } = build();
    const exited: string[] = [];
    game.on('challengeExited', (e) => exited.push(e.id));
    expect(game.exitChallenge()).toBe(false);
    game.startChallenge('poor');
    game.add('gold', 50);
    expect(game.exitChallenge()).toBe(true);
    expect(exited).toEqual(['poor']);
    expect(game.activeChallenge()).toBeUndefined();
    expect(game.isChallengeCompleted('poor')).toBe(false);
    expect(game.amount('gold').toNumber()).toBe(100);
  });

  it('applies handicaps to offline progress too', () => {
    const { game } = build();
    game.startChallenge('slow');
    game.buy('miner');
    const before = game.amount('gold');
    game.simulateOffline(10_000);
    expect(game.amount('gold').sub(before).toNumber()).toBeCloseTo(10, 6);
  });

  it('round-trips through a save, handicap included', () => {
    const a = build();
    a.game.startChallenge('slow');
    a.game.buy('miner');
    const save = parseSave(JSON.stringify(a.game.save()));

    const b = build();
    b.game.load(save, { offline: false });
    expect(b.game.activeChallenge()).toBe('slow');
    expect(b.game.rate('gold').toNumber()).toBeCloseTo(1, 9);
  });

  it('rejects corrupted data and bad options', () => {
    const { game } = build();
    const bad = [{ active: 'ghost' }, { completed: ['ghost'] }, { completed: 'slow' }, 7];
    for (const entry of bad) {
      expect(() => game.load(createSave(1, 0, { challenges: entry }), { offline: false })).toThrow(
        SaveCorruptedError,
      );
    }
    expect(() =>
      createCore({
        plugins: [
          resources({ resources: { gold: {} } }),
          challenges({ checkIntervalMs: 0, definitions: {} }),
        ],
      }),
    ).toThrow(RangeError);
  });

  it('reset() clears progress', () => {
    const { game } = build();
    game.startChallenge('slow');
    game.reset();
    expect(game.activeChallenge()).toBeUndefined();
    expect(game.completedChallenges()).toEqual([]);
  });
});
