import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BigNum, ManualClock, SaveCorruptedError, createSave, parseSave } from '../src/index.js';
import { Game } from '../src/index.js';
import { Economy, Generator, Resource, Upgrade } from '../src/index.js';
import type { GeneratorOptions } from '../src/index.js';

const HOUR_MS = 3_600_000;

function build(
  initialGold: number | string = 100,
  options: ConstructorParameters<typeof Game>[0] = {},
) {
  const clock = new ManualClock(0);
  const game = new Game({ clock, stepMs: 100, ...options });
  const gold = game.createObject('Gold').addComponent(Resource, { initial: initialGold });
  const gems = game.createObject('Gems').addComponent(Resource);
  const miner = game.createObject('Miner').addComponent(Generator, {
    cost: { resource: gold, base: 10, growth: 1.15 },
    produces: gold,
    rate: 1,
  });
  const drill = game.createObject('Drill').addComponent(Generator, {
    cost: { resource: gold, type: 'linear', base: 100, increment: 50 },
    produces: gold,
    rate: 10,
  });
  const pick = game.createObject('Pick').addComponent(Upgrade, {
    cost: { resource: gold, base: 50, growth: 1 },
    effects: [{ generator: miner, multiplier: 2 }],
  });
  const lever = game.createObject('Lever').addComponent(Upgrade, {
    cost: { resource: gold, base: 10, growth: 2 },
    maxLevel: 3,
    effects: [{ resource: gold, multiplier: 1.5 }],
  });
  return { clock, game, gold, gems, miner, drill, pick, lever };
}

function chain(initial1 = 1, initial2 = 1) {
  const clock = new ManualClock(0);
  const game = new Game({ clock });
  const gold = game.createObject('Gold').addComponent(Resource);
  const t1 = game.createObject('T1').addComponent(Generator, {
    cost: { resource: gold, base: 1, growth: 1 },
    produces: gold,
    rate: 1,
    initial: initial1,
  });
  const t2Options: GeneratorOptions = {
    cost: { resource: gold, base: 1, growth: 1 },
    produces: t1,
    rate: 1,
    initial: initial2,
  };
  game.createObject('T2').addComponent(Generator, t2Options);
  return { game, gold, t1 };
}

describe('Resource', () => {
  it('starts at the initial amount and tracks earned', () => {
    const { gold, gems } = build();
    expect(gold.amount.toNumber()).toBe(100);
    expect(gems.amount.isZero()).toBe(true);
    gems.add(5);
    expect(gems.amount.toNumber()).toBe(5);
    expect(gems.earned.toNumber()).toBe(5);
  });

  it('spends only what is available and validates amounts', () => {
    const { gems } = build();
    gems.add(5);
    expect(gems.spend(6)).toBe(false);
    expect(gems.canAfford(5)).toBe(true);
    expect(gems.canAfford(6)).toBe(false);
    expect(gems.spend(5)).toBe(true);
    expect(gems.amount.isZero()).toBe(true);
    expect(gems.earned.toNumber()).toBe(5);
    expect(() => gems.add(-1)).toThrow(RangeError);
    expect(() => gems.spend(-1)).toThrow(RangeError);
  });

  it('reports zero rate before any generator exists', () => {
    const game = new Game({ clock: new ManualClock(0) });
    const gold = game.createObject('Gold').addComponent(Resource);
    expect(gold.rate.isZero()).toBe(true);
  });
});

describe('Economy creation', () => {
  it('is created once, automatically, by the first generator or upgrade', () => {
    const { game } = build();
    expect(game.findObjectsOfType(Economy)).toHaveLength(1);
    expect(game.find('[Economy]')).toBeDefined();
    expect(Economy.of(game)).toBe(Economy.existing(game));
  });

  it('can be created explicitly to set options', () => {
    const game = new Game({ clock: new ManualClock(0) });
    const economy = game.createObject('Economy').addComponent(Economy, { maxChain: 8 });
    const gold = game.createObject('Gold').addComponent(Resource);
    game.createObject('G').addComponent(Generator, {
      cost: { resource: gold, base: 1, growth: 1 },
      produces: gold,
      rate: 1,
    });
    expect(Economy.of(game)).toBe(economy);
    expect(game.findObjectsOfType(Economy)).toHaveLength(1);
  });
});

describe('Buying generators', () => {
  it('buys one unit and charges the cost', () => {
    const { gold, miner, game } = build();
    const events: string[] = [];
    miner.purchased.addListener((p) => events.push(`miner:${p.amount.toNumber()}`));
    Economy.of(game).purchased.addListener((p) => events.push(`economy:${p.kind}`));
    expect(miner.buy().toNumber()).toBe(1);
    expect(gold.amount.toNumber()).toBe(90);
    expect(miner.bought.toNumber()).toBe(1);
    expect(miner.count.toNumber()).toBe(1);
    expect(events).toEqual(['miner:1', 'economy:generator']);
  });

  it('x10 is all-or-nothing', () => {
    const { gold, miner } = build(100);
    expect(miner.canBuy(10)).toBe(false);
    expect(miner.buy(10).toNumber()).toBe(0);
    expect(gold.amount.toNumber()).toBe(100);
    gold.add(200);
    expect(miner.canBuy(10)).toBe(true);
    expect(miner.buy(10).toNumber()).toBe(10);
    expect(miner.bought.toNumber()).toBe(10);
  });

  it('max buys as many as affordable and leaves less than one unit of change', () => {
    const { gold, miner } = build(1000);
    const expected = miner.maxAffordable;
    const bought = miner.buy('max');
    expect(bought.eq(expected)).toBe(true);
    expect(bought.toNumber()).toBeGreaterThan(10);
    expect(gold.amount.lt(miner.nextCost)).toBe(true);
    expect(gold.amount.isNegative()).toBe(false);
    expect(miner.buy('max').isZero()).toBe(true);
  });

  it('reports costs for batches and for max', () => {
    const { miner } = build(1000);
    expect(miner.nextCost.toNumber()).toBeCloseTo(10, 9);
    expect(miner.costOf(3).toNumber()).toBeCloseTo(10 + 11.5 + 13.225, 9);
    const max = miner.maxAffordable;
    expect(miner.costOf('max').lte(1000)).toBe(true);
    expect(miner.costOf('max').eq(miner.costOf(max.toNumber()))).toBe(true);
    const poor = build(1).miner;
    expect(poor.costOf('max').toNumber()).toBeCloseTo(10, 9);
    expect(poor.canBuy('max')).toBe(false);
  });

  it('works with linear costs', () => {
    const { gold, drill } = build(1000);
    expect(drill.buy(3).toNumber()).toBe(3);
    expect(gold.amount.toNumber()).toBeCloseTo(1000 - 450, 9);
  });

  it('allows an exact-balance purchase despite float drift', () => {
    const { gold, miner } = build(0);
    for (let i = 0; i < 10; i++) gold.add(1);
    expect(miner.canBuy()).toBe(true);
    expect(miner.buy().toNumber()).toBe(1);
    expect(gold.amount.isZero()).toBe(true);
  });

  it('validates the amount and handles astronomically large balances', () => {
    const { miner } = build();
    expect(() => miner.buy(0)).toThrow(RangeError);
    expect(() => miner.buy(-2)).toThrow(RangeError);
    expect(() => miner.buy(1.5)).toThrow(RangeError);
    const rich = build('1e200');
    expect(rich.miner.buy('max').gt(1000)).toBe(true);
    expect(rich.gold.amount.isNegative()).toBe(false);
  });
});

describe('Production', () => {
  it('produces rate × count × time', () => {
    const { clock, game, gold, miner } = build(10);
    miner.buy();
    clock.advance(10_000);
    game.update();
    expect(gold.amount.toNumber()).toBeCloseTo(10, 9);
    expect(gold.earned.toNumber()).toBeCloseTo(10, 9);
    expect(gold.rate.toNumber()).toBeCloseTo(1, 12);
  });

  it('applies upgrade multipliers to generators and resources', () => {
    const { gold, miner, pick, lever } = build(1000);
    miner.buy(2);
    expect(gold.rate.toNumber()).toBeCloseTo(2, 12);
    expect(pick.buy()).toBe(true);
    expect(gold.rate.toNumber()).toBeCloseTo(4, 12);
    expect(lever.buy()).toBe(true);
    expect(gold.rate.toNumber()).toBeCloseTo(6, 12);
    expect(lever.buy()).toBe(true);
    expect(gold.rate.toNumber()).toBeCloseTo(9, 12);
    const economy = Economy.of(miner.game);
    expect(economy.multiplierOf({ generator: miner }).toNumber()).toBeCloseTo(2, 12);
    expect(economy.multiplierOf({ resource: gold }).toNumber()).toBeCloseTo(2.25, 12);
    expect(economy.multiplierOf({ all: true }).toNumber()).toBe(1);
  });

  it('enforces upgrade max level and affordability', () => {
    const { pick } = build(1000);
    expect(pick.level).toBe(0);
    expect(pick.cost?.toNumber()).toBe(50);
    expect(pick.buy()).toBe(true);
    expect(pick.cost).toBeUndefined();
    expect(pick.isMaxed).toBe(true);
    expect(pick.canBuy()).toBe(false);
    expect(pick.buy()).toBe(false);
    const poor = build(1).pick;
    expect(poor.canBuy()).toBe(false);
    expect(poor.buy()).toBe(false);
  });

  it('emits upgrade purchases', () => {
    const { lever } = build(1000);
    const seen: number[] = [];
    lever.purchased.addListener((p) => seen.push(p.level));
    lever.buy();
    lever.buy();
    expect(seen).toEqual([1, 2]);
  });

  it('applies external modifiers, static and dynamic', () => {
    const { game, gold, miner } = build(1000);
    miner.buy(4);
    const economy = Economy.of(game);
    economy.setModifier('boost', { all: true }, 3);
    expect(gold.rate.toNumber()).toBeCloseTo(12, 12);
    let factor = 10;
    economy.setModifier('dyn', { resource: gold }, () => factor);
    expect(gold.rate.toNumber()).toBeCloseTo(120, 9);
    factor = 2;
    expect(gold.rate.toNumber()).toBeCloseTo(24, 9);
    expect(economy.removeModifier('dyn')).toBe(true);
    expect(economy.removeModifier('dyn')).toBe(false);
    expect(economy.removeModifier('boost')).toBe(true);
    expect(gold.rate.toNumber()).toBeCloseTo(4, 12);
  });

  it('feeds tiered generators (a generator producing another)', () => {
    const { game, gold, t1 } = chain();
    game.advance(10_000);
    expect(t1.count.toNumber()).toBeCloseTo(11, 6);
    expect(gold.amount.toNumber()).toBeGreaterThan(59);
    expect(gold.amount.toNumber()).toBeLessThan(60.5);
  });

  it('does not produce from disabled generators or objects', () => {
    const { game, gold, miner } = build(1000);
    miner.buy(2);
    const before = gold.amount;
    miner.enabled = false;
    game.advance(1000);
    expect(gold.amount.eq(before)).toBe(true);
    miner.enabled = true;
    miner.gameObject.setActive(false);
    game.advance(1000);
    expect(gold.amount.eq(before)).toBe(true);
    miner.gameObject.setActive(true);
    game.advance(1000);
    expect(gold.amount.sub(before).toNumber()).toBeCloseTo(2, 9);
  });

  it('picks up upgrades, modifiers and their removal between ticks', () => {
    const { game, gold, miner, pick } = build(1000);
    miner.buy(2);
    const earnedOver = (ms: number): number => {
      const before = gold.amount;
      game.advance(ms);
      return gold.amount.sub(before).toNumber();
    };
    expect(earnedOver(1000)).toBeCloseTo(2, 9);
    pick.buy();
    expect(earnedOver(1000)).toBeCloseTo(4, 9);
    const economy = Economy.of(game);
    economy.setModifier('boost', { all: true }, 10);
    expect(earnedOver(1000)).toBeCloseTo(40, 9);
    economy.removeModifier('boost');
    expect(earnedOver(1000)).toBeCloseTo(4, 9);
    miner.buy();
    expect(earnedOver(1000)).toBeCloseTo(6, 9);
  });

  it('keeps working when objects are added after the first step', () => {
    const { game, gold, miner } = build(1000);
    miner.buy();
    game.advance(1000);
    const late = game.createObject('Late').addComponent(Generator, {
      cost: { resource: gold, base: 1, growth: 1 },
      produces: gold,
      rate: 5,
    });
    late.buy();
    const before = gold.amount;
    game.advance(1000);
    expect(gold.amount.sub(before).toNumber()).toBeCloseTo(6, 9);
  });
});

describe('Purchase guards', () => {
  it('forbids purchases while a guard says no, and can be removed', () => {
    const { game, gold, miner, pick } = build(1000);
    const economy = Economy.of(game);
    economy.setPurchaseGuard('lock', (target) => target !== miner && target !== pick);
    expect(miner.canBuy()).toBe(false);
    expect(miner.canBuy('max')).toBe(false);
    expect(miner.buy().isZero()).toBe(true);
    expect(miner.maxAffordable.isZero()).toBe(true);
    expect(pick.canBuy()).toBe(false);
    expect(pick.buy()).toBe(false);
    expect(gold.amount.toNumber()).toBe(1000);
    expect(economy.removePurchaseGuard('lock')).toBe(true);
    expect(economy.removePurchaseGuard('lock')).toBe(false);
    expect(miner.canBuy()).toBe(true);
  });
});

describe('Offline', () => {
  it('equals ticking for linear production', () => {
    const online = build(1000);
    online.miner.buy(5);
    online.pick.buy();
    online.game.advance(HOUR_MS);

    const away = build(1000);
    away.miner.buy(5);
    away.pick.buy();
    away.game.simulateOffline(HOUR_MS);

    const a = online.gold.amount;
    const b = away.gold.amount;
    expect(b.sub(a).abs().div(a).lt(1e-9)).toBe(true);
  });

  it('is exact for chains where fixed ticks are only approximate', () => {
    const { game, gold, t1 } = chain();
    game.simulateOffline(100_000);
    expect(gold.amount.toNumber()).toBeCloseTo(5100, 6);
    expect(t1.count.toNumber()).toBeCloseTo(101, 6);
    const ticked = chain();
    ticked.game.advance(100_000);
    expect(Math.abs(ticked.gold.amount.toNumber() - 5100) / 5100).toBeLessThan(0.01);
  });

  it('applies the global cap and efficiency', () => {
    const { game, gold, miner } = build(10, { offline: { maxMs: 10_000, efficiency: 0.5 } });
    miner.buy();
    const before = gold.amount;
    game.simulateOffline(1_000_000);
    expect(gold.amount.sub(before).toNumber()).toBeCloseTo(5, 9);
  });

  it('emits offlineGains with per-resource gains', () => {
    const { game, gold, miner } = build(1000);
    miner.buy(3);
    const gains: number[] = [];
    Economy.of(game).offlineGains.addListener(({ gains: byResource }) => {
      gains.push((byResource.get(gold) ?? BigNum.ZERO).toNumber());
    });
    game.simulateOffline(60_000);
    expect(gains).toHaveLength(1);
    expect(gains[0]).toBeCloseTo(180, 6);
  });

  it('falls back to a bounded simulation for feedback cycles', () => {
    const game = new Game({ clock: new ManualClock(0) });
    const gold = game.createObject('Gold').addComponent(Resource);
    const aObject = game.createObject('A');
    const bObject = game.createObject('B');
    const cost = { resource: gold, base: 1, growth: 1 } as const;
    const holder: { a?: Generator; b?: Generator } = {};
    holder.a = aObject.addComponent(Generator, { cost, produces: gold, rate: 0.01, initial: 1 });
    holder.b = bObject.addComponent(Generator, {
      cost,
      produces: holder.a,
      rate: 0.01,
      initial: 1,
    });
    const looped = game.createObject('Loop').addComponent(Generator, {
      cost,
      produces: holder.b,
      rate: 0.01,
      initial: 1,
    });
    expect(looped.count.toNumber()).toBe(1);
    game.simulateOffline(100_000);
    expect(holder.b.count.gt(1)).toBe(true);
  });

  it('credits offline time automatically when loading a save, and skips disabled generators', () => {
    const { clock, game, gold, miner } = build(1000);
    miner.buy(5);
    const save = game.save();
    clock.advance(2 * HOUR_MS);
    const before = gold.amount;
    game.load(save);
    expect(gold.amount.sub(before).toNumber()).toBeCloseTo(5 * 2 * 3600, 3);
    miner.enabled = false;
    const mid = gold.amount;
    game.simulateOffline(HOUR_MS);
    expect(gold.amount.eq(mid)).toBe(true);
  });

  it('tells dynamic modifiers when away-time is being credited', () => {
    const { game, gold, miner } = build(1000);
    miner.buy(2);
    const economy = Economy.of(game);
    const seen: boolean[] = [];
    economy.setModifier('probe', { all: true }, ({ offline }) => {
      seen.push(offline);
      return offline ? 1 : 3;
    });
    expect(gold.rate.toNumber()).toBeCloseTo(6, 9);
    const before = gold.amount;
    game.simulateOffline(10_000);
    expect(gold.amount.sub(before).toNumber()).toBeCloseTo(20, 6);
    expect(seen).toContain(true);
    expect(seen).toContain(false);
    expect(gold.rate.toNumber()).toBeCloseTo(6, 9);
  });

  it('matches ticking for resource-only production (property)', () => {
    const definition = fc.record({
      rate: fc.double({ min: 0.01, max: 50, noNaN: true }),
      initial: fc.integer({ min: 0, max: 200 }),
      toB: fc.boolean(),
    });
    fc.assert(
      fc.property(
        fc.array(definition, { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 1, max: 600 }),
        fc.double({ min: 0.5, max: 5, noNaN: true }),
        (defs, seconds, boost) => {
          const make = () => {
            const game = new Game({ clock: new ManualClock(0) });
            const a = game.createObject('A').addComponent(Resource);
            const b = game.createObject('B').addComponent(Resource);
            defs.forEach((d, i) => {
              game.createObject(`G${i}`).addComponent(Generator, {
                cost: { resource: a, base: 1, growth: 1 },
                produces: d.toB ? b : a,
                rate: d.rate,
                initial: d.initial,
              });
            });
            Economy.of(game).setModifier('boost', { all: true }, boost);
            return { game, a, b };
          };
          const ticked = make();
          const away = make();
          ticked.game.advance(seconds * 1000);
          away.game.simulateOffline(seconds * 1000);
          for (const key of ['a', 'b'] as const) {
            const x = ticked[key].amount;
            const y = away[key].amount;
            if (x.isZero() && y.isZero()) continue;
            expect(x.sub(y).abs().div(BigNum.max(x, y)).lt(1e-9)).toBe(true);
          }
        },
      ),
      { numRuns: 60 },
    );
  }, 30_000);
});

describe('Saves and resets', () => {
  it('round-trips the full state, including BigNum values', () => {
    const { game, gems, gold, miner, pick } = build('1e50');
    miner.buy('max');
    pick.buy();
    gems.add('3.5e12');
    const snapshot = parseSave(JSON.stringify(game.save()));
    const bought = miner.bought;
    const amount = gold.amount;

    const fresh = build(0);
    fresh.game.load(snapshot, { offline: false });
    expect(fresh.miner.bought.eq(bought)).toBe(true);
    expect(fresh.gold.amount.eq(amount)).toBe(true);
    expect(fresh.gems.amount.toString()).toBe('3.5e12');
    expect(fresh.pick.level).toBe(1);
    expect(fresh.gold.rate.eq(gold.rate)).toBe(true);
  });

  it('starts fresh when the save has no entry', () => {
    const { game, gold, miner } = build(7);
    gold.add(3);
    miner.buy();
    game.load(createSave(1, 0, {}), { offline: false });
    expect(gold.amount.toNumber()).toBe(7);
    expect(miner.bought.isZero()).toBe(true);
  });

  it('rejects malformed values and leaves state intact', () => {
    const { game, gold } = build(7);
    const bad = [
      { Gold: { Resource: { amount: 'nope', earned: '0' } } },
      { Gold: { Resource: { amount: '-5', earned: '0' } } },
      { Gold: { Resource: 5 } },
      { Pick: { Upgrade: 99 } },
      { Pick: { Upgrade: 'x' } },
      { Miner: { Generator: 'x' } },
      { Miner: { Generator: { bought: 'x', free: '0' } } },
    ];
    for (const objects of bad) {
      expect(() => game.load(createSave(1, 0, { objects }), { offline: false })).toThrow(
        SaveCorruptedError,
      );
    }
    expect(gold.amount.toNumber()).toBe(7);
  });

  it('serializes unchanged generators from cache and notices changes', () => {
    const { game, miner } = build(1000);
    miner.buy(2);
    const first = JSON.stringify(game.save().data);
    expect(JSON.stringify(game.save().data)).toBe(first);
    miner.buy();
    expect(JSON.stringify(game.save().data)).not.toBe(first);
    game.reset();
    expect(JSON.stringify(game.save().data)).toContain('"bought":"0"');
  });

  it('resetRun returns to the start, optionally keeping things', () => {
    const { game, gold, gems, miner, pick } = build(1000);
    const economy = Economy.of(game);
    miner.buy(5);
    pick.buy();
    gems.add(9);
    economy.resetRun({ resources: [gems], upgrades: [pick] });
    expect(gold.amount.toNumber()).toBe(1000);
    expect(gems.amount.toNumber()).toBe(9);
    expect(miner.bought.isZero()).toBe(true);
    expect(pick.level).toBe(1);
    expect(gold.earned.isZero()).toBe(true);

    miner.buy(2);
    economy.resetRun({ generators: [miner] });
    expect(miner.bought.toNumber()).toBe(2);
    economy.resetRun();
    expect(miner.bought.isZero()).toBe(true);
    expect(pick.level).toBe(0);
  });

  it('reset() on the game restores starting state', () => {
    const { game, gold, miner } = build(50);
    miner.buy();
    game.reset();
    expect(gold.amount.toNumber()).toBe(50);
    expect(miner.bought.isZero()).toBe(true);
  });
});
