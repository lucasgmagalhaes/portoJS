import { BigNum } from '../core/bignum/index.js';

/** Remove a listener. */
export type Off = () => void;

/**
 * The smallest surface the UI bindings need from a game: a way to hear that state may have
 * changed. Every game made by `createGame` or `createCore` satisfies it.
 */
export interface Observable {
  on(event: 'tick' | 'loaded' | 'start' | 'stop', listener: () => void): Off;
}

/** Events after which a selector may produce a new value. */
export const REFRESH_EVENTS = ['tick', 'loaded', 'start', 'stop'] as const;

/** Subscribes `listener` to every refresh event. Returns a function that removes them all. */
export function subscribeAll(game: Observable, listener: () => void): Off {
  const offs = REFRESH_EVENTS.map((event) => game.on(event, listener));
  return () => {
    for (const off of offs) off();
  };
}

/**
 * Default equality for selected values: `Object.is`, plus value equality for BigNum so a
 * selector that returns a freshly computed BigNum (like a rate) does not re-render every tick.
 */
export function sameValue<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  return a instanceof BigNum && b instanceof BigNum && a.eq(b);
}
