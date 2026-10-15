import { describe, expect, it } from 'vitest';
import {
  BigNum,
  Engine,
  ManualClock,
  SaveCorruptedError,
  autoBuyers,
  boosts,
  challenges,
  compileCost,
  createCore,
  createGame,
  createSave,
  definePlugin,
  format,
  prestige,
  prestigeLayers,
  resources,
  unlocks,
} from '../src/index.js';

const n = (value: number | string): BigNum => BigNum.from(value);

describe('core accessors and kernel events', () => {
  it('exposes the step length and supports once() on the core', () => {
    const game = createCore({ clock: new ManualClock(0), stepMs: 250 });
    expect(game.stepMs).toBe(250);
    let calls = 0;
    game.once('start', () => {
      calls++;
    });
    game.start();
    game.stop();
    game.start();
    game.stop();
    expect(calls).toBe(1);
  });

  it('lets a plugin listen to core events through the kernel', () => {
    const seen: number[] = [];
    const listener = definePlugin('listener', (kernel) => {
      kernel.on('tick', ({ tick }) => seen.push(tick));
      return {};
    });
    const game = createCore({ clock: new ManualClock(0), plugins: [listener] });
    game.advance(300);
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe('BigNum and format edge cases', () => {
  it('rejects non-finite parts', () => {
    expect(() => BigNum.fromParts(Infinity, 0)).toThrow(RangeError);
    expect(() => BigNum.fromParts(1, NaN)).toThrow(RangeError);
  });

  it('formats negative numbers with mantissa carry in scientific notation', () => {
    expect(format('-9.9999e12')).toBe('-1e13');
    expect(format('-9.999999e14', { notation: 'engineering' })).toBe('-1e15');
  });

  it('falls back to scientific for small values when suffix notation has no plain range', () => {
    expect(format(500, { notation: 'suffix', plainBelow: 0 })).toBe('5e2');
  });
});

describe('Engine defaults', () => {
  it('uses the system clock when none is given', () => {
    let steps = 0;
    const engine = new Engine({
      onStep: () => {
        steps++;
      },
    });
    expect(engine.update()).toBe(steps);
    expect(engine.stepMs).toBe(100);
  });
});

describe('cost curves: custom edge cases', () => {
  it('prices empty batches at zero and recovers from a negative max estimate', () => {
    const cost = compileCost({
      type: 'custom',
      cost: () => 5,
      max: () => -3,
    });
    expect(cost.total(n(0), n(0)).isZero()).toBe(true);
    expect(cost.max(n(0), n(7)).toNumber()).toBe(1);
  });
});

describe('resources: configuration and guards', () => {
  it('rejects generators that feed an unknown generator', () => {
    expect(() =>
      createCore({
        plugins: [
          resources({
            resources: { gold: {} },
            generators: {
              a: {
                cost: { resource: 'gold', base: 1, growth: 1 },
                produces: { generator: 'ghost' as 'a' },
                rate: 1,
              },
            },
          }),
        ],
      }),
    ).toThrow(/unknown generator "ghost"/);
  });

  it('rejects a save whose resources entry is not an object', () => {
    const game = createCore({ plugins: [resources({ resources: { gold: {} } })] });
    expect(() => game.load(createSave(1, 0, { resources: 5 }), { offline: false })).toThrow(
      SaveCorruptedError,
    );
  });

  it('removes purchase guards', () => {
    const game = createCore({
      plugins: [
        resources({
          resources: { gold: { initial: 100 } },
          generators: {
            miner: { cost: { resource: 'gold', base: 1, growth: 1 }, produces: 'gold', rate: 1 },
          },
        }),
      ],
    });
    game.setPurchaseGuard('lock', () => false);
    expect(game.canBuy('miner')).toBe(false);
    expect(game.removePurchaseGuard('lock')).toBe(true);
    expect(game.removePurchaseGuard('lock')).toBe(false);
    expect(game.canBuy('miner')).toBe(true);
  });
});

describe('plugins: defaults and missing save entries', () => {
  it('unlocks: several unlocks can gate the same target', () => {
    const game = createCore({
      plugins: [
        resources({
          resources: { gold: { initial: 100 } },
          generators: {
            miner: { cost: { resource: 'gold', base: 1, growth: 1 }, produces: 'gold', rate: 1 },
          },
        }),
        unlocks<'gold', 'miner', never, 'first' | 'second'>({
          definitions: {
            first: { condition: (g) => g.amount('gold').gte(50), generators: ['miner'] },
            second: { condition: (g) => g.amount('gold').gte(500), generators: ['miner'] },
          },
        }),
      ],
    });
    expect(game.canBuy('miner')).toBe(false);
    game.add('gold', 1000);
    expect(game.canBuy('miner')).toBe(true);
    expect(game.unlockedIds().sort()).toEqual(['first', 'second']);
  });

  it('autoBuyers: defaults to a one-second interval and tolerates saves without its entry', () => {
    const clock = new ManualClock(0);
    const game = createCore({
      clock,
      plugins: [
        resources({
          resources: { gold: { initial: 100 } },
          generators: {
            miner: { cost: { resource: 'gold', base: 1, growth: 1 }, produces: 'gold', rate: 0 },
          },
        }),
        autoBuyers({ buyers: { bot: { generator: 'miner', amount: 1, enabled: true } } }),
      ],
    });
    clock.advance(999);
    game.update();
    expect(game.bought('miner').isZero()).toBe(true);
    clock.advance(1);
    game.update();
    expect(game.bought('miner').toNumber()).toBe(1);
    game.load(createSave(1, 0, { autoBuyers: {} }), { offline: false });
    expect(game.isAutoBuyerEnabled('bot')).toBe(true);
  });

  it('boosts: a saved boost with no time left is inactive', () => {
    const game = createCore({
      plugins: [
        resources({ resources: { gold: {} } }),
        boosts({ definitions: { b: { durationMs: 1000, effects: [] } } }),
      ],
    });
    game.load(createSave(1, 0, { boosts: { b: 0 } }), { offline: false });
    expect(game.isBoostActive('b')).toBe(false);
  });

  it('challenges: ticking with no active challenge or before the interval does nothing', () => {
    const clock = new ManualClock(0);
    const game = createCore({
      clock,
      plugins: [
        resources({ resources: { gold: { initial: 0 } } }),
        challenges<'gold', never, 'c'>({
          checkIntervalMs: 1000,
          definitions: { c: { goal: (g) => g.earned('gold').gte(1) } },
        }),
      ],
    });
    game.advance(500);
    expect(game.activeChallenge()).toBeUndefined();
    game.startChallenge('c');
    game.add('gold', 5);
    game.advance(500);
    expect(game.activeChallenge()).toBe('c');
    game.advance(600);
    expect(game.isChallengeCompleted('c')).toBe(true);
  });

  it('prestige: works without bonuses and loads saves that lack its entry', () => {
    const game = createCore({
      plugins: [
        resources({ resources: { gold: {} } }),
        prestige<'gold'>({ basedOn: 'gold', gain: { threshold: 1 } }),
      ],
    });
    game.add('gold', 4);
    game.prestige();
    game.load(createSave(1, 0, {}), { offline: false });
    expect(game.prestigeCount()).toBe(0);
  });

  it('prestigeLayers: supports function bonuses', () => {
    const game = createCore({
      plugins: [
        resources({
          resources: { gold: { initial: 0 } },
          generators: {
            miner: { cost: { resource: 'gold', base: 1, growth: 1 }, produces: 'gold', rate: 10 },
          },
        }),
        prestigeLayers<'gold', 'miner', never, 'layer'>({
          layers: {
            layer: {
              basedOn: 'gold',
              gain: { threshold: 1 },
              bonuses: [{ target: { all: true }, multiplier: (points) => points.add(1) }],
            },
          },
        }),
      ],
    });
    game.add('gold', 9);
    game.ascend('layer');
    game.add('gold', 1);
    game.buy('miner');
    expect(game.rate('gold').toNumber()).toBeCloseTo(40, 9);
  });
});

describe('createGame option combinations', () => {
  it('accepts only maxChain, and achievements without prestige or an interval', () => {
    const game = createGame({
      clock: new ManualClock(0),
      offline: { maxChain: 8 },
      resources: { gold: { initial: 5 } },
      achievements: { rich: { condition: (g) => g.amount('gold').gte(1) } },
    });
    expect(game.checkAchievements()).toEqual(['rich']);
  });
});
