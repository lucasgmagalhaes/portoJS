import type { Clock } from './clock/index.js';
import type { Listener, Unsubscribe } from './events/index.js';
import type { OfflineReport } from './offline/index.js';
import type { JsonValue, SaveData } from './save/index.js';

/**
 * A unit of game logic driven by the {@link Core}. The core knows nothing about what a
 * system does; it only ticks, saves and fast-forwards it. Everything game specific
 * (resources, prestige, achievements...) is implemented as systems inside plugins.
 */
export interface System {
  /**
   * Unique key. Also the key of this system's slice inside a save.
   */
  readonly id: string;
  /**
   * Advances the system by one fixed step of `dtMs` milliseconds.
   */
  tick?(dtMs: number): void;
  /**
   * Credits `elapsedMs` of away-time. The span is already capped and scaled by the
   * offline efficiency. Implement it with a closed form when possible.
   */
  offline?(elapsedMs: number): void;
  /**
   * Returns this system's state as JSON. Omit for systems with no persistent state.
   */
  serialize?(): JsonValue;
  /**
   * Restores state from {@link System.serialize} output. Receives `undefined` when the
   * save has no entry for this system (new game, or a system added after the save), and
   * must then reset to its default state.
   */
  deserialize?(data: JsonValue | undefined): void;
}

/**
 * Where a credited away-time span came from.
 */
export type OfflineSource = 'load' | 'background' | 'manual';

/**
 * Events emitted by the core itself. Plugins add their own.
 */
export interface CoreEvents {
  /**
   * One fixed step finished.
   */
  tick: { dtMs: number; tick: number };
  /**
   * The loop started.
   */
  start: { at: number };
  /**
   * The loop stopped.
   */
  stop: { at: number };
  /**
   * A save was created.
   */
  saved: { save: SaveData };
  /**
   * A save was loaded (after migrations).
   */
  loaded: { save: SaveData };
  /**
   * Away-time was handled (also reported when it credited nothing, except for zero time).
   */
  offline: OfflineReport & { source: OfflineSource };
  /**
   * The loop fell too far behind and dropped time.
   */
  overflow: { droppedMs: number };
}

/**
 * What a plugin sees of the core while it sets itself up.
 *
 * @typeParam Ev events this plugin emits.
 * @typeParam Deps events from other plugins this plugin listens to.
 */
export interface Kernel<Ev extends object = object, Deps extends object = object> {
  /**
   * The game clock.
   */
  readonly clock: Clock;
  /**
   * Fixed step length in ms.
   */
  readonly stepMs: number;
  /**
   * Current clock time in ms.
   */
  now(): number;
  /**
   * Adds a system. Systems tick in registration order.
   */
  registerSystem(system: System): void;
  /**
   * Returns the API of an already installed plugin. Plugins are set up in array order, so
   * dependencies must come first.
   *
   * @throws {Error} if no plugin with that name is installed yet.
   */
  require<A extends object>(plugin: string): A;
  /**
   * Emits one of this plugin's events.
   */
  emit<K extends keyof Ev>(event: K, payload: Ev[K]): void;
  /**
   * Listens to a core event, one of this plugin's events, or a declared dependency's.
   */
  on<K extends keyof (CoreEvents & Ev & Deps)>(
    event: K,
    listener: Listener<(CoreEvents & Ev & Deps)[K]>,
  ): Unsubscribe;
}

/**
 * An installable feature. `setup` registers systems and returns the public API that gets
 * merged onto the game object.
 */
export interface Plugin<Api extends object = object, Ev extends object = object> {
  /**
   * Unique name. Used by {@link Kernel.require}.
   */
  readonly name: string;
  /**
   * Registers systems and returns the API to expose on the game.
   */
  setup(kernel: Kernel<Ev>): Api;
  /**
   * Type-only marker that carries the event map. Never set at runtime.
   */
  readonly $events?: Ev;
}

/**
 * Any plugin.
 */
export type AnyPlugin = Plugin<object, object>;

/**
 * Declares a plugin with full type inference.
 *
 * The kernel a plugin receives also covers the `Deps` events: that is a compile-time promise by
 * the plugin author, so `setup` is stored with the plain `Kernel<Ev>` type.
 *
 * @typeParam Api methods and properties merged onto the game.
 * @typeParam Ev events the plugin emits.
 * @typeParam Deps events of other plugins the plugin listens to.
 *
 * @example
 * const counter = definePlugin<{ readonly count: number }>('counter', (kernel) => {
 *   let count = 0;
 *   kernel.registerSystem({ id: 'counter', tick: () => { count += 1; } });
 *   return { get count() { return count; } };
 * });
 */
export function definePlugin<
  Api extends object,
  Ev extends object = object,
  Deps extends object = object,
>(name: string, setup: (kernel: Kernel<Ev, Deps>) => Api): Plugin<Api, Ev> {
  return { name, setup };
}

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;

/**
 * Merged public API of a plugin list.
 */
export type ApiOf<P extends readonly AnyPlugin[]> = UnionToIntersection<
  P[number] extends infer U ? (U extends Plugin<infer A, object> ? A : never) : never
> &
  object;

/**
 * Merged event map of a plugin list.
 */
export type EventsOf<P extends readonly AnyPlugin[]> = UnionToIntersection<
  P[number] extends infer U ? (U extends Plugin<object, infer E> ? E : never) : never
> &
  object;
