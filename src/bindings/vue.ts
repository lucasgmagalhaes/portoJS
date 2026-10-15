import { getCurrentScope, onScopeDispose, shallowRef } from 'vue';
import type { ShallowRef } from 'vue';
import { sameValue, subscribeAll } from './shared.js';
import type { Observable } from './shared.js';

export type { Observable } from './shared.js';

/**
 * Exposes a value from a game as a Vue ref that updates when it changes.
 *
 * The selector runs after every tick (and on load, start and stop). The ref only changes when
 * the selected value differs from the previous one: `Object.is`, or value equality for
 * `BigNum`. When called inside a component or effect scope, the subscription is removed
 * automatically when the scope is disposed; otherwise call the returned `stop` yourself.
 *
 * @example
 * const { value: gold } = useGame(game, (g) => format(g.amount('gold')));
 * // <span>{{ gold }}</span>
 */
export function useGame<G extends Observable, T>(
  game: G,
  selector: (game: G) => T,
  isEqual: (a: T, b: T) => boolean = sameValue,
): { readonly value: Readonly<ShallowRef<T>>; readonly stop: () => void } {
  const state = shallowRef(selector(game));
  const refresh = (): void => {
    const next = selector(game);
    if (!isEqual(state.value, next)) state.value = next;
  };
  const stop = subscribeAll(game, refresh);
  if (getCurrentScope() !== undefined) onScopeDispose(stop);
  return { value: state, stop };
}
