/** Function returned by {@link Emitter.on} that removes the listener. */
export type Unsubscribe = () => void;

/** Listener for an event with payload `T`. */
export type Listener<T> = (payload: T) => void;

/**
 * Minimal, fully typed event emitter. The type parameter maps event names to payloads.
 *
 * Listeners run synchronously in subscription order. If a listener throws, the remaining
 * listeners still run and the error (or an `AggregateError` for several) is rethrown
 * afterwards, so one faulty handler cannot silence the others.
 *
 * @example
 * const bus = new Emitter<{ hit: { damage: number } }>();
 * const off = bus.on('hit', ({ damage }) => console.log(damage));
 * bus.emit('hit', { damage: 3 });
 * off();
 */
export class Emitter<E extends object> {
  private readonly listeners = new Map<keyof E, Set<Listener<never>>>();

  /** Subscribes to `event`. Returns a function that unsubscribes. */
  on<K extends keyof E>(event: K, listener: Listener<E[K]>): Unsubscribe {
    let set = this.listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(event, set);
    }
    // Wrap so the same function can be registered more than once independently.
    const entry = ((payload: E[K]) => listener(payload)) as Listener<never>;
    set.add(entry);
    return () => {
      this.listeners.get(event)?.delete(entry);
    };
  }

  /** Subscribes to `event` for a single emission. */
  once<K extends keyof E>(event: K, listener: Listener<E[K]>): Unsubscribe {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  /** Synchronously notifies every listener of `event`. */
  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const set = this.listeners.get(event);
    if (set === undefined || set.size === 0) return;
    const errors: unknown[] = [];
    for (const listener of [...set]) {
      try {
        (listener as Listener<E[K]>)(payload);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, `${String(event)}: ${errors.length} listeners threw`);
    }
  }

  /** Number of listeners currently subscribed to `event`. */
  listenerCount<K extends keyof E>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /** Removes all listeners of `event`, or of every event when omitted. */
  clear<K extends keyof E>(event?: K): void {
    if (event === undefined) this.listeners.clear();
    else this.listeners.delete(event);
  }
}
