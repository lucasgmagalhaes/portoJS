import { effectScope, watch } from 'vue';
import { describe, expect, it } from 'vitest';
import { ManualClock, createGame, format } from '../src/index.js';
import { useGame } from '../src/bindings/vue.js';

function make() {
  const clock = new ManualClock(0);
  const game = createGame({
    clock,
    resources: { gold: { initial: 10 } },
    generators: {
      miner: { cost: { resource: 'gold', base: 10, growth: 1 }, produces: 'gold', rate: 1 },
    },
  });
  return { clock, game };
}

describe('Vue binding: useGame', () => {
  it('exposes a ref that follows the game', () => {
    const { clock, game } = make();
    game.buy('miner');
    const { value, stop } = useGame(game, (g) => format(g.amount('gold')));
    expect(value.value).toBe('0');
    clock.advance(4000);
    game.update();
    expect(value.value).toBe('4');
    stop();
    clock.advance(1000);
    game.update();
    expect(value.value).toBe('4'); // stopped: no more updates
  });

  it('only triggers watchers when the value really changes', () => {
    const { clock, game } = make();
    game.buy('miner');
    const scope = effectScope();
    let runs = 0;
    scope.run(() => {
      const { value } = useGame(game, (g) => g.rate('gold')); // fresh BigNum each call
      watch(value, () => runs++, { flush: 'sync' });
    });
    clock.advance(1000);
    game.update();
    expect(runs).toBe(0);
    scope.stop();
  });

  it('unsubscribes automatically when its effect scope is disposed', () => {
    const { clock, game } = make();
    game.buy('miner');
    const scope = effectScope();
    const ref = scope.run(() => useGame(game, (g) => g.amount('gold').toNumber()).value);
    clock.advance(1000);
    game.update();
    expect(ref?.value).toBe(1);
    scope.stop();
    clock.advance(1000);
    game.update();
    expect(ref?.value).toBe(1);
  });

  it('follows loads', () => {
    const { game } = make();
    const save = game.save();
    game.add('gold', 5);
    const { value } = useGame(game, (g) => g.amount('gold').toNumber());
    expect(value.value).toBe(15);
    game.load(save, { offline: false });
    expect(value.value).toBe(10);
  });
});
