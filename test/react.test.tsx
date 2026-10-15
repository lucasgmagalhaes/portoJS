// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BigNum, Game, Generator, ManualClock, Resource, format } from '../src/index.js';
import { useGame } from '../src/bindings/react.js';

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

describe('React binding: useGame', () => {
  it('returns the selected value and updates it after ticks', () => {
    const { clock, game, gold, miner } = make();
    miner.buy();
    const { result } = renderHook(() => useGame(game, () => format(gold.amount)));
    expect(result.current).toBe('0');
    act(() => {
      clock.advance(3000);
      game.update();
    });
    expect(result.current).toBe('3');
  });

  it('re-renders only when the selected value changes', () => {
    const { clock, game } = make();
    let renders = 0;
    renderHook(() => {
      renders++;
      return useGame(game, (g) => g.time.fixedDeltaTime);
    });
    const base = renders;
    act(() => {
      clock.advance(1000);
      game.update();
    });
    expect(renders).toBe(base);
  });

  it('treats equal BigNum values as unchanged', () => {
    const { clock, game, gold, miner } = make();
    miner.buy();
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useGame(game, () => gold.rate);
    });
    expect(result.current).toBeInstanceOf(BigNum);
    const base = renders;
    act(() => {
      clock.advance(1000);
      game.update();
    });
    expect(renders).toBe(base);
  });

  it('follows loads and accepts a custom equality function', () => {
    const { game, gold } = make();
    const save = game.save();
    gold.add(5);
    const { result } = renderHook(() =>
      useGame(
        game,
        () => ({ gold: gold.amount.toNumber() }),
        (a, b) => a.gold === b.gold,
      ),
    );
    expect(result.current.gold).toBe(15);
    act(() => {
      game.load(save, { offline: false });
    });
    expect(result.current.gold).toBe(10);
  });

  it('unsubscribes on unmount', () => {
    const listeners = new Set<() => void>();
    const fake = {
      on(_event: 'tick' | 'loaded' | 'start' | 'stop', listener: () => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    const { unmount } = renderHook(() => useGame(fake, () => 1));
    expect(listeners.size).toBeGreaterThan(0);
    unmount();
    expect(listeners.size).toBe(0);
  });
});
