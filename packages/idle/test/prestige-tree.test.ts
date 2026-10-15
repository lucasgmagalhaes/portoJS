import { ManualClock, SaveCorruptedError } from '@portojs/core';
import { Game } from '@portojs/runtime';
import { describe, expect, it } from 'vitest';
import { Generator, Prestige, PrestigeTree, Resource } from '../src/index.ts';
import type { PrestigeNode } from '../src/index.ts';

function make() {
  const game = new Game({ clock: new ManualClock(0), stepMs: 100 });
  const gold = game.createObject('Gold').addComponent(Resource, { initial: 0 });
  const miner = game.createObject('Miner').addComponent(Generator, {
    cost: { resource: gold, base: 1, growth: 1 },
    produces: gold,
    rate: 1,
    initial: 1,
  });
  const ascension = game.createObject('Ascension').addComponent(Prestige, {
    basedOn: gold,
    gain: { threshold: 100 },
  });
  const nodes: PrestigeNode[] = [
    { id: 'miners', cost: 1, bonus: { generator: miner, multiplier: 2 } },
    { id: 'deep', cost: 3, requires: ['miners'], bonus: { all: true, multiplier: 1.5 } },
    { id: 'luck', cost: 3, exclusiveWith: ['deep'], bonus: { resource: gold, multiplier: 3 } },
  ];
  const tree = game.createObject('Tree').addComponent(PrestigeTree, { prestige: ascension, nodes });
  return { game, gold, miner, ascension, tree };
}

function rate(gold: Resource): number {
  return gold.rate.toNumber();
}

describe('PrestigeTree', () => {
  it('reports the status of each node', () => {
    const { ascension, tree } = make();
    expect(tree.status('miners')).toBe('unaffordable');
    expect(tree.status('deep')).toBe('locked');
    ascension.refund(10);
    expect(tree.status('miners')).toBe('available');
    tree.buy('miners');
    expect(tree.status('miners')).toBe('owned');
    expect(tree.status('deep')).toBe('available');
    tree.buy('deep');
    expect(tree.status('luck')).toBe('blocked');
    expect(() => tree.status('nope')).toThrow(RangeError);
  });

  it('spends points, applies the bonus and refuses unavailable nodes', () => {
    const { gold, ascension, tree } = make();
    const base = rate(gold);
    expect(tree.buy('miners')).toBe(false);
    ascension.refund(5);
    expect(tree.buy('deep')).toBe(false);
    expect(tree.buy('miners')).toBe(true);
    expect(ascension.points.toNumber()).toBe(4);
    expect(rate(gold)).toBeCloseTo(base * 2, 9);
    expect(tree.buy('miners')).toBe(false);
    expect(tree.owned).toEqual(['miners']);
    expect(tree.has('miners')).toBe(true);
  });

  it('closes exclusive branches', () => {
    const { ascension, tree } = make();
    ascension.refund(20);
    tree.buy('miners');
    expect(tree.buy('luck')).toBe(true);
    expect(tree.buy('deep')).toBe(false);
  });

  it('respecs and refunds the spent points', () => {
    const { gold, ascension, tree } = make();
    const base = rate(gold);
    ascension.refund(10);
    tree.buy('miners');
    tree.buy('deep');
    const refunded = tree.respec();
    expect(refunded.toNumber()).toBe(4);
    expect(ascension.points.toNumber()).toBe(10);
    expect(rate(gold)).toBeCloseTo(base, 9);
    expect(tree.owned).toEqual([]);
  });

  it('saves the owned nodes and reapplies their bonuses', () => {
    const a = make();
    a.ascension.refund(10);
    a.tree.buy('miners');
    a.tree.buy('luck');
    const saved = a.tree.onSave();
    const b = make();
    b.tree.onLoad(saved);
    expect(b.tree.owned).toEqual(['miners', 'luck']);
    expect(rate(b.gold)).toBeCloseTo(rate(a.gold), 9);
    expect(() => b.tree.onLoad(['missing'])).toThrow(SaveCorruptedError);
    expect(() => b.tree.onLoad({})).toThrow(SaveCorruptedError);
  });

  it('rejects bad node lists', () => {
    const { game, ascension, miner } = make();
    const bonus = { generator: miner, multiplier: 2 };
    let count = 0;
    const build = (nodes: PrestigeNode[]) => () =>
      game.createObject(`Bad${count++}`).addComponent(PrestigeTree, { prestige: ascension, nodes });
    expect(
      build([
        { id: 'a', cost: 1, bonus },
        { id: 'a', cost: 1, bonus },
      ]),
    ).toThrow(RangeError);
    expect(build([{ id: 'a', cost: 1, requires: ['x'], bonus }])).toThrow(RangeError);
    expect(build([{ id: 'a', cost: -1, bonus }])).toThrow(RangeError);
  });
});
