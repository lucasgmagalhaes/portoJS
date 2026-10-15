import { ManualClock, format } from '@portojs/core';
import { Generator, Resource } from '@portojs/idle';
import { Game } from '@portojs/runtime';
import { describe, expect, it } from 'vitest';
import { useGame } from '../src/index.ts';

function make() {
  const clock = new ManualClock(0);
  const game = new Game({ clock });
  const gold = game.createObject('Gold').addComponent(Resource, { initial: 10 });
  const miner = game.createObject('Miner').addComponent(Generator, {
    cost: { resource: gold, base: 10, growth: 1 },
    produces: gold,
    rate: 1,
  });
  return { clock, game, gold, miner };
}

describe('Svelte binding: useGame', () => {
  it('calls back at once and follows the game', () => {
    const { clock, game, gold, miner } = make();
    miner.buy();
    const store = useGame(game, () => format(gold.amount));
    const seen: string[] = [];
    const unsubscribe = store.subscribe((value) => seen.push(value));
    expect(seen).toEqual(['0']);
    clock.advance(4000);
    game.update();
    expect(seen.at(-1)).toBe('4');
    const count = seen.length;
    unsubscribe();
    clock.advance(1000);
    game.update();
    expect(seen).toHaveLength(count);
  });

  it('only notifies when the value really changes', () => {
    const { clock, game, gold, miner } = make();
    miner.buy();
    const store = useGame(game, () => gold.rate);
    let runs = 0;
    const unsubscribe = store.subscribe(() => {
      runs += 1;
    });
    clock.advance(1000);
    game.update();
    expect(runs).toBe(1);
    unsubscribe();
  });

  it('observes the game only while it has subscribers and shares one subscription', () => {
    const { clock, game, gold, miner } = make();
    miner.buy();
    let selected = 0;
    const store = useGame(game, () => {
      selected += 1;
      return format(gold.amount);
    });
    const first: string[] = [];
    const second: string[] = [];
    const offFirst = store.subscribe((value) => first.push(value));
    const offSecond = store.subscribe((value) => second.push(value));
    clock.advance(2000);
    game.update();
    expect(first.at(-1)).toBe('2');
    expect(second).toEqual(first);
    const firstCount = first.length;
    offFirst();
    clock.advance(1000);
    game.update();
    expect(first).toHaveLength(firstCount);
    expect(second.at(-1)).toBe('3');
    offSecond();
    const calls = selected;
    clock.advance(1000);
    game.update();
    expect(selected).toBe(calls);
    const again: string[] = [];
    store.subscribe((value) => again.push(value))();
    expect(again).toEqual(['4']);
  });

  it('accepts a custom equality', () => {
    const { clock, game, gold, miner } = make();
    miner.buy();
    const store = useGame(
      game,
      () => ({ rate: gold.rate.toNumber() }),
      (a, b) => a.rate === b.rate,
    );
    let runs = 0;
    const off = store.subscribe(() => {
      runs += 1;
    });
    clock.advance(1000);
    game.update();
    expect(runs).toBe(1);
    off();
  });
});
