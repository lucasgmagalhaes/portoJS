import { useCallback, useRef, useSyncExternalStore } from 'react';
import { sameValue, subscribeAll } from './shared.js';
import type { Observable } from './shared.js';

export type { Observable } from './shared.js';

/**
 * Reads a value from a game and re-renders the component when it changes.
 *
 * The selector runs after every tick (and on load, start and stop). The component only
 * re-renders when the selected value differs from the previous one: `Object.is`, or value
 * equality for `BigNum`. For other derived objects, pass your own `isEqual` or select
 * primitives (a formatted string, a number).
 *
 * @example
 * function Gold({ game }: { game: Game }) {
 *   const gold = useGame(game, (g) => format(g.amount('gold'), { notation: 'suffix' }));
 *   return <span>{gold}</span>;
 * }
 */
export function useGame<G extends Observable, T>(
  game: G,
  selector: (game: G) => T,
  isEqual: (a: T, b: T) => boolean = sameValue,
): T {
  const latest = useRef(selector);
  latest.current = selector;
  const last = useRef<{ readonly value: T } | undefined>(undefined);

  const subscribe = useCallback((notify: () => void) => subscribeAll(game, notify), [game]);

  const getSnapshot = (): T => {
    const next = latest.current(game);
    const previous = last.current;
    if (previous !== undefined && isEqual(previous.value, next)) return previous.value;
    last.current = { value: next };
    return next;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
