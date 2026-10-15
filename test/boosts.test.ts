import { describe, expect, it } from 'vitest';
import { ManualClock, SaveCorruptedError, createCore, createSave } from '../src/core/index.js';
import { boosts, resources } from '../src/mechanics/index.js';

function build(onReactivate?: 'refresh' | 'extend' | 'ignore') {
  const clock = new ManualClock(0);
  const game = createCore({
    clock,
    plugins: [
      resources({
        resources: { gold: { initial: 100 } },
        generators: {
          miner: { cost: { resource: 'gold', base: 10, growth: 1 }, produces: 'gold', rate: 10 },
        },
      }),
      boosts<'gold', 'miner', 'frenzy'>({
        definitions: {
          frenzy: {
            durationMs: 1000,
            effects: [{ resource: 'gold', multiplier: 3 }],
            ...(onReactivate === undefined ? {} : { onReactivate }),
          },
        },
      }),
    ],
  });
  game.buy('miner');
  return { clock, game };
}

describe('boosts', () => {
  it('multiplies production while active and stops exactly when time runs out', () => {
    const { game } = build();
    const events: string[] = [];
    game.on('boostStarted', (e) => events.push(`start:${e.remainingMs}`));
    game.on('boostEnded', (e) => events.push(`end:${e.id}`));
    expect(game.rate('gold').toNumber()).toBeCloseTo(10, 9);
    expect(game.activateBoost('frenzy')).toBe(true);
    expect(game.rate('gold').toNumber()).toBeCloseTo(30, 9);
    expect(game.activeBoosts()).toEqual(['frenzy']);
    const before = game.amount('gold');
    game.advance(1000); // 10 steps of 100 ms, all boosted
    expect(game.amount('gold').sub(before).toNumber()).toBeCloseTo(30, 6);
    expect(game.isBoostActive('frenzy')).toBe(false);
    expect(game.boostRemainingMs('frenzy')).toBe(0);
    expect(game.rate('gold').toNumber()).toBeCloseTo(10, 9);
    expect(events).toEqual(['start:1000', 'end:frenzy']);
  });

  it('reports remaining time', () => {
    const { game } = build();
    game.activateBoost('frenzy');
    game.advance(300);
    expect(game.boostRemainingMs('frenzy')).toBeCloseTo(700, 9);
  });

  it('refreshes by default, extends or ignores when configured', () => {
    const refresh = build();
    refresh.game.activateBoost('frenzy');
    refresh.game.advance(600);
    refresh.game.activateBoost('frenzy');
    expect(refresh.game.boostRemainingMs('frenzy')).toBe(1000);

    const extend = build('extend');
    extend.game.activateBoost('frenzy');
    extend.game.advance(600);
    extend.game.activateBoost('frenzy');
    expect(extend.game.boostRemainingMs('frenzy')).toBeCloseTo(1400, 9);

    const ignore = build('ignore');
    expect(ignore.game.activateBoost('frenzy')).toBe(true);
    ignore.game.advance(600);
    expect(ignore.game.activateBoost('frenzy')).toBe(false);
    expect(ignore.game.boostRemainingMs('frenzy')).toBeCloseTo(400, 9);
  });

  it('can be cancelled', () => {
    const { game } = build();
    game.activateBoost('frenzy');
    expect(game.cancelBoost('frenzy')).toBe(true);
    expect(game.cancelBoost('frenzy')).toBe(false);
    expect(game.rate('gold').toNumber()).toBeCloseTo(10, 9);
  });

  it('pauses while the player is away and does not boost offline gains', () => {
    const { game } = build();
    game.activateBoost('frenzy');
    const before = game.amount('gold');
    game.simulateOffline(60_000);
    expect(game.amount('gold').sub(before).toNumber()).toBeCloseTo(600, 6); // 10/s, no boost
    expect(game.boostRemainingMs('frenzy')).toBe(1000); // untouched
    expect(game.rate('gold').toNumber()).toBeCloseTo(30, 9); // boost still there live
  });

  it('persists remaining time', () => {
    const a = build();
    a.game.activateBoost('frenzy');
    a.game.advance(400);
    const save = JSON.parse(JSON.stringify(a.game.save()));
    const b = build();
    b.game.load(save, { offline: false });
    expect(b.game.boostRemainingMs('frenzy')).toBeCloseTo(600, 9);
    expect(b.game.rate('gold').toNumber()).toBeCloseTo(30, 9);
  });

  it('validates ids, data and options', () => {
    const { game } = build();
    expect(() => game.activateBoost('nope' as 'frenzy')).toThrow(/unknown boost/);
    expect(() => game.isBoostActive('nope' as 'frenzy')).toThrow(/unknown boost/);
    for (const entry of [{ frenzy: 'x' }, { frenzy: -1 }, 4]) {
      expect(() =>
        game.load(createSave(1, 0, { boosts: entry as never }), { offline: false }),
      ).toThrow(SaveCorruptedError);
    }
    expect(() =>
      createCore({
        plugins: [
          resources({ resources: { gold: {} } }),
          boosts({ definitions: { b: { durationMs: 0, effects: [] } } }),
        ],
      }),
    ).toThrow(RangeError);
  });

  it('reset() clears active boosts', () => {
    const { game } = build();
    game.activateBoost('frenzy');
    game.reset();
    expect(game.activeBoosts()).toEqual([]);
  });
});
