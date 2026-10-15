import { systemClock } from './clock/index.js';
import type { Clock } from './clock/index.js';
import { Engine } from './engine/index.js';
import type { Scheduler } from './engine/index.js';
import { Emitter } from './events/index.js';
import type { Listener, Unsubscribe } from './events/index.js';
import { resolveElapsed, resolveOffline } from './offline/index.js';
import type { OfflineOptions, OfflineReport } from './offline/index.js';
import type {
  AnyPlugin,
  ApiOf,
  CoreEvents,
  EventsOf,
  Kernel,
  OfflineSource,
  System,
} from './plugin.js';
import { createSave, exportSave, importSave, migrateSave, parseSave } from './save/index.js';
import type { JsonObject, JsonValue, Migrations, SaveData } from './save/index.js';

/** Offline behaviour of a game. */
export interface CoreOfflineOptions extends OfflineOptions {
  /** Credit away-time automatically in {@link Core.load}. Default `true`. */
  readonly onLoad?: boolean;
  /**
   * Credit time the loop had to drop (for example a throttled background tab) as
   * offline time, using the same cap and efficiency. Default `true`.
   */
  readonly background?: boolean;
}

/** Options for {@link createCore}. */
export interface CoreOptions<P extends readonly AnyPlugin[] = readonly AnyPlugin[]> {
  /** Features to install, set up in array order. */
  readonly plugins?: P;
  /** Time source. Default {@link systemClock}. Inject a `ManualClock` for tests. */
  readonly clock?: Clock;
  /** Loop driver. Default `setInterval`. */
  readonly scheduler?: Scheduler;
  /** Fixed timestep in ms. Default `100`. */
  readonly stepMs?: number;
  /** Maximum steps simulated per update before time is dropped. Default `100`. */
  readonly maxCatchUpTicks?: number;
  /** How often the scheduler wakes the loop, in ms. Default `stepMs`. */
  readonly pollMs?: number;
  /** Current save schema version. Default `1`. Bump it when your save layout changes. */
  readonly version?: number;
  /** Migrations from older save versions, see {@link Migrations}. */
  readonly migrations?: Migrations;
  /** Offline cap, efficiency and triggers. */
  readonly offline?: CoreOfflineOptions;
}

/** Options for {@link Core.load}. */
export interface LoadOptions {
  /** Override automatic offline crediting for this load. */
  readonly offline?: boolean;
}

/**
 * Game-agnostic kernel: a fixed-timestep loop, a registry of systems, a typed event bus,
 * versioned saves and offline crediting. It has no concept of resources, prestige or
 * anything else game specific; those come from plugins.
 *
 * Create one with {@link createCore}, which also merges plugin APIs onto the instance.
 */
export class Core<Ev extends object = object> {
  /** The game clock. */
  readonly clock: Clock;
  /** Current save schema version. */
  readonly version: number;

  private readonly engine: Engine;
  private readonly bus = new Emitter<Record<PropertyKey, unknown>>();
  private readonly systems: System[] = [];
  private readonly offlineOptions: CoreOfflineOptions;
  private readonly migrations: Migrations;
  /** @internal Public APIs returned by plugins, keyed by plugin name. */
  readonly pluginApis = new Map<string, object>();

  /** @throws {RangeError} on invalid timing or offline options. */
  constructor(options: CoreOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.version = options.version ?? 1;
    if (!Number.isInteger(this.version) || this.version < 1) {
      throw new RangeError('Core: version must be an integer >= 1');
    }
    this.migrations = options.migrations ?? {};
    this.offlineOptions = options.offline ?? {};
    resolveElapsed(0, this.offlineOptions); // validate eagerly

    this.engine = new Engine({
      clock: this.clock,
      onStep: (dtMs) => {
        for (const system of this.systems) system.tick?.(dtMs);
        this.bus.emit('tick', { dtMs, tick: this.engine.stepCount });
      },
      onOverflow: (droppedMs) => {
        this.bus.emit('overflow', { droppedMs });
        if (this.offlineOptions.background !== false) {
          this.credit(resolveElapsed(droppedMs, this.offlineOptions), 'background');
        }
      },
      ...(options.stepMs === undefined ? {} : { stepMs: options.stepMs }),
      ...(options.maxCatchUpTicks === undefined
        ? {}
        : { maxCatchUpTicks: options.maxCatchUpTicks }),
      ...(options.pollMs === undefined ? {} : { pollMs: options.pollMs }),
      ...(options.scheduler === undefined ? {} : { scheduler: options.scheduler }),
    });

    for (const plugin of options.plugins ?? []) {
      if (this.pluginApis.has(plugin.name)) {
        throw new Error(`Core: plugin "${plugin.name}" is installed twice`);
      }
      this.pluginApis.set(plugin.name, plugin.setup(this.createKernel()));
    }
  }

  // ------------------------------------------------------------------ loop

  /** `true` while the loop is running. */
  get running(): boolean {
    return this.engine.running;
  }

  /** Fixed steps executed so far. */
  get tickCount(): number {
    return this.engine.stepCount;
  }

  /** Fixed step length in ms. */
  get stepMs(): number {
    return this.engine.stepMs;
  }

  /** Current clock time in ms. */
  now(): number {
    return this.clock.now();
  }

  /** Starts the loop. No-op when already running. */
  start(): void {
    if (this.engine.running) return;
    this.engine.start();
    this.bus.emit('start', { at: this.clock.now() });
  }

  /** Stops the loop. No-op when not running. */
  stop(): void {
    if (!this.engine.running) return;
    this.engine.stop();
    this.bus.emit('stop', { at: this.clock.now() });
  }

  /**
   * Pumps the loop once from the clock. The scheduler does this for you after
   * {@link Core.start}; call it yourself with a fake clock for deterministic tests.
   *
   * @returns steps executed.
   */
  update(): number {
    return this.engine.update();
  }

  /**
   * Simulates `ms` of game time in fixed steps, ignoring the clock and the catch-up cap.
   *
   * @returns steps executed.
   */
  advance(ms: number): number {
    return this.engine.advance(ms);
  }

  /**
   * Credits `ms` of away-time as if the player had been gone, applying the configured
   * cap and efficiency.
   */
  simulateOffline(ms: number): OfflineReport {
    const report = resolveElapsed(ms, this.offlineOptions);
    this.credit(report, 'manual');
    return report;
  }

  /**
   * Stops the loop and removes every event listener. Call it when discarding a game
   * (for example when a UI component unmounts) so nothing keeps running or leaking.
   */
  dispose(): void {
    this.stop();
    this.bus.clear();
  }

  // ---------------------------------------------------------------- events

  /** Subscribes to an event. Returns a function that unsubscribes. */
  on<K extends keyof (CoreEvents & Ev)>(
    event: K,
    listener: Listener<(CoreEvents & Ev)[K]>,
  ): Unsubscribe {
    return this.bus.on(event, listener as Listener<unknown>);
  }

  /** Subscribes to a single emission of an event. */
  once<K extends keyof (CoreEvents & Ev)>(
    event: K,
    listener: Listener<(CoreEvents & Ev)[K]>,
  ): Unsubscribe {
    return this.bus.once(event, listener as Listener<unknown>);
  }

  // ----------------------------------------------------------------- saves

  /** Captures the whole game state. */
  save(): SaveData {
    const save = createSave(this.version, this.clock.now(), this.collect());
    this.bus.emit('saved', { save });
    return save;
  }

  /** Captures the state as a Base64 string, ready to copy or store. */
  exportSave(): string {
    return exportSave(this.save());
  }

  /**
   * Restores state from a save object, a JSON string or an {@link Core.exportSave} string.
   * Older versions are migrated. Loading is atomic: if anything fails, the previous state
   * is restored and the error is rethrown.
   *
   * Unless disabled, the time between the save and now is credited as offline time.
   *
   * @returns the offline report, or `undefined` when offline crediting was off.
   * @throws {SaveCorruptedError} if the save is damaged or tampered with.
   * @throws {SaveVersionError} if the save is newer than this game or cannot be migrated.
   */
  load(input: SaveData | string, options: LoadOptions = {}): OfflineReport | undefined {
    const parsed = typeof input === 'string' ? decodeText(input) : parseSave(input);
    const save = migrateSave(parsed, this.version, this.migrations);
    const backup = this.collect();
    try {
      this.apply(save.data);
    } catch (error) {
      try {
        this.apply(backup);
      } catch {
        // Best effort: the original error is the one worth reporting.
      }
      throw error;
    }
    this.bus.emit('loaded', { save });
    if (!(options.offline ?? this.offlineOptions.onLoad ?? true)) return undefined;
    const report = resolveOffline(save.savedAt, this.clock.now(), this.offlineOptions);
    this.credit(report, 'load');
    return report;
  }

  /** Alias of {@link Core.load} for strings from {@link Core.exportSave}. */
  importSave(encoded: string, options: LoadOptions = {}): OfflineReport | undefined {
    return this.load(importSave(encoded.trim()), options);
  }

  /** Returns every system to its default state (as if loading an empty save). */
  reset(): void {
    this.apply({});
  }

  // ------------------------------------------------------------- internals

  private collect(): JsonObject {
    const data: JsonObject = {};
    for (const system of this.systems) {
      if (system.serialize) data[system.id] = system.serialize();
    }
    return data;
  }

  private apply(data: JsonObject): void {
    for (const system of this.systems) {
      system.deserialize?.(data[system.id] as JsonValue | undefined);
    }
  }

  private credit(report: OfflineReport, source: OfflineSource): void {
    if (report.status === 'none') return;
    if (report.appliedMs > 0) {
      for (const system of this.systems) system.offline?.(report.appliedMs);
    }
    this.bus.emit('offline', { ...report, source });
  }

  private createKernel(): Kernel {
    return {
      clock: this.clock,
      stepMs: this.engine.stepMs,
      now: () => this.clock.now(),
      registerSystem: (system) => {
        if (this.systems.some((existing) => existing.id === system.id)) {
          throw new Error(`Core: system "${system.id}" is already registered`);
        }
        this.systems.push(system);
      },
      require: <A extends object>(plugin: string): A => {
        const api = this.pluginApis.get(plugin);
        if (api === undefined) {
          throw new Error(
            `Core: plugin "${plugin}" is required but not installed yet (list it earlier in "plugins")`,
          );
        }
        return api as A;
      },
      emit: (event, payload) => {
        this.bus.emit(event, payload);
      },
      on: (event, listener) => this.bus.on(event, listener as Listener<unknown>),
    };
  }
}

function decodeText(text: string): SaveData {
  const trimmed = text.trim();
  return trimmed.startsWith('{') ? parseSave(trimmed) : importSave(trimmed);
}

/**
 * Creates a {@link Core} with the given plugins installed and their APIs merged onto it.
 *
 * @throws {Error} if two plugins expose the same name or a plugin API key collides with
 * a core member.
 *
 * @example
 * const game = createCore({ plugins: [myPlugin], stepMs: 100 });
 * game.start();
 */
export function createCore<P extends readonly AnyPlugin[] = readonly []>(
  options: CoreOptions<P> = {},
): Core<EventsOf<P>> & ApiOf<P> {
  const core = new Core<EventsOf<P>>(options);
  for (const [name, api] of core.pluginApis) {
    for (const key of Reflect.ownKeys(api)) {
      if (key in core) {
        throw new Error(`Core: plugin "${name}" exposes "${String(key)}", which the core reserves`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(api, key);
      if (descriptor !== undefined) Object.defineProperty(core, key, descriptor);
    }
  }
  return core as Core<EventsOf<P>> & ApiOf<P>;
}
