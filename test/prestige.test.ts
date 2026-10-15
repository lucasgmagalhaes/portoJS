import { describe, expect, it } from 'vitest';
import { ManualClock, SaveCorruptedError, createCore, createSave } from '../src/core/index.js';
import { prestige } from '../src/mechanics/prestige/index.js';
import type { PrestigeConfig } from '../src/mechanics/prestige/index.js';
import { resources } from '../src/mechanics/resources/index.js';

function build(
  config: Partial<PrestigeConfig<'gold', 'miner', 'pick'>> = {},
  startGold: number | string = 0,
) {
  const clock = new ManualClock(0);
  const game = createCore({
    clock,
    plugins: [
      resources({
        resources: { gold: { initial: startGold } },
        generators: {
          miner: { cost: { resource: 'gold', base: 10, growth: 1.1 }, produces: 'gold', rate: 1 },
        },
        upgrades: {
          pick: {
            cost: { resource: 'gold', base: 5, growth: 1 },
            effects: [{ all: true, multiplier: 2 }],
          },
        },
      }),
      prestige<'gold', 'miner', 'pick'>({
        basedOn: 'gold',
        gain: { threshold: 100 },
        bonuses: [{ target: { all: true }, perPoint: 0.5 }],
        ...config,
      }),
    ],
  });
  return { clock, game };
}

describe('prestige', () => {
  it('requires the resources plugin first', () => {
    expect(() =>
      createCore({ plugins: [prestige<'gold'>({ basedOn: 'gold', gain: { threshold: 1 } })] }),
    ).toThrow(/required but not installed/);
  });

  it('computes pending points from the run total with the root preset', () => {
    const { game } = build();
    expect(game.pendingPrestige().isZero()).toBe(true);
    expect(game.canPrestige()).toBe(false);
    game.add('gold', 99);
    expect(game.canPrestige()).toBe(false);
    game.add('gold', 301); // earned 400 -> sqrt(4) = 2
    expect(game.pendingPrestige().toNumber()).toBe(2);
    expect(game.canPrestige()).toBe(true);
  });

  it('floors the reward and honours the minimum', () => {
    const { game } = build({ minimum: 3 });
    game.add('gold', 400); // 2 < minimum
    expect(game.pendingPrestige().isZero()).toBe(true);
    game.add('gold', 500); // 900 -> 3
    expect(game.pendingPrestige().toNumber()).toBe(3);
  });

  it('supports exponent, scale and custom formulas', () => {
    const preset = build({ gain: { threshold: 10, exponent: 1, scale: 2 } }).game;
    preset.add('gold', 55);
    expect(preset.pendingPrestige().toNumber()).toBe(11); // 2 * 5.5
    const custom = build({ gain: (earned) => earned.log10() }).game;
    custom.add('gold', 1000);
    expect(custom.pendingPrestige().toNumber()).toBe(3);
    const negative = build({ gain: () => -5 }).game;
    negative.add('gold', 1000);
    expect(negative.pendingPrestige().isZero()).toBe(true);
  });

  it('resets the run, grants points and emits an event', () => {
    const { game } = build({}, 0);
    game.add('gold', 1000);
    game.buy('miner', 3);
    const events: Array<[string, string, number]> = [];
    game.on('prestige', (e) => events.push([e.gained.toString(), e.points.toString(), e.count]));
    const gained = game.prestige();
    expect(gained?.toNumber()).toBe(3); // sqrt(1000/100) = 3.16 -> 3
    expect(game.prestigePoints().toNumber()).toBe(3);
    expect(game.prestigeLifetime().toNumber()).toBe(3);
    expect(game.prestigeCount()).toBe(1);
    expect(game.amount('gold').isZero()).toBe(true);
    expect(game.bought('miner').isZero()).toBe(true);
    expect(game.earned('gold').isZero()).toBe(true);
    expect(events).toEqual([['3e0', '3e0', 1]]);
  });

  it('does nothing when it cannot prestige', () => {
    const { game } = build();
    game.add('gold', 10);
    expect(game.prestige()).toBeUndefined();
    expect(game.amount('gold').toNumber()).toBe(10);
    expect(game.prestigeCount()).toBe(0);
  });

  it('keeps what the config lists', () => {
    const { game } = build({ keep: { upgrades: ['pick'] } });
    game.add('gold', 1000);
    game.buyUpgrade('pick');
    game.prestige();
    expect(game.upgradeLevel('pick')).toBe(1);
  });

  it('applies permanent bonuses that grow with points', () => {
    const { game } = build({}, 10);
    game.buy('miner'); // 1 miner
    const before = game.rate('gold').toNumber();
    expect(before).toBeCloseTo(1, 12);
    game.add('gold', 10_000);
    game.prestige(); // sqrt(10010/100) = 10 points -> +5.0 => x6
    game.add('gold', 100);
    game.buy('miner');
    expect(game.prestigePoints().toNumber()).toBe(10);
    expect(game.rate('gold').toNumber()).toBeCloseTo(6, 9);
  });

  it('supports function bonuses', () => {
    const { game } = build({
      bonuses: [{ target: { resource: 'gold' }, multiplier: (points) => points.add(1).pow(2) }],
    });
    game.add('gold', 400);
    game.prestige(); // 2 points -> x9
    game.add('gold', 20);
    game.buy('miner');
    expect(game.rate('gold').toNumber()).toBeCloseTo(9, 9);
  });

  it('spends points without touching the lifetime total', () => {
    const { game } = build();
    game.add('gold', 400);
    game.prestige();
    expect(game.spendPrestige(5)).toBe(false);
    expect(game.spendPrestige(1)).toBe(true);
    expect(game.prestigePoints().toNumber()).toBe(1);
    expect(game.prestigeLifetime().toNumber()).toBe(2);
    expect(() => game.spendPrestige(-1)).toThrow(RangeError);
  });

  it('survives a save/load round trip, restoring bonuses', () => {
    const a = build();
    a.game.add('gold', 400);
    a.game.prestige();
    a.game.add('gold', 20);
    a.game.buy('miner');
    const save = JSON.parse(JSON.stringify(a.game.save()));

    const b = build();
    b.game.load(save, { offline: false });
    expect(b.game.prestigePoints().toNumber()).toBe(2);
    expect(b.game.prestigeCount()).toBe(1);
    expect(b.game.rate('gold').eq(a.game.rate('gold'))).toBe(true);
  });

  it('rejects corrupted prestige data', () => {
    const { game } = build();
    const bad = [
      { points: 'nope' },
      { points: '-1' },
      { count: -1 },
      { count: 1.5 },
      'text',
    ] as const;
    for (const entry of bad) {
      const save = createSave(1, 0, { prestige: entry as never });
      expect(() => game.load(save, { offline: false })).toThrow(SaveCorruptedError);
    }
  });

  it('validates the preset formula', () => {
    expect(() => build({ gain: { threshold: 0 } })).toThrow(RangeError);
    expect(() => build({ gain: { threshold: 1, exponent: 0 } })).toThrow(RangeError);
  });

  it('applies to astronomically large runs', () => {
    const { game } = build({ gain: { threshold: '1e6' } });
    game.add('gold', '1e100');
    expect(game.pendingPrestige().toString()).toBe('1e47');
  });
});
