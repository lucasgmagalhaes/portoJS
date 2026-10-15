import { effectScope, watch } from 'vue';
import { describe, expect, it } from 'vitest';
import { Game, Generator, ManualClock, Resource, format } from '../src/index.ts';
import { useGame } from '../src/vue.ts';

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

describe('Vue binding: useGame', () => {
  it('exposes a ref that follows the game', () => {
    const { clock, game, gold, miner } = make();
    miner.buy();
    const { value, stop } = useGame(game, () => format(gold.amount));
    expect(value.value).toBe('0');
    clock.advance(4000);
    game.update();
    expect(value.value).toBe('4');
    stop();
    clock.advance(1000);
    game.update();
    expect(value.value).toBe('4');
  });

  it('only triggers watchers when the value really changes', () => {
    const { clock, game, gold, miner } = make();
    miner.buy();
    const scope = effectScope();
    let runs = 0;
    scope.run(() => {
      const { value } = useGame(game, () => gold.rate);
      watch(value, () => runs++, { flush: 'sync' });
    });
    clock.advance(1000);
    game.update();
    expect(runs).toBe(0);
    scope.stop();
  });

  it('unsubscribes automatically when its effect scope is disposed', () => {
    const { clock, game, gold, miner } = make();
    miner.buy();
    const scope = effectScope();
    const ref = scope.run(() => useGame(game, () => gold.amount.toNumber()).value);
    clock.advance(1000);
    game.update();
    expect(ref?.value).toBe(1);
    scope.stop();
    clock.advance(1000);
    game.update();
    expect(ref?.value).toBe(1);
  });

  it('follows loads', () => {
    const { game, gold } = make();
    const save = game.save();
    gold.add(5);
    const { value } = useGame(game, () => gold.amount.toNumber());
    expect(value.value).toBe(15);
    game.load(save, { offline: false });
    expect(value.value).toBe(10);
  });
});
