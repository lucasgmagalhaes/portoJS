import fc from 'fast-check';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BigNum,
  ManualClock,
  SaveCorruptedError,
  createCore,
  createSave,
} from '../src/core/index.js';
import { resources } from '../src/mechanics/resources/index.js';
import type { GeneratorDef } from '../src/mechanics/resources/index.js';

const HOUR_MS = 3_600_000;

function build(initialGold: number | string = 100) {
  const clock = new ManualClock(0);
  const plugin = resources({
    resources: { gold: { initial: initialGold }, gems: {} },
    generators: {
      miner: { cost: { resource: 'gold', base: 10, growth: 1.15 }, produces: 'gold', rate: 1 },
      drill: {
        cost: { resource: 'gold', type: 'linear', base: 100, increment: 50 },
        produces: 'gold',
        rate: 10,
      },
    },
    upgrades: {
      pick: {
        cost: { resource: 'gold', base: 50, growth: 1 },
        effects: [{ generator: 'miner', multiplier: 2 }],
      },
      lever: {
        cost: { resource: 'gold', base: 10, growth: 2 },
        maxLevel: 3,
        effects: [{ resource: 'gold', multiplier: 1.5 }],
      },
    },
  });
  const game = createCore({ plugins: [plugin], clock, stepMs: 100 });
  return { clock, game };
}

describe('resources: basics and typing', () => {
  it('exposes typed ids and starting balances', () => {
    const { game } = build();
    expect(game.amount('gold').toNumber()).toBe(100);
    expect(game.amount('gems').isZero()).toBe(true);
    expect(game.resourceIds).toEqual(['gold', 'gems']);
    expect(game.generatorIds).toEqual(['miner', 'drill']);
    expectTypeOf(game.buy).parameter(0).toEqualTypeOf<'miner' | 'drill'>();
    expectTypeOf(game.amount).parameter(0).toEqualTypeOf<'gold' | 'gems'>();
  });

  it('add and spend', () => {
    const { game } = build(0);
    game.add('gold', 5);
    expect(game.amount('gold').toNumber()).toBe(5);
    expect(game.earned('gold').toNumber()).toBe(5);
    expect(game.spend('gold', 6)).toBe(false);
    expect(game.spend('gold', 5)).toBe(true);
    expect(game.amount('gold').isZero()).toBe(true);
    expect(game.earned('gold').toNumber()).toBe(5);
    expect(() => game.add('gold', -1)).toThrow(RangeError);
    expect(() => game.spend('gold', -1)).toThrow(RangeError);
  });

  it('rejects an invalid config with a clear message', () => {
    expect(() =>
      createCore({
        plugins: [
          resources({
            resources: { gold: {} },
            generators: {
              bad: {
                cost: { resource: 'gold', base: 1, growth: 1 },
                produces: 'nope' as 'gold',
                rate: 1,
              },
            },
          }),
        ],
      }),
    ).toThrow(/unknown resource "nope"/);
  });
});

describe('resources: buying', () => {
  it('buys one unit and charges the cost', () => {
    const { game } = build();
    const events: string[] = [];
    game.on('purchase', (p) => events.push(`${p.kind}:${p.id}`));
    expect(game.buy('miner').toNumber()).toBe(1);
    expect(game.amount('gold').toNumber()).toBe(90);
    expect(game.bought('miner').toNumber()).toBe(1);
    expect(game.count('miner').toNumber()).toBe(1);
    expect(events).toEqual(['generator:miner']);
  });

  it('x10 is all-or-nothing', () => {
    const { game } = build(100);
    expect(game.canBuy('miner', 10)).toBe(false);
    expect(game.buy('miner', 10).toNumber()).toBe(0);
    expect(game.amount('gold').toNumber()).toBe(100);
    game.add('gold', 200);
    expect(game.canBuy('miner', 10)).toBe(true);
    expect(game.buy('miner', 10).toNumber()).toBe(10);
    expect(game.bought('miner').toNumber()).toBe(10);
  });

  it('max buys as many as affordable and leaves less than one unit of change', () => {
    const { game } = build(1000);
    const expected = game.maxAffordable('miner');
    const bought = game.buy('miner', 'max');
    expect(bought.eq(expected)).toBe(true);
    expect(bought.toNumber()).toBeGreaterThan(10);
    expect(game.amount('gold').lt(game.cost('miner', 1))).toBe(true);
    expect(game.amount('gold').isNegative()).toBe(false);
    expect(game.buy('miner', 'max').isZero()).toBe(true);
  });

  it('reports cost for batches and for max', () => {
    const { game } = build(1000);
    expect(game.cost('miner').toNumber()).toBeCloseTo(10, 9);
    expect(game.cost('miner', 3).toNumber()).toBeCloseTo(10 + 11.5 + 13.225, 9);
    const max = game.maxAffordable('miner');
    expect(game.cost('miner', 'max').lte(1000)).toBe(true);
    expect(game.cost('miner', 'max').eq(game.cost('miner', max.toNumber()))).toBe(true);
    const poor = build(1).game;
    expect(poor.cost('miner', 'max').toNumber()).toBeCloseTo(10, 9);
  });

  it('works with linear costs', () => {
    const { game } = build(1000);
    expect(game.buy('drill', 3).toNumber()).toBe(3);
    expect(game.amount('gold').toNumber()).toBeCloseTo(1000 - 450, 9);
  });

  it('allows an exact-balance purchase despite float drift', () => {
    const { game } = build(0);
    for (let i = 0; i < 10; i++) game.add('gold', 1);
    expect(game.canBuy('miner')).toBe(true);
    expect(game.buy('miner').toNumber()).toBe(1);
    expect(game.amount('gold').isZero()).toBe(true);
  });

  it('validates the amount', () => {
    const { game } = build();
    expect(() => game.buy('miner', 0)).toThrow(RangeError);
    expect(() => game.buy('miner', -2)).toThrow(RangeError);
    expect(() => game.buy('miner', 1.5)).toThrow(RangeError);
  });

  it('handles astronomically large balances', () => {
    const { game } = build('1e200');
    const bought = game.buy('miner', 'max');
    expect(bought.gt(1000)).toBe(true);
    expect(game.amount('gold').isNegative()).toBe(false);
  });
});

describe('resources: production', () => {
  it('produces rate × count × time', () => {
    const { clock, game } = build(10);
    game.buy('miner');
    clock.advance(10_000);
    game.update();
    expect(game.amount('gold').toNumber()).toBeCloseTo(10, 9);
    expect(game.earned('gold').toNumber()).toBeCloseTo(10, 9);
    expect(game.rate('gold').toNumber()).toBeCloseTo(1, 12);
  });

  it('scales with count', () => {
    const { clock, game } = build(1000);
    game.buy('miner', 5);
    const before = game.amount('gold');
    clock.advance(1000);
    game.update();
    expect(game.amount('gold').sub(before).toNumber()).toBeCloseTo(5, 9);
    expect(game.rate('gold').toNumber()).toBeCloseTo(5, 12);
  });

  it('applies upgrade multipliers to generators and resources', () => {
    const { game } = build(1000);
    game.buy('miner', 2);
    expect(game.rate('gold').toNumber()).toBeCloseTo(2, 12);
    expect(game.buyUpgrade('pick')).toBe(true);
    expect(game.rate('gold').toNumber()).toBeCloseTo(4, 12);
    expect(game.buyUpgrade('lever')).toBe(true);
    expect(game.rate('gold').toNumber()).toBeCloseTo(6, 12);
    expect(game.buyUpgrade('lever')).toBe(true);
    expect(game.rate('gold').toNumber()).toBeCloseTo(9, 12);
    expect(game.multiplier({ generator: 'miner' }).toNumber()).toBeCloseTo(2, 12);
    expect(game.multiplier({ resource: 'gold' }).toNumber()).toBeCloseTo(2.25, 12);
  });

  it('enforces upgrade max level and affordability', () => {
    const { game } = build(1000);
    expect(game.upgradeLevel('pick')).toBe(0);
    expect(game.upgradeCost('pick')?.toNumber()).toBe(50);
    expect(game.buyUpgrade('pick')).toBe(true);
    expect(game.upgradeCost('pick')).toBeUndefined();
    expect(game.canBuyUpgrade('pick')).toBe(false);
    expect(game.buyUpgrade('pick')).toBe(false);
    const poor = build(1).game;
    expect(poor.canBuyUpgrade('pick')).toBe(false);
    expect(poor.buyUpgrade('pick')).toBe(false);
  });

  it('emits upgrade purchases', () => {
    const { game } = build(1000);
    const seen: Array<[string, number]> = [];
    game.on('purchase', (p) => {
      if (p.kind === 'upgrade') seen.push([p.id, p.level]);
    });
    game.buyUpgrade('lever');
    game.buyUpgrade('lever');
    expect(seen).toEqual([
      ['lever', 1],
      ['lever', 2],
    ]);
  });

  it('applies external modifiers, static and dynamic', () => {
    const { game } = build(1000);
    game.buy('miner', 4);
    game.setModifier('boost', { all: true }, 3);
    expect(game.rate('gold').toNumber()).toBeCloseTo(12, 12);
    let factor = 10;
    game.setModifier('dyn', { resource: 'gold' }, () => factor);
    expect(game.rate('gold').toNumber()).toBeCloseTo(120, 9);
    factor = 2;
    expect(game.rate('gold').toNumber()).toBeCloseTo(24, 9);
    expect(game.removeModifier('dyn')).toBe(true);
    expect(game.removeModifier('dyn')).toBe(false);
    expect(game.removeModifier('boost')).toBe(true);
    expect(game.rate('gold').toNumber()).toBeCloseTo(4, 12);
  });

  it('feeds tiered generators (a generator producing another)', () => {
    const clock = new ManualClock(0);
    const game = createCore({
      clock,
      plugins: [
        resources({
          resources: { gold: { initial: 0 } },
          generators: {
            t1: {
              cost: { resource: 'gold', base: 1, growth: 1 },
              produces: 'gold',
              rate: 1,
              initial: 1,
            },
            t2: {
              cost: { resource: 'gold', base: 1, growth: 1 },
              produces: { generator: 't1' },
              rate: 1,
              initial: 1,
            },
          },
        }),
      ],
    });
    clock.advance(10_000);
    game.update();
    expect(game.count('t1').toNumber()).toBeCloseTo(11, 6);
    expect(game.amount('gold').toNumber()).toBeGreaterThan(59);
    expect(game.amount('gold').toNumber()).toBeLessThan(60.5);
  });
});

describe('resources: offline', () => {
  it('equals ticking for linear production', () => {
    const online = build(1000);
    online.game.buy('miner', 5);
    online.game.buyUpgrade('pick');
    online.game.advance(3600_000);

    const offline = build(1000);
    offline.game.buy('miner', 5);
    offline.game.buyUpgrade('pick');
    offline.game.simulateOffline(HOUR_MS);

    const a = online.game.amount('gold');
    const b = offline.game.amount('gold');
    expect(b.sub(a).abs().div(a).lt(1e-9)).toBe(true);
  });

  it('is exact for chains where fixed ticks are only approximate', () => {
    const make = () => {
      const clock = new ManualClock(0);
      return createCore({
        clock,
        plugins: [
          resources({
            resources: { gold: { initial: 0 } },
            generators: {
              t1: {
                cost: { resource: 'gold', base: 1, growth: 1 },
                produces: 'gold',
                rate: 1,
                initial: 1,
              },
              t2: {
                cost: { resource: 'gold', base: 1, growth: 1 },
                produces: { generator: 't1' },
                rate: 1,
                initial: 1,
              },
            },
          }),
        ],
      });
    };
    const game = make();
    game.simulateOffline(100_000);
    expect(game.amount('gold').toNumber()).toBeCloseTo(5100, 6);
    expect(game.count('t1').toNumber()).toBeCloseTo(101, 6);
    const ticked = make();
    ticked.advance(100_000);
    expect(Math.abs(ticked.amount('gold').toNumber() - 5100) / 5100).toBeLessThan(0.01);
  });

  it('applies the global cap and efficiency', () => {
    const clock = new ManualClock(0);
    const game = createCore({
      clock,
      offline: { maxMs: 10_000, efficiency: 0.5 },
      plugins: [
        resources({
          resources: { gold: { initial: 0 } },
          generators: {
            m: {
              cost: { resource: 'gold', base: 1, growth: 1 },
              produces: 'gold',
              rate: 2,
              initial: 1,
            },
          },
        }),
      ],
    });
    game.simulateOffline(1_000_000);
    expect(game.amount('gold').toNumber()).toBeCloseTo(10, 9);
  });

  it('emits offlineGains with per-resource gains', () => {
    const { game } = build(1000);
    game.buy('miner', 3);
    const gains: number[] = [];
    game.on('offlineGains', (e) => gains.push(e.gains.gold.toNumber()));
    game.simulateOffline(60_000);
    expect(gains).toHaveLength(1);
    expect(gains[0]).toBeCloseTo(180, 6);
  });

  it('handles feedback cycles with the bounded simulation fallback', () => {
    const clock = new ManualClock(0);
    const game = createCore({
      clock,
      plugins: [
        resources({
          resources: { gold: { initial: 0 } },
          generators: {
            a: {
              cost: { resource: 'gold', base: 1, growth: 1 },
              produces: { generator: 'b' },
              rate: 0.01,
              initial: 1,
            },
            b: {
              cost: { resource: 'gold', base: 1, growth: 1 },
              produces: { generator: 'a' },
              rate: 0.01,
              initial: 1,
            },
          },
        }),
      ],
    });
    game.simulateOffline(100_000);
    expect(game.count('a').gt(1)).toBe(true);
    expect(game.count('b').gt(1)).toBe(true);
  });

  it('credits offline time automatically when loading a save', () => {
    const { clock, game } = build(1000);
    game.buy('miner', 5);
    const save = game.save();
    clock.advance(2 * HOUR_MS);
    const before = game.amount('gold');
    game.load(save);
    const gained = game.amount('gold').sub(before);
    expect(gained.toNumber()).toBeCloseTo(5 * 2 * 3600, 3);
  });
});

describe('resources: saves and reset', () => {
  it('round-trips the full state, including BigNum values', () => {
    const { game } = build('1e50');
    game.buy('miner', 'max');
    game.buyUpgrade('pick');
    game.add('gems', '3.5e12');
    const snapshot = JSON.parse(JSON.stringify(game.save()));
    const bought = game.bought('miner');
    const gold = game.amount('gold');

    const { game: fresh } = build(0);
    fresh.load(snapshot, { offline: false });
    expect(fresh.bought('miner').eq(bought)).toBe(true);
    expect(fresh.amount('gold').eq(gold)).toBe(true);
    expect(fresh.amount('gems').toString()).toBe('3.5e12');
    expect(fresh.upgradeLevel('pick')).toBe(1);
    expect(fresh.rate('gold').eq(game.rate('gold'))).toBe(true);
  });

  it('starts fresh when the save has no entry', () => {
    const { game } = build(7);
    game.add('gold', 3);
    game.load(createSave(1, 0, {}), { offline: false });
    expect(game.amount('gold').toNumber()).toBe(7);
  });

  it('ignores unknown ids and rejects malformed values', () => {
    const { game } = build(7);
    const ok = createSave(1, 0, {
      resources: { resources: { ghost: { amount: '1', earned: '1' } } },
    });
    expect(() => game.load(ok, { offline: false })).not.toThrow();

    const bad = createSave(1, 0, {
      resources: { resources: { gold: { amount: 'not a number', earned: '0' } } },
    });
    expect(() => game.load(bad, { offline: false })).toThrow(SaveCorruptedError);
    const negative = createSave(1, 0, {
      resources: { resources: { gold: { amount: '-5', earned: '0' } } },
    });
    expect(() => game.load(negative, { offline: false })).toThrow(SaveCorruptedError);
    const badLevel = createSave(1, 0, { resources: { upgrades: { pick: 99 } } });
    expect(() => game.load(badLevel, { offline: false })).toThrow(SaveCorruptedError);
    expect(game.amount('gold').toNumber()).toBe(7);
  });

  it('resetRun returns to the start, optionally keeping things', () => {
    const { game } = build(1000);
    game.buy('miner', 5);
    game.buyUpgrade('pick');
    game.add('gems', 9);
    game.resetRun({ resources: ['gems'], upgrades: ['pick'] });
    expect(game.amount('gold').toNumber()).toBe(1000);
    expect(game.amount('gems').toNumber()).toBe(9);
    expect(game.bought('miner').isZero()).toBe(true);
    expect(game.upgradeLevel('pick')).toBe(1);
    expect(game.earned('gold').isZero()).toBe(true);

    game.buy('miner', 2);
    game.resetRun({ generators: ['miner'] });
    expect(game.bought('miner').toNumber()).toBe(2);
    game.resetRun();
    expect(game.bought('miner').isZero()).toBe(true);
    expect(game.upgradeLevel('pick')).toBe(0);
  });

  it('reset() on the core restores starting state', () => {
    const { game } = build(50);
    game.buy('miner');
    game.reset();
    expect(game.amount('gold').toNumber()).toBe(50);
    expect(game.bought('miner').isZero()).toBe(true);
  });
});

describe('resources: BigNum interop', () => {
  it('returns BigNum instances', () => {
    const { game } = build();
    expect(game.amount('gold')).toBeInstanceOf(BigNum);
  });
});

describe('resources: ticking and offline agree (property)', () => {
  it('offline equals the same time played tick by tick for resource-only production', () => {
    const generator = fc.record({
      rate: fc.double({ min: 0.01, max: 50, noNaN: true }),
      initial: fc.integer({ min: 0, max: 200 }),
      target: fc.constantFrom('a', 'b'),
    });
    fc.assert(
      fc.property(
        fc.array(generator, { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 1, max: 600 }),
        fc.double({ min: 0.5, max: 5, noNaN: true }),
        (defs, seconds, boost) => {
          const generators: Record<string, GeneratorDef<'a' | 'b', string>> = {};
          defs.forEach((d, i) => {
            generators[`g${i}`] = {
              cost: { resource: 'a', base: 1, growth: 1 },
              produces: d.target,
              rate: d.rate,
              initial: d.initial,
            };
          });
          const make = () => {
            const game = createCore({
              clock: new ManualClock(0),
              plugins: [resources({ resources: { a: {}, b: {} }, generators })],
            });
            game.setModifier('boost', { all: true }, boost);
            return game;
          };
          const ticked = make();
          const away = make();
          ticked.advance(seconds * 1000);
          away.simulateOffline(seconds * 1000);
          for (const id of ['a', 'b'] as const) {
            const x = ticked.amount(id);
            const y = away.amount(id);
            if (x.isZero() && y.isZero()) continue;
            expect(x.sub(y).abs().div(BigNum.max(x, y)).lt(1e-9)).toBe(true);
          }
        },
      ),
      { numRuns: 60 },
    );
  }, 30_000);
});

describe('resources: cached production stays correct', () => {
  it('picks up upgrades, modifiers and their removal between ticks', () => {
    const { game } = build(1000);
    game.buy('miner', 2);
    const earnedOver = (ms: number): number => {
      const before = game.amount('gold');
      game.advance(ms);
      return game.amount('gold').sub(before).toNumber();
    };
    expect(earnedOver(1000)).toBeCloseTo(2, 9);
    game.buyUpgrade('pick');
    const afterUpgrade = earnedOver(1000);
    expect(afterUpgrade).toBeCloseTo(4, 9);
    game.setModifier('boost', { all: true }, 10);
    expect(earnedOver(1000)).toBeCloseTo(40, 9);
    game.removeModifier('boost');
    expect(earnedOver(1000)).toBeCloseTo(4, 9);
    game.buy('miner');
    expect(earnedOver(1000)).toBeCloseTo(6, 9);
  });

  it('serializes unchanged generators from cache and notices changes', () => {
    const { game } = build(1000);
    game.buy('miner', 2);
    const first = JSON.stringify(game.save().data);
    expect(JSON.stringify(game.save().data)).toBe(first);
    game.buy('miner');
    expect(JSON.stringify(game.save().data)).not.toBe(first);
    game.reset();
    expect(JSON.stringify(game.save().data)).toContain('"bought":"0"');
  });
});

describe('resources: modifier context', () => {
  it('tells dynamic modifiers when away-time is being credited', () => {
    const { game } = build(1000);
    game.buy('miner', 2);
    const seen: boolean[] = [];
    game.setModifier('probe', { all: true }, ({ offline }) => {
      seen.push(offline);
      return offline ? 1 : 3;
    });
    expect(game.rate('gold').toNumber()).toBeCloseTo(6, 9);
    const before = game.amount('gold');
    game.simulateOffline(10_000);
    expect(game.amount('gold').sub(before).toNumber()).toBeCloseTo(20, 6);
    expect(seen).toContain(true);
    expect(seen).toContain(false);
    expect(game.rate('gold').toNumber()).toBeCloseTo(6, 9);
  });
});
