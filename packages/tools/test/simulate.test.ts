import { ManualClock } from '@portojs/core';
import { Generator, Resource, Upgrade } from '@portojs/idle';
import { Game } from '@portojs/runtime';
import { describe, expect, it } from 'vitest';
import { buyCheapest, buyInOrder, simulate } from '../src/index.ts';

function make() {
  const game = new Game({ clock: new ManualClock(0), stepMs: 100 });
  const gold = game.createObject('Gold').addComponent(Resource, { initial: 10 });
  const miner = game.createObject('Miner').addComponent(Generator, {
    cost: { resource: gold, base: 10, growth: 1.15 },
    produces: gold,
    rate: 1,
  });
  const mine = game.createObject('Mine').addComponent(Generator, {
    cost: { resource: gold, base: 100, growth: 1.2 },
    produces: gold,
    rate: 10,
  });
  return { game, gold, miner, mine };
}

describe('simulate', () => {
  it('reports when milestones are reached, deterministically', () => {
    const run = (): number | undefined => {
      const { game, gold, miner, mine } = make();
      return simulate({
        game,
        maxMs: 600_000,
        strategy: buyCheapest([miner, mine]),
        milestones: { thousand: () => gold.amount.gte(1000) },
      }).reached['thousand'];
    };
    const first = run();
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(600_000);
    expect(run()).toBe(first);
  });

  it('stops early when every milestone is reached and keeps going otherwise', () => {
    const { game, gold, miner } = make();
    const result = simulate({
      game,
      maxMs: 600_000,
      decisionMs: 500,
      strategy: buyCheapest([miner]),
      milestones: { easy: () => gold.amount.gte(15), never: () => false },
    });
    expect(result.completed).toBe(false);
    expect(result.reached['easy']).toBeLessThan(60_000);
    expect(result.reached['never']).toBeUndefined();
    expect(result.elapsedMs).toBe(600_000);
    expect(result.steps).toBe(6000);

    const quick = make();
    const done = simulate({
      game: quick.game,
      maxMs: 600_000,
      strategy: buyCheapest([quick.miner]),
      milestones: { easy: () => quick.gold.amount.gte(15) },
    });
    expect(done.completed).toBe(true);
    expect(done.elapsedMs).toBeLessThan(600_000);
  });

  it('records samples over time and handles a milestone met at the start', () => {
    const { game, gold, miner } = make();
    const result = simulate({
      game,
      maxMs: 180_000,
      strategy: buyCheapest([miner]),
      sample: () => ({ gold: gold.amount.toNumber() }),
      sampleEveryMs: 60_000,
      milestones: { already: () => true },
    });
    expect(result.completed).toBe(true);
    expect(result.reached['already']).toBe(0);
    expect(result.samples.length).toBeGreaterThanOrEqual(1);

    const timed = simulate({
      game: make().game,
      maxMs: 180_000,
      sample: () => ({ x: 1 }),
      sampleEveryMs: 60_000,
    });
    expect(timed.samples.map((sample) => sample.atMs)).toEqual([0, 60_000, 120_000, 180_000]);
    expect(timed.completed).toBe(true);
  });

  it('validates its options', () => {
    const { game } = make();
    expect(() => simulate({ game, maxMs: 0 })).toThrow(RangeError);
    expect(() => simulate({ game, maxMs: 10, decisionMs: 0 })).toThrow(RangeError);
    expect(() => simulate({ game, maxMs: 10, sampleEveryMs: 0 })).toThrow(RangeError);
  });

  it('truncates the last slice to maxMs', () => {
    const { game } = make();
    const result = simulate({ game, maxMs: 1500, decisionMs: 1000 });
    expect(result.elapsedMs).toBe(1500);
  });
});

describe('strategies', () => {
  it('buyCheapest picks the cheapest affordable item and skips maxed upgrades', () => {
    const { game, gold, miner, mine } = make();
    gold.add(1000);
    const upgrade = game.createObject('Boost').addComponent(Upgrade, {
      cost: { resource: gold, base: 5, growth: 1 },
      maxLevel: 1,
      effects: [{ generator: miner, multiplier: 2 }],
    });
    buyCheapest([miner, mine, upgrade])(game);
    expect(upgrade.isMaxed).toBe(true);
    expect(miner.count.toNumber()).toBeGreaterThan(0);
  });

  it('buyInOrder spends on the first item until it cannot, then the next', () => {
    const { game, gold, miner, mine } = make();
    gold.add(500);
    buyInOrder([mine, miner])(game);
    expect(mine.count.toNumber()).toBeGreaterThan(0);
    expect(gold.amount.lt(100)).toBe(true);
  });
});
