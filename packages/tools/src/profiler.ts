import type { Component, Game } from '@portojs/runtime';

/**
 * Which per-frame method of a component was timed.
 */
export type ProfilePhase = 'fixedUpdate' | 'update' | 'lateUpdate';

const PHASES: readonly ProfilePhase[] = ['fixedUpdate', 'update', 'lateUpdate'];

/**
 * Time spent in one method of one component type.
 */
export interface ProfileEntry {
  /**
   * The component's `typeId`, or its class name.
   */
  readonly type: string;
  readonly phase: ProfilePhase;
  /**
   * Calls measured.
   */
  readonly calls: number;
  /**
   * Total time in milliseconds.
   */
  readonly total: number;
  /**
   * Average time per call in milliseconds.
   */
  readonly average: number;
  /**
   * Slowest call in milliseconds.
   */
  readonly max: number;
}

/**
 * One fixed step as measured by the profiler.
 */
export interface ProfileFrame {
  /**
   * Time all components spent in `fixedUpdate` during the step, in milliseconds.
   */
  readonly fixedMs: number;
  /**
   * Time spent in `update` and `lateUpdate` since the previous step, in milliseconds.
   */
  readonly frameMs: number;
  /**
   * Memory in use in bytes when the step ended, or `undefined` when no sampler is set.
   */
  readonly memory: number | undefined;
}

/**
 * Options of a {@link Profiler}.
 */
export interface ProfilerOptions {
  /**
   * Milliseconds clock. Default `performance.now`.
   */
  readonly now?: () => number;
  /**
   * Steps kept for the frame graph. Default `120`.
   */
  readonly history?: number;
  /**
   * Returns the memory in use, in bytes. Browsers do not offer one everywhere (Chrome has
   * `performance.memory.usedJSHeapSize`), so there is no default.
   */
  readonly memory?: () => number;
}

interface Stat {
  calls: number;
  total: number;
  max: number;
}

type Method = (this: Component, ...args: number[]) => void;

/**
 * Measures how long each component type spends in `fixedUpdate`, `update` and `lateUpdate`,
 * and keeps a short history of step times for a frame graph. It wraps the methods of the live
 * components, so the game needs no changes; `detach()` puts them back.
 *
 * @example
 * const profiler = new Profiler().attach(game);
 * // later
 * console.table(profiler.report().slice(0, 5));
 */
export class Profiler {
  private readonly stats = new Map<string, Stat>();
  private readonly wrapped = new Map<Component, Map<ProfilePhase, Method | undefined>>();
  private readonly ring: ProfileFrame[] = [];
  private readonly now: () => number;
  private readonly history: number;
  private readonly memory: (() => number) | undefined;
  private game: Game | undefined;
  private stopListening: (() => void) | undefined;
  private fixedMs = 0;
  private frameMs = 0;

  constructor(options: ProfilerOptions = {}) {
    this.now = options.now ?? defaultNow;
    this.history = Math.max(1, options.history ?? 120);
    this.memory = options.memory;
  }

  /**
   * Whether the profiler is measuring a game.
   */
  get attached(): boolean {
    return this.game !== undefined;
  }

  /**
   * Starts measuring a game. Components created later are picked up on the next step.
   */
  attach(game: Game): this {
    this.detach();
    this.game = game;
    this.sync();
    this.stopListening = game.on('tick', this.onTick);
    return this;
  }

  /**
   * Stops measuring and restores the original methods. The numbers collected so far are kept.
   */
  detach(): void {
    this.stopListening?.();
    this.stopListening = undefined;
    for (const [component, methods] of this.wrapped) {
      for (const [phase, original] of methods) {
        if (original === undefined) Reflect.deleteProperty(component, phase);
        else (component as unknown as Record<string, Method>)[phase] = original;
      }
    }
    this.wrapped.clear();
    this.game = undefined;
  }

  /**
   * Forgets every number collected.
   */
  reset(): void {
    this.stats.clear();
    this.ring.length = 0;
    this.fixedMs = 0;
    this.frameMs = 0;
  }

  /**
   * The slowest component methods first, by total time.
   */
  report(): ProfileEntry[] {
    const entries: ProfileEntry[] = [];
    for (const [key, stat] of this.stats) {
      const split = key.lastIndexOf('.');
      entries.push({
        type: key.slice(0, split),
        phase: key.slice(split + 1) as ProfilePhase,
        calls: stat.calls,
        total: stat.total,
        average: stat.calls > 0 ? stat.total / stat.calls : 0,
        max: stat.max,
      });
    }
    return entries.sort(byTotalDescending);
  }

  /**
   * The last steps, oldest first, for a frame graph.
   */
  frames(): readonly ProfileFrame[] {
    return this.ring;
  }

  /**
   * Adds the methods of components that appeared since the last step to the measurement.
   */
  sync(): void {
    const game = this.game;
    if (game === undefined) return;
    for (const object of game.objects) {
      for (const component of object.components) this.wrap(component);
    }
  }

  private wrap(component: Component): void {
    if (this.wrapped.has(component)) return;
    const methods = new Map<ProfilePhase, Method | undefined>();
    const type = typeOf(component);
    for (const phase of PHASES) {
      const original = (component as unknown as Record<string, Method | undefined>)[phase];
      if (typeof original !== 'function') continue;
      const own = Object.hasOwn(component, phase) ? original : undefined;
      methods.set(phase, own);
      (component as unknown as Record<string, Method>)[phase] = this.timed(type, phase, original);
    }
    this.wrapped.set(component, methods);
  }

  private timed(type: string, phase: ProfilePhase, original: Method): Method {
    const key = `${type}.${phase}`;
    const now = this.now;
    const record = (ms: number): void => this.record(key, phase, ms);
    return function measure(this: Component, ...args: number[]): void {
      const start = now();
      try {
        original.apply(this, args);
      } finally {
        record(now() - start);
      }
    };
  }

  private record(key: string, phase: ProfilePhase, ms: number): void {
    let stat = this.stats.get(key);
    if (stat === undefined) {
      stat = { calls: 0, total: 0, max: 0 };
      this.stats.set(key, stat);
    }
    stat.calls++;
    stat.total += ms;
    if (ms > stat.max) stat.max = ms;
    if (phase === 'fixedUpdate') this.fixedMs += ms;
    else this.frameMs += ms;
  }

  private readonly onTick = (): void => {
    this.ring.push({
      fixedMs: this.fixedMs,
      frameMs: this.frameMs,
      memory: this.memory?.(),
    });
    if (this.ring.length > this.history) this.ring.shift();
    this.fixedMs = 0;
    this.frameMs = 0;
    this.sync();
  };
}

function byTotalDescending(a: ProfileEntry, b: ProfileEntry): number {
  return b.total - a.total;
}

function defaultNow(): number {
  return performance.now();
}

function typeOf(component: Component): string {
  const type = component.constructor as { typeId?: string | undefined; name: string };
  return type.typeId ?? type.name;
}
