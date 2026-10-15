/**
 * Solid bindings for PortoJS games.
 *
 * @module @portojs/solid
 */

import { createSignal, getOwner, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import { sameValue, subscribeAll } from './shared.ts';
import type { Observable } from './shared.ts';

export type { Observable } from './shared.ts';

/**
 * Exposes a value from a game as a Solid signal accessor that updates when it changes.
 *
 * The selector runs after every tick (and on load, start and stop). The signal only changes when
 * the selected value differs from the previous one: `Object.is`, or value equality for `BigNum`.
 * Inside a component or reactive root the subscription is removed when the owner is disposed.
 *
 * @example
 * const amount = useGame(game, () => format(gold.amount));
 * // <span>{amount()}</span>
 */
export function useGame<G extends Observable, T>(
  game: G,
  selector: (game: G) => T,
  isEqual: (a: T, b: T) => boolean = sameValue,
): Accessor<T> {
  const [value, setValue] = createSignal<T>(selector(game), { equals: isEqual });
  const read = (): T => selector(game);
  const refresh = (): void => {
    setValue(read);
  };
  const stop = subscribeAll(game, refresh);
  if (getOwner() !== null) onCleanup(stop);
  return value;
}
