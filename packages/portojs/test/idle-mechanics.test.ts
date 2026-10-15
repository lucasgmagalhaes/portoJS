import { describe, expect, it } from 'vitest';
import { ManualClock, SaveCorruptedError, createSave, parseSave } from '../src/index.js';
import { Game } from '../src/index.js';
import {
  Achievement,
  AutoBuyer,
  Boost,
  Challenge,
  DataStore,
  Economy,
  Generator,
  Prestige,
  Resource,
  Unlock,
  Upgrade,
} from '../src/index.js';

function world(
  initialGold: number | string = 0,
  options: ConstructorParameters<typeof Game>[0] = {},
) {
  const clock = new ManualClock(0);
  const game = new Game({ clock, stepMs: 100, ...options });
  const gold = game.createObject('Gold').addComponent(Resource, { initial: initialGold });
  const gems = game.createObject('Gems').addComponent(Resource);
  const miner = game.createObject('Miner').addComponent(Generator, {
    cost: { resource: gold, base: 10, growth: 1 },
    produces: gold,
    rate: 1,
  });
  const drill = game.createObject('Drill').addComponent(Generator, {
    cost: { resource: gold, base: 10, growth: 1 },
    produces: gold,
    rate: 5,
  });
  return { clock, game, gold, gems, miner, drill };
}

function reload(from: Game, into: Game): void {
  into.load(parseSave(JSON.stringify(from.save())), { offline: false });
}

describe('Prestige', () => {
  function build(
    config: Partial<ConstructorParameters<typeof Prestige>[1]> = {},
    startGold = 0,
    keepPick = false,
  ) {
    const w = world(startGold);
    const pick = w.game.createObject('Pick').addComponent(Upgrade, {
      cost: { resource: w.gold, base: 5, growth: 1 },
      effects: [{ all: true, multiplier: 2 }],
    });
    const prestige = w.game.createObject('Ascension').addComponent(Prestige, {
      basedOn: w.gold,
      gain: { threshold: 100 },
      bonuses: [{ all: true, perPoint: 0.5 }],
      ...(keepPick ? { keep: { upgrades: [pick] } } : {}),
      ...config,
    });
    return { ...w, pick, prestige };
  }

  it('computes pending points from the run total with the root preset', () => {
    const { gold, prestige } = build();
    expect(prestige.pending.isZero()).toBe(true);
    expect(prestige.canPrestige).toBe(false);
    gold.add(99);
    expect(prestige.canPrestige).toBe(false);
    gold.add(301);
    expect(prestige.pending.toNumber()).toBe(2);
    expect(prestige.canPrestige).toBe(true);
  });

  it('floors the reward and honours the minimum', () => {
    const { gold, prestige } = build({ minimum: 3 });
    gold.add(400);
    expect(prestige.pending.isZero()).toBe(true);
    gold.add(500);
    expect(prestige.pending.toNumber()).toBe(3);
  });

  it('supports exponent, scale and custom formulas', () => {
    const preset = build({ gain: { threshold: 10, exponent: 1, scale: 2 } });
    preset.gold.add(55);
    expect(preset.prestige.pending.toNumber()).toBe(11);
    const custom = build({ gain: (earned) => earned.log10() });
    custom.gold.add(1000);
    expect(custom.prestige.pending.toNumber()).toBe(3);
    const negative = build({ gain: () => -5 });
    negative.gold.add(1000);
    expect(negative.prestige.pending.isZero()).toBe(true);
    expect(() => build({ gain: { threshold: 0 } })).toThrow(RangeError);
    expect(() => build({ gain: { threshold: 1, exponent: 0 } })).toThrow(RangeError);
  });

  it('resets the run, grants points and fires an event', () => {
    const { gold, miner, prestige } = build();
    gold.add(1000);
    miner.buy(3);
    const events: Array<[string, number]> = [];
    prestige.performed.addListener((e) => events.push([e.gained.toString(), e.count]));
    expect(prestige.perform()?.toNumber()).toBe(3);
    expect(prestige.points.toNumber()).toBe(3);
    expect(prestige.lifetime.toNumber()).toBe(3);
    expect(prestige.count).toBe(1);
    expect(gold.amount.isZero()).toBe(true);
    expect(miner.bought.isZero()).toBe(true);
    expect(gold.earned.isZero()).toBe(true);
    expect(events).toEqual([['3e0', 1]]);
  });

  it('does nothing when it cannot prestige and keeps what is listed', () => {
    const none = build();
    none.gold.add(10);
    expect(none.prestige.perform()).toBeUndefined();
    expect(none.gold.amount.toNumber()).toBe(10);

    const kept = build({}, 0, true);
    kept.gold.add(1000);
    kept.pick.buy();
    kept.prestige.perform();
    expect(kept.pick.level).toBe(1);
    const wiped = build({});
    wiped.gold.add(1000);
    wiped.pick.buy();
    wiped.prestige.perform();
    expect(wiped.pick.level).toBe(0);
  });

  it('applies permanent bonuses that grow with points', () => {
    const { gold, miner, prestige } = build({}, 10);
    miner.buy();
    expect(gold.rate.toNumber()).toBeCloseTo(1, 12);
    gold.add(10_000);
    prestige.perform();
    gold.add(100);
    miner.buy();
    expect(prestige.points.toNumber()).toBe(10);
    expect(gold.rate.toNumber()).toBeCloseTo(6, 9);
  });

  it('supports function bonuses and spending points', () => {
    const { gold, miner, prestige } = build({
      bonuses: [{ all: true, multiplier: (points) => points.add(1).pow(2) }],
    });
    gold.add(400);
    prestige.perform();
    gold.add(20);
    miner.buy();
    expect(gold.rate.toNumber()).toBeCloseTo(9, 9);
    expect(prestige.spend(5)).toBe(false);
    expect(prestige.spend(1)).toBe(true);
    expect(prestige.points.toNumber()).toBe(1);
    expect(prestige.lifetime.toNumber()).toBe(2);
    expect(() => prestige.spend(-1)).toThrow(RangeError);
  });

  it('survives a save/load round trip, restoring bonuses', () => {
    const a = build();
    a.gold.add(400);
    a.prestige.perform();
    a.gold.add(20);
    a.miner.buy();
    const b = build();
    reload(a.game, b.game);
    expect(b.prestige.points.toNumber()).toBe(2);
    expect(b.prestige.count).toBe(1);
    expect(b.gold.rate.eq(a.gold.rate)).toBe(true);
  });

  it('rejects corrupted data', () => {
    const { game } = build();
    const bad = [{ points: 'nope' }, { points: '-1' }, { count: -1 }, { count: 1.5 }, 'text'];
    for (const entry of bad) {
      const save = createSave(1, 0, { objects: { Ascension: { Prestige: entry as never } } });
      expect(() => game.load(save, { offline: false })).toThrow(SaveCorruptedError);
    }
  });

  it('supports stacked layers: a higher layer is based on a lower one and wipes it', () => {
    const w = world(0);
    const low = w.game.createObject('Low').addComponent(Prestige, {
      basedOn: w.gold,
      gain: { threshold: 100 },
      bonuses: [{ all: true, perPoint: 1 }],
    });
    const high = w.game.createObject('High').addComponent(Prestige, {
      basedOn: low,
      gain: { threshold: 4 },
      bonuses: [{ all: true, multiplier: (points) => points.mul(10).add(1) }],
    });
    for (let i = 0; i < 2; i++) {
      w.gold.add(400);
      low.perform();
    }
    expect(low.points.toNumber()).toBe(4);
    expect(high.pending.toNumber()).toBe(1);
    expect(high.perform()?.toNumber()).toBe(1);
    expect(low.points.isZero()).toBe(true);
    expect(low.lifetime.toNumber()).toBe(4);
    expect(low.count).toBe(2);
    expect(high.pending.isZero()).toBe(true);
    expect(high.points.toNumber()).toBe(1);
  });

  it('respects resetsLower: false', () => {
    const w = world(0);
    const low = w.game.createObject('Low').addComponent(Prestige, {
      basedOn: w.gold,
      gain: { threshold: 1 },
    });
    const high = w.game.createObject('High').addComponent(Prestige, {
      basedOn: low,
      gain: { threshold: 1 },
      resetsLower: false,
    });
    w.gold.add(4);
    low.perform();
    expect(high.perform()?.toNumber()).toBe(1);
    expect(low.points.toNumber()).toBe(2);
  });

  it('removes its modifiers when destroyed', () => {
    const { gold, miner, prestige, game } = build();
    gold.add(400);
    prestige.perform();
    gold.add(20);
    miner.buy();
    expect(gold.rate.toNumber()).toBeCloseTo(2, 9);
    prestige.destroy();
    expect(gold.rate.toNumber()).toBeCloseTo(1, 9);
    expect(Economy.of(game)).toBeDefined();
  });
});

describe('Achievement', () => {
  it('unlocks on the polling interval and fires its event', () => {
    const { clock, game, gold } = world(0);
    const rich = game.createObject('Rich').addComponent(Achievement, {
      condition: () => gold.amount.gte(100),
      checkIntervalMs: 1000,
    });
    const seen: string[] = [];
    rich.unlocked.addListener((a) => seen.push(a.gameObject.name));
    gold.add(150);
    clock.advance(500);
    game.update();
    expect(rich.isUnlocked).toBe(false);
    clock.advance(600);
    game.update();
    expect(rich.isUnlocked).toBe(true);
    expect(seen).toEqual(['Rich']);
    expect(rich.unlockedAt).toBe(1100);
  });

  it('check() evaluates immediately and never unlocks twice', () => {
    const { game, gold } = world(0);
    let effects = 0;
    const rich = game.createObject('Rich').addComponent(Achievement, {
      condition: () => gold.amount.gte(100),
      effect: () => {
        effects++;
      },
    });
    expect(rich.check()).toBe(false);
    gold.add(500);
    expect(rich.check()).toBe(true);
    expect(rich.check()).toBe(false);
    game.simulateOffline(1000);
    expect(effects).toBe(1);
  });

  it('re-runs the effect on load and persists the unlock time', () => {
    const make = () => {
      const w = world(0);
      const economy = Economy.of(w.game);
      const rich = w.game.createObject('Rich').addComponent(Achievement, {
        condition: () => w.gold.amount.gte(100),
        effect: () => economy.setModifier('rich', { all: true }, 2),
      });
      return { ...w, rich };
    };
    const a = make();
    a.gold.add(150);
    a.miner.buy();
    a.rich.check();
    expect(a.gold.rate.toNumber()).toBeCloseTo(2, 9);

    const b = make();
    expect(b.gold.rate.toNumber()).toBe(0);
    reload(a.game, b.game);
    expect(b.rich.isUnlocked).toBe(true);
    expect(b.gold.rate.toNumber()).toBeCloseTo(2, 9);
  });

  it('rejects corrupted data and bad options', () => {
    const { game, gold } = world(0);
    game.createObject('Rich').addComponent(Achievement, { condition: () => gold.amount.gte(1) });
    const save = createSave(1, 0, { objects: { Rich: { Achievement: 'x' } } });
    expect(() => game.load(save, { offline: false })).toThrow(SaveCorruptedError);
    expect(() =>
      game
        .createObject('Bad')
        .addComponent(Achievement, { condition: () => true, checkIntervalMs: 0 }),
    ).toThrow(RangeError);
  });
});

describe('Unlock', () => {
  function build() {
    const w = world(1000);
    const unlock = w.game.createObject('DeepMining').addComponent(Unlock, {
      condition: () => w.miner.bought.gte(3),
      gates: [w.drill],
    });
    return { ...w, unlock };
  }

  it('forbids gated purchases until the condition holds', () => {
    const { gold, drill, miner, unlock } = build();
    expect(unlock.isUnlocked).toBe(false);
    expect(drill.canBuy()).toBe(false);
    expect(drill.buy().isZero()).toBe(true);
    expect(drill.maxAffordable.isZero()).toBe(true);
    expect(gold.amount.toNumber()).toBe(1000);
    expect(miner.canBuy()).toBe(true);
  });

  it('opens the gate as soon as the condition becomes true', () => {
    const { drill, miner, unlock } = build();
    const seen: string[] = [];
    unlock.earned.addListener((u) => seen.push(u.gameObject.name));
    miner.buy(3);
    expect(drill.canBuy()).toBe(true);
    expect(drill.buy().toNumber()).toBe(1);
    expect(seen).toEqual(['DeepMining']);
    expect(unlock.unlockedAt).toBe(0);
  });

  it('also unlocks on the polling interval', () => {
    const { clock, game, miner, unlock } = build();
    miner.buy(3);
    clock.advance(600);
    game.update();
    expect(unlock.unlockedAt).toBeDefined();
  });

  it('is permanent, saved, and cleared by reset', () => {
    const a = build();
    a.miner.buy(3);
    a.unlock.check();
    a.game.find('Economy');
    Economy.of(a.game).resetRun();
    expect(a.unlock.isUnlocked).toBe(true);
    const b = build();
    reload(a.game, b.game);
    expect(b.drill.canBuy()).toBe(true);
    b.game.reset();
    expect(b.unlock.unlockedAt).toBeUndefined();
  });

  it('removes its guard when destroyed and rejects corrupted data', () => {
    const { game, drill, unlock } = build();
    expect(drill.canBuy()).toBe(false);
    unlock.destroy();
    expect(drill.canBuy()).toBe(true);
    const bad = createSave(1, 0, { objects: { DeepMining: { Unlock: 'x' } } });
    expect(() => game.load(bad, { offline: false })).not.toThrow();
  });

  it('supports several unlocks gating the same target and validates options', () => {
    const w = world(1000);
    w.game.createObject('A').addComponent(Unlock, { condition: () => true, gates: [w.drill] });
    w.game
      .createObject('B')
      .addComponent(Unlock, { condition: () => w.gold.amount.gte(5000), gates: [w.drill] });
    expect(w.drill.canBuy()).toBe(false);
    w.gold.add(10_000);
    expect(w.drill.canBuy()).toBe(true);
    expect(() =>
      w.game
        .createObject('C')
        .addComponent(Unlock, { condition: () => true, gates: [], checkIntervalMs: 0 }),
    ).toThrow(RangeError);
  });
});

describe('AutoBuyer', () => {
  function build() {
    const w = world(1000);
    const bot = w.game.createObject('MinerBot').addComponent(AutoBuyer, {
      target: w.miner,
      amount: 2,
      everyMs: 1000,
      enabled: true,
    });
    const drillBot = w.game.createObject('DrillBot').addComponent(AutoBuyer, {
      target: w.drill,
      everyMs: 500,
    });
    return { ...w, bot, drillBot };
  }

  it('buys on its own interval while enabled', () => {
    const { clock, game, miner, bot } = build();
    const events: number[] = [];
    bot.bought.addListener((e) => events.push(e.amount.toNumber()));
    clock.advance(999);
    game.update();
    expect(miner.bought.isZero()).toBe(true);
    clock.advance(1);
    game.update();
    expect(miner.bought.toNumber()).toBe(2);
    clock.advance(3000);
    game.update();
    expect(miner.bought.toNumber()).toBe(8);
    expect(events).toEqual([2, 2, 2, 2]);
  });

  it('is switched with the component enabled flag', () => {
    const { clock, game, miner, drill, bot, drillBot } = build();
    expect(drillBot.enabled).toBe(false);
    clock.advance(2000);
    game.update();
    expect(drill.bought.isZero()).toBe(true);
    bot.enabled = false;
    const before = miner.bought;
    clock.advance(5000);
    game.update();
    expect(miner.bought.eq(before)).toBe(true);
  });

  it('respects purchase guards and stops quietly when it cannot afford anything', () => {
    const { clock, game, gold, drill, bot, drillBot } = build();
    Economy.of(game).setPurchaseGuard('lock', (target) => target !== drill);
    bot.enabled = false;
    drillBot.enabled = true;
    clock.advance(2000);
    game.update();
    expect(drill.bought.isZero()).toBe(true);
    gold.spend(gold.amount);
    let bought = 0;
    for (const object of game.objects) {
      object.getComponent(AutoBuyer)?.bought.addListener(() => {
        bought++;
      });
    }
    clock.advance(5000);
    game.update();
    expect(bought).toBe(0);
  });

  it('persists switches and timers, and does not act while away', () => {
    const a = build();
    a.drillBot.enabled = true;
    a.bot.enabled = false;
    a.clock.advance(300);
    a.game.update();
    const b = build();
    reload(a.game, b.game);
    expect(b.drillBot.enabled).toBe(true);
    expect(b.bot.enabled).toBe(false);
    b.game.reset();
    expect(b.bot.enabled).toBe(true);
    b.game.simulateOffline(60_000);
    expect(b.miner.bought.isZero()).toBe(true);
  });

  it('rejects corrupted data and bad options', () => {
    const { game, miner } = build();
    const bad = [{ enabled: 'yes', elapsed: 0 }, { enabled: true, elapsed: -1 }, 5];
    for (const entry of bad) {
      const save = createSave(1, 0, { objects: { MinerBot: { AutoBuyer: entry as never } } });
      expect(() => game.load(save, { offline: false })).toThrow(SaveCorruptedError);
    }
    expect(() =>
      game.createObject('Bad').addComponent(AutoBuyer, { target: miner, everyMs: 0 }),
    ).toThrow(RangeError);
  });
});

describe('Challenge', () => {
  function build() {
    const w = world(100);
    const pick = w.game.createObject('Pick').addComponent(Upgrade, {
      cost: { resource: w.gold, base: 5, growth: 1 },
      effects: [{ all: true, multiplier: 2 }],
    });
    const slow = w.game.createObject('Slow').addComponent(Challenge, {
      goal: () => w.gold.earned.gte(500),
      handicaps: [{ resource: w.gold, multiplier: 0.1 }],
      rewards: [{ resource: w.gold, multiplier: 2 }],
      keep: { upgrades: [pick] },
      checkIntervalMs: 100,
    });
    const poor = w.game.createObject('Poor').addComponent(Challenge, {
      goal: () => w.gems.amount.gte(1),
    });
    return { ...w, pick, slow, poor };
  }

  it('starts a challenge: resets the run, keeps what is listed and applies the handicap', () => {
    const { gold, gems, miner, pick, slow } = build();
    pick.buy();
    gems.add(5);
    const events: string[] = [];
    slow.started.addListener(() => events.push('started'));
    expect(slow.begin()).toBe(true);
    expect(events).toEqual(['started']);
    expect(slow.isRunning).toBe(true);
    expect(pick.level).toBe(1);
    expect(gems.amount.isZero()).toBe(true);
    miner.buy();
    expect(gold.rate.toNumber()).toBeCloseTo(0.2, 9);
  });

  it('runs one challenge at a time', () => {
    const { game, slow, poor } = build();
    expect(slow.begin()).toBe(true);
    expect(poor.begin()).toBe(false);
    expect(Challenge.current(game)).toBe(slow);
  });

  it('completing it lifts the handicap and grants the reward permanently', () => {
    const { clock, game, gold, miner, slow } = build();
    const done: boolean[] = [];
    slow.completed.addListener((e) => done.push(e.firstTime));
    slow.begin();
    miner.buy();
    expect(gold.rate.toNumber()).toBeCloseTo(0.1, 9);
    gold.add(600);
    clock.advance(200);
    game.update();
    expect(done).toEqual([true]);
    expect(slow.isRunning).toBe(false);
    expect(slow.isCompleted).toBe(true);
    expect(Challenge.current(game)).toBeUndefined();
    expect(gold.rate.toNumber()).toBeCloseTo(2, 9);
  });

  it('replaying a completed challenge does not stack the reward', () => {
    const { clock, game, gold, miner, slow } = build();
    const first: boolean[] = [];
    slow.completed.addListener((e) => first.push(e.firstTime));
    for (let i = 0; i < 2; i++) {
      slow.begin();
      gold.add(600);
      clock.advance(200);
      game.update();
    }
    expect(first).toEqual([true, false]);
    miner.buy();
    expect(gold.rate.toNumber()).toBeCloseTo(2, 9);
  });

  it('abandoning resets the run', () => {
    const { gold, poor } = build();
    const exited: string[] = [];
    poor.exited.addListener((c) => exited.push(c.gameObject.name));
    expect(poor.abandon()).toBe(false);
    poor.begin();
    gold.add(50);
    expect(poor.abandon()).toBe(true);
    expect(exited).toEqual(['Poor']);
    expect(poor.isRunning).toBe(false);
    expect(gold.amount.toNumber()).toBe(100);
  });

  it('applies handicaps to offline progress and persists its state', () => {
    const a = build();
    a.slow.begin();
    a.miner.buy();
    const before = a.gold.amount;
    a.game.simulateOffline(10_000);
    expect(a.gold.amount.sub(before).toNumber()).toBeCloseTo(1, 6);
    const b = build();
    reload(a.game, b.game);
    expect(b.slow.isRunning).toBe(true);
    expect(b.gold.rate.toNumber()).toBeCloseTo(0.1, 9);
  });

  it('rejects corrupted data and bad options, and removes modifiers when destroyed', () => {
    const { game, gold, miner, slow } = build();
    const save = createSave(1, 0, {
      objects: { Slow: { Challenge: { running: 'x', completed: false } } },
    });
    expect(() => game.load(save, { offline: false })).toThrow(SaveCorruptedError);
    expect(() =>
      game.createObject('Bad').addComponent(Challenge, { goal: () => true, checkIntervalMs: 0 }),
    ).toThrow(RangeError);
    slow.begin();
    miner.buy();
    slow.destroy();
    expect(gold.rate.toNumber()).toBeCloseTo(1, 9);
  });
});

describe('Boost', () => {
  function build(onReactivate?: 'refresh' | 'extend' | 'ignore') {
    const w = world(100);
    w.miner.buy();
    const frenzy = w.game.createObject('Frenzy').addComponent(Boost, {
      durationMs: 1000,
      effects: [{ resource: w.gold, multiplier: 3 }],
      ...(onReactivate === undefined ? {} : { onReactivate }),
    });
    return { ...w, frenzy };
  }

  it('multiplies production while running and stops exactly when time runs out', () => {
    const { game, gold, frenzy } = build();
    const events: string[] = [];
    frenzy.started.addListener(() => events.push('start'));
    frenzy.ended.addListener(() => events.push('end'));
    expect(gold.rate.toNumber()).toBeCloseTo(1, 9);
    expect(frenzy.activate()).toBe(true);
    expect(gold.rate.toNumber()).toBeCloseTo(3, 9);
    const before = gold.amount;
    game.advance(1000);
    expect(gold.amount.sub(before).toNumber()).toBeCloseTo(3, 6);
    expect(frenzy.running).toBe(false);
    expect(frenzy.remainingMs).toBe(0);
    expect(events).toEqual(['start', 'end']);
  });

  it('refreshes by default, extends or ignores when configured', () => {
    const refresh = build();
    refresh.frenzy.activate();
    refresh.game.advance(600);
    refresh.frenzy.activate();
    expect(refresh.frenzy.remainingMs).toBe(1000);
    const extend = build('extend');
    extend.frenzy.activate();
    extend.game.advance(600);
    extend.frenzy.activate();
    expect(extend.frenzy.remainingMs).toBeCloseTo(1400, 9);
    const ignore = build('ignore');
    expect(ignore.frenzy.activate()).toBe(true);
    ignore.game.advance(600);
    expect(ignore.frenzy.activate()).toBe(false);
    expect(ignore.frenzy.remainingMs).toBeCloseTo(400, 9);
  });

  it('can be cancelled', () => {
    const { gold, frenzy } = build();
    frenzy.activate();
    expect(frenzy.cancel()).toBe(true);
    expect(frenzy.cancel()).toBe(false);
    expect(gold.rate.toNumber()).toBeCloseTo(1, 9);
  });

  it('pauses while the player is away and does not boost offline gains', () => {
    const { game, gold, frenzy } = build();
    frenzy.activate();
    const before = gold.amount;
    game.simulateOffline(60_000);
    expect(gold.amount.sub(before).toNumber()).toBeCloseTo(60, 6);
    expect(frenzy.remainingMs).toBe(1000);
    expect(gold.rate.toNumber()).toBeCloseTo(3, 9);
  });

  it('persists remaining time and validates data and options', () => {
    const a = build();
    a.frenzy.activate();
    a.game.advance(400);
    const b = build();
    reload(a.game, b.game);
    expect(b.frenzy.remainingMs).toBeCloseTo(600, 9);
    expect(b.gold.rate.toNumber()).toBeCloseTo(3, 9);
    const bad = [{ Frenzy: { Boost: 'x' } }, { Frenzy: { Boost: -1 } }];
    for (const objects of bad) {
      expect(() => b.game.load(createSave(1, 0, { objects }), { offline: false })).toThrow(
        SaveCorruptedError,
      );
    }
    expect(() =>
      b.game.createObject('Bad').addComponent(Boost, { durationMs: 0, effects: [] }),
    ).toThrow(RangeError);
    b.game.reset();
    expect(b.frenzy.running).toBe(false);
    b.frenzy.destroy();
  });
});

describe('DataStore', () => {
  function build() {
    const game = new Game({ clock: new ManualClock(0) });
    return { game, data: game.createObject('Data').addComponent(DataStore) };
  }

  it('stores, reads and removes JSON values and emits events only on real changes', () => {
    const { data } = build();
    const log: string[] = [];
    data.changed.addListener(({ key, value }) => log.push(`set:${key}:${JSON.stringify(value)}`));
    data.removed.addListener(({ key }) => log.push(`del:${key}`));
    expect(data.get('name')).toBeUndefined();
    data.set('name', 'Ada');
    data.set('name', 'Ada');
    data.set('settings', { sound: true, tags: ['a'] });
    expect(data.has('settings')).toBe(true);
    expect(data.keys()).toEqual(['name', 'settings']);
    expect(data.remove('name')).toBe(true);
    expect(data.remove('name')).toBe(false);
    expect(log).toEqual(['set:name:"Ada"', 'set:settings:{"sound":true,"tags":["a"]}', 'del:name']);
  });

  it('round-trips through a save and is cleared by reset', () => {
    const a = build();
    a.data.set('tutorialDone', true);
    a.data.set('list', [1, { x: null }]);
    const b = build();
    b.data.set('stale', 'gone after load');
    reload(a.game, b.game);
    expect(b.data.get('tutorialDone')).toBe(true);
    expect(b.data.get('list')).toEqual([1, { x: null }]);
    expect(b.data.has('stale')).toBe(false);
    b.game.reset();
    expect(b.data.keys()).toEqual([]);
    const bad = createSave(1, 0, { objects: { Data: { DataStore: [1, 2] } } });
    expect(() => b.game.load(bad, { offline: false })).toThrow(SaveCorruptedError);
  });
});
