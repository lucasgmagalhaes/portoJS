import { describe, expect, it } from 'vitest';
import { ManualClock, SaveCorruptedError, createCore, createSave } from '../src/core/index.js';
import { resources, unlocks } from '../src/mechanics/index.js';

function build(checkIntervalMs = 100) {
  const clock = new ManualClock(0);
  const game = createCore({
    clock,
    plugins: [
      resources({
        resources: { gold: { initial: 1000 } },
        generators: {
          miner: { cost: { resource: 'gold', base: 10, growth: 1 }, produces: 'gold', rate: 1 },
          drill: { cost: { resource: 'gold', base: 10, growth: 1 }, produces: 'gold', rate: 5 },
        },
        upgrades: {
          pick: {
            cost: { resource: 'gold', base: 5, growth: 1 },
            effects: [{ all: true, multiplier: 2 }],
          },
        },
      }),
      unlocks<'gold', 'miner' | 'drill', 'pick', 'deep' | 'tools'>({
        checkIntervalMs,
        definitions: {
          deep: { condition: (g) => g.bought('miner').gte(3), generators: ['drill'] },
          tools: { condition: (g) => g.earned('gold').gte(50), upgrades: ['pick'] },
        },
      }),
    ],
  });
  return { clock, game };
}

describe('unlocks', () => {
  it('forbids gated purchases until the condition holds', () => {
    const { game } = build();
    expect(game.isUnlocked('deep')).toBe(false);
    expect(game.canBuy('drill')).toBe(false);
    expect(game.buy('drill').isZero()).toBe(true);
    expect(game.maxAffordable('drill').isZero()).toBe(true);
    expect(game.canBuyUpgrade('pick')).toBe(false);
    expect(game.buyUpgrade('pick')).toBe(false);
    expect(game.amount('gold').toNumber()).toBe(1000); // nothing was spent
  });

  it('opens a gate as soon as the condition becomes true, without waiting for a tick', () => {
    const { game } = build();
    const seen: string[] = [];
    game.on('unlocked', (e) => seen.push(e.id));
    game.buy('miner', 3);
    expect(game.canBuy('drill')).toBe(true); // lazily evaluated by the guard
    expect(game.buy('drill').toNumber()).toBe(1);
    expect(seen).toEqual(['deep']);
    expect(game.unlockedIds()).toEqual(['deep']);
  });

  it('also unlocks on the polling interval and via checkUnlocks', () => {
    const { clock, game } = build(100);
    game.add('gold', 60);
    clock.advance(150);
    game.update();
    expect(game.unlockedIds()).toEqual(['tools']);
    game.buy('miner', 3);
    expect(game.checkUnlocks()).toEqual(['deep']);
    expect(game.checkUnlocks()).toEqual([]);
  });

  it('leaves ungated targets alone', () => {
    const { game } = build();
    expect(game.canBuy('miner')).toBe(true);
  });

  it('keeps unlocks through run resets, and saves them', () => {
    const a = build();
    a.game.buy('miner', 3);
    a.game.isUnlocked('deep');
    a.game.resetRun();
    expect(a.game.isUnlocked('deep')).toBe(true);
    const save = JSON.parse(JSON.stringify(a.game.save()));

    const b = build();
    b.game.load(save, { offline: false });
    expect(b.game.unlockedIds()).toEqual(['deep']);
    expect(b.game.canBuy('drill')).toBe(true);
  });

  it('rejects corrupted data and bad options', () => {
    const { game } = build();
    expect(() =>
      game.load(createSave(1, 0, { unlocks: { deep: 'x' } }), { offline: false }),
    ).toThrow(SaveCorruptedError);
    expect(() => game.load(createSave(1, 0, { unlocks: 3 }), { offline: false })).toThrow(
      SaveCorruptedError,
    );
    expect(() => build(0)).toThrow(RangeError);
  });

  it('reset() locks everything again', () => {
    const { game } = build();
    game.buy('miner', 3);
    game.checkUnlocks();
    game.reset();
    expect(game.unlockedIds()).toEqual([]);
  });
});
