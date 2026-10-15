// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BigNum, ManualClock, createGame, format } from '../src/index.js';
import { useGame } from '../src/bindings/react.js';

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

describe('React binding: useGame', () => {
  it('returns the selected value and updates it after ticks', () => {
    const { clock, game } = make();
    game.buy('miner');
    const { result } = renderHook(() => useGame(game, (g) => format(g.amount('gold'))));
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
      return useGame(game, (g) => g.upgradeIds.length); // never changes
    });
    const base = renders;
    act(() => {
      clock.advance(1000);
      game.update();
    });
    expect(renders).toBe(base);
  });

  it('treats equal BigNum values as unchanged', () => {
    const { clock, game } = make();
    game.buy('miner');
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useGame(game, (g) => g.rate('gold')); // a fresh BigNum on every call
    });
    expect(result.current).toBeInstanceOf(BigNum);
    const base = renders;
    act(() => {
      clock.advance(1000);
      game.update(); // ten ticks, rate unchanged
    });
    expect(renders).toBe(base);
  });

  it('follows loads and accepts a custom equality function', () => {
    const { game } = make();
    const save = game.save();
    game.add('gold', 5);
    const { result } = renderHook(() =>
      useGame(
        game,
        (g) => ({ gold: g.amount('gold').toNumber() }),
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
