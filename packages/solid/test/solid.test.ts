import { ManualClock, format } from '@portojs/core';
import { Generator, Resource } from '@portojs/idle';
import { Game } from '@portojs/runtime';
import { createEffect, createRoot } from 'solid-js';
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

describe('Solid binding: useGame', () => {
  it('exposes an accessor that follows the game', () => {
    const { clock, game, gold, miner } = make();
    miner.buy();
    createRoot((dispose) => {
      const amount = useGame(game, () => format(gold.amount));
      expect(amount()).toBe('0');
      clock.advance(4000);
      game.update();
      expect(amount()).toBe('4');
      dispose();
      clock.advance(1000);
      game.update();
      expect(amount()).toBe('4');
    });
  });

  it('re-runs effects only when the value really changes', () => {
    const { clock, game, gold, miner } = make();
    miner.buy();
    const seen: string[] = [];
    const rate: string[] = [];
    const dispose = createRoot((disposeRoot) => {
      const amount = useGame(game, () => format(gold.amount));
      const perSecond = useGame(game, () => gold.rate);
      createEffect(() => {
        seen.push(amount());
      });
      createEffect(() => {
        rate.push(format(perSecond()));
      });
      return disposeRoot;
    });
    clock.advance(1000);
    game.update();
    dispose();
    expect(seen[0]).toBe('0');
    expect(seen.at(-1)).toBe('1');
    expect(new Set(seen).size).toBe(seen.length);
    expect(rate).toEqual(['1']);
  });

  it('works outside a reactive owner', () => {
    const { clock, game, gold, miner } = make();
    miner.buy();
    const amount = useGame(game, () => format(gold.amount));
    clock.advance(2000);
    game.update();
    expect(amount()).toBe('2');
  });
});
