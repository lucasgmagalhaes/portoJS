/**
 * Svelte store bindings for PortoJS games.
 *
 * @module @portojs/svelte
 */

import { sameValue, subscribeAll } from './shared.ts';
import type { Observable, Off } from './shared.ts';

export type { Observable } from './shared.ts';

/**
 * A Svelte readable store: `$store` works in components, and `subscribe` follows Svelte's store
 * contract (it calls back at once with the current value and returns an unsubscribe function).
 */
export interface GameStore<T> {
  /**
   * Calls `run` now with the current value and after every change.
   */
  subscribe(run: (value: T) => void): Off;
}

/**
 * Exposes a value from a game as a Svelte store that updates when it changes.
 *
 * The selector runs after every tick (and on load, start and stop). Subscribers are told only
 * when the selected value differs from the previous one: `Object.is`, or value equality for
 * `BigNum`. The game is observed only while the store has subscribers, so there is nothing to
 * clean up. No Svelte import is needed: the store contract is structural.
 *
 * @example
 * const amount = useGame(game, () => format(gold.amount));
 * // <span>{$amount}</span>
 */
export function useGame<G extends Observable, T>(
  game: G,
  selector: (game: G) => T,
  isEqual: (a: T, b: T) => boolean = sameValue,
): GameStore<T> {
  const subscribers = new Set<(value: T) => void>();
  let current = selector(game);
  let stop: Off | undefined;

  const refresh = (): void => {
    const next = selector(game);
    if (isEqual(current, next)) return;
    current = next;
    for (const run of [...subscribers]) run(next);
  };

  return {
    subscribe(run) {
      if (subscribers.size === 0) {
        current = selector(game);
        stop = subscribeAll(game, refresh);
      }
      subscribers.add(run);
      run(current);
      return () => {
        subscribers.delete(run);
        if (subscribers.size === 0 && stop !== undefined) {
          stop();
          stop = undefined;
        }
      };
    },
  };
}
