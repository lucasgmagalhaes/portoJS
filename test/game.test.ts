import { parseSave } from '../src/core/index.js';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ManualClock,
  autoBuyers,
  challenges,
  createGame,
  definePlugin,
  unlocks,
} from '../src/index.js';
import type { BigNum, ResourcesApi, Scheduler } from '../src/index.js';

function fakeScheduler(): { scheduler: Scheduler; fire: () => void } {
  let callback: (() => void) | undefined;
  return {
    scheduler: {
      start(cb) {
        callback = cb;
        return () => {
          callback = undefined;
        };
      },
    },
    fire: () => callback?.(),
  };
}

describe('createGame: minimal usage from the README', () => {
  it('runs the documented flow end to end', () => {
    const clock = new ManualClock(0);
    const fake = fakeScheduler();
    const game = createGame({
      clock,
      scheduler: fake.scheduler,
      resources: { gold: { initial: 10 } },
      generators: {
        miner: { cost: { resource: 'gold', base: 10, growth: 1.15 }, produces: 'gold', rate: 1 },
      },
    });

    game.start();
    game.buy('miner');
    clock.advance(10_000);
    fake.fire();
    expect(game.amount('gold').toNumber()).toBeCloseTo(10, 9);

    game.add('gold', 100);
    game.buy('miner', 5);
    const save = game.save();
    const goldAtSave = game.amount('gold');
    game.buy('miner', 'max');
    game.load(save, { offline: false });
    expect(game.amount('gold').eq(goldAtSave)).toBe(true);
    expect(game.bought('miner').toNumber()).toBe(6);
    game.stop();
  });

  it('credits offline progress when loading an old save', () => {
    const clock = new ManualClock(0);
    const game = createGame({
      clock,
      offline: { maxMs: 3_600_000, efficiency: 0.5 },
      resources: { gold: { initial: 10 } },
      generators: {
        miner: { cost: { resource: 'gold', base: 10, growth: 1.15 }, produces: 'gold', rate: 2 },
      },
    });
    game.buy('miner');
    const save = game.exportSave();
    clock.advance(10 * 3_600_000);
    const report = game.importSave(save);
    expect(report?.status).toBe('capped');
    expect(game.amount('gold').toNumber()).toBeCloseTo(2 * 1800, 3);
  });

  it('is deterministic across identical runs', () => {
    const run = (): string => {
      const clock = new ManualClock(0);
      const game = createGame({
        clock,
        resources: { gold: { initial: 100 } },
        generators: {
          miner: { cost: { resource: 'gold', base: 10, growth: 1.15 }, produces: 'gold', rate: 1 },
        },
      });
      for (const ms of [130, 2_000, 17, 5_000, 333]) {
        clock.advance(ms);
        game.update();
        game.buy('miner', 'max');
      }
      return game.exportSave();
    };
    expect(run()).toBe(run());
  });
});

describe('createGame: full feature set', () => {
  function make() {
    const clock = new ManualClock(0);
    const game = createGame({
      clock,
      resources: { gold: { initial: 0 }, gems: {} },
      generators: {
        miner: { cost: { resource: 'gold', base: 1, growth: 1 }, produces: 'gold', rate: 1 },
      },
      upgrades: {
        pick: {
          cost: { resource: 'gold', base: 5, growth: 1 },
          effects: [{ all: true, multiplier: 2 }],
        },
      },
      prestige: {
        basedOn: 'gold',
        gain: { threshold: 100 },
        keep: { upgrades: ['pick'] },
        bonuses: [{ target: { all: true }, perPoint: 1 }],
      },
      achievements: {
        firstPrestige: { condition: (g) => g.prestigeCount() >= 1 },
        richer: { condition: (g) => g.amount('gold').gte(50) },
      },
      achievementCheckIntervalMs: 100,
    });
    return { clock, game };
  }

  it('merges every feature into one typed object', () => {
    const { game } = make();
    expectTypeOf(game.prestige).toBeFunction();
    expectTypeOf(game.hasAchievement).parameter(0).toEqualTypeOf<'firstPrestige' | 'richer'>();
    expectTypeOf(game.buy).parameter(0).toEqualTypeOf<'miner'>();
    expectTypeOf(game.amount('gold')).toEqualTypeOf<BigNum>();
  });

  it('plays a prestige loop with achievements', () => {
    const { clock, game } = make();
    const unlocked: string[] = [];
    game.on('achievementUnlocked', (e) => unlocked.push(e.id));
    game.add('gold', 60);
    game.buy('miner');
    clock.advance(200);
    game.update();
    expect(unlocked).toEqual(['richer']);

    game.add('gold', 440);
    expect(game.canPrestige()).toBe(true);
    game.buyUpgrade('pick');
    const gained = game.prestige();
    expect(gained?.toNumber()).toBe(2);
    clock.advance(200);
    game.update();
    expect(unlocked).toEqual(['richer', 'firstPrestige']);
    expect(game.upgradeLevel('pick')).toBe(1);
    expect(game.bought('miner').isZero()).toBe(true);
    expect(game.multiplier({ all: true }).gt(2)).toBe(true);
  });

  it('round-trips everything through an exported string', () => {
    const a = make();
    a.game.add('gold', 500);
    a.game.prestige();
    a.clock.advance(300);
    a.game.update();
    const text = a.game.exportSave();

    const b = make();
    b.game.importSave(text, { offline: false });
    expect(b.game.prestigeCount()).toBe(a.game.prestigeCount());
    expect(b.game.prestigePoints().eq(a.game.prestigePoints())).toBe(true);
    expect(b.game.hasAchievement('firstPrestige')).toBe(a.game.hasAchievement('firstPrestige'));
  });
});

describe('createGame: offline tuning', () => {
  it('passes chain and step limits to the resources plugin', () => {
    const clock = new ManualClock(0);
    const game = createGame({
      clock,
      offline: { maxChain: 1, maxSteps: 10 },
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
    });
    game.simulateOffline(10_000);
    expect(game.amount('gold').gt(0)).toBe(true);
    expect(game.count('t1').gt(1)).toBe(true);
  });

  it('works with only maxSteps set', () => {
    const game = createGame({
      clock: new ManualClock(0),
      offline: { maxSteps: 5 },
      resources: { gold: { initial: 0 } },
    });
    expect(() => game.simulateOffline(1000)).not.toThrow();
  });
});

describe('createGame: extra plugins', () => {
  interface TipApi {
    readonly tipsGiven: number;
    tip(amount: number): boolean;
  }

  const tips = definePlugin<TipApi, { tipped: { amount: number } }>('tips', (kernel) => {
    const wallet = kernel.require<ResourcesApi<'gold', never, never>>('resources');
    let given = 0;
    kernel.registerSystem({
      id: 'tips',
      serialize: () => given,
      deserialize: (data) => {
        given = typeof data === 'number' ? data : 0;
      },
    });
    return {
      get tipsGiven() {
        return given;
      },
      tip(amount) {
        if (!wallet.spend('gold', amount)) return false;
        given += amount;
        kernel.emit('tipped', { amount });
        return true;
      },
    };
  });

  it('merges the plugin API and events with full types', () => {
    const game = createGame({
      clock: new ManualClock(0),
      resources: { gold: { initial: 10 } },
      plugins: [tips],
    });
    expectTypeOf(game.tip).parameter(0).toEqualTypeOf<number>();
    expectTypeOf(game.tipsGiven).toEqualTypeOf<number>();
    expectTypeOf(game.amount('gold')).toEqualTypeOf<BigNum>();

    const seen: number[] = [];
    game.on('tipped', ({ amount }) => seen.push(amount));
    expect(game.tip(4)).toBe(true);
    expect(game.tip(100)).toBe(false);
    expect(seen).toEqual([4]);
    expect(game.amount('gold').toNumber()).toBe(6);
  });

  it('persists the extra plugin state with the rest of the game', () => {
    const make = () =>
      createGame({
        clock: new ManualClock(0),
        resources: { gold: { initial: 10 } },
        plugins: [tips],
      });
    const a = make();
    a.tip(3);
    const b = make();
    b.load(parseSave(JSON.stringify(a.save())), { offline: false });
    expect(b.tipsGiven).toBe(3);
    expect(b.amount('gold').toNumber()).toBe(7);
  });

  it('still works without extra plugins', () => {
    const game = createGame({ clock: new ManualClock(0), resources: { gold: {} } });
    expect(game.amount('gold').isZero()).toBe(true);
  });
});

describe('createGame: built-in extra plugins (docs/plugins.md example)', () => {
  it('composes unlocks, autoBuyers and challenges with full types', () => {
    const clock = new ManualClock(0);
    const game = createGame({
      clock,
      resources: { gold: { initial: 10_000 } },
      generators: {
        miner: { cost: { resource: 'gold', base: 10, growth: 1.15 }, produces: 'gold', rate: 1 },
        drill: { cost: { resource: 'gold', base: 500, growth: 1.2 }, produces: 'gold', rate: 20 },
      },
      plugins: [
        unlocks<'gold', 'miner' | 'drill', never, 'deepMining'>({
          definitions: {
            deepMining: { condition: (g) => g.bought('miner').gte(10), generators: ['drill'] },
          },
        }),
        autoBuyers({ buyers: { minerBot: { generator: 'miner', everyMs: 2000 } } }),
        challenges<'gold', 'miner', 'slowGold'>({
          definitions: {
            slowGold: {
              goal: (g) => g.earned('gold').gte(1e6),
              modifiers: [{ resource: 'gold', multiplier: 0.1 }],
              reward: [{ resource: 'gold', multiplier: 2 }],
            },
          },
        }),
      ],
    });
    expect(game.canBuy('drill')).toBe(false);
    game.buy('miner', 10);
    expect(game.canBuy('drill')).toBe(true);
    game.setAutoBuyer('minerBot', true);
    expect(game.isAutoBuyerEnabled('minerBot')).toBe(true);
    expect(game.startChallenge('slowGold')).toBe(true);
    expect(game.activeChallenge()).toBe('slowGold');
    expectTypeOf(game.activeChallenge).returns.toEqualTypeOf<'slowGold' | undefined>();
  });
});
