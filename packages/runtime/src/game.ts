import { systemClock } from '@portojs/core';
import type { Clock } from '@portojs/core';
import { Engine } from '@portojs/core';
import type { Scheduler } from '@portojs/core';
import { Emitter } from '@portojs/core';
import type { Listener, Unsubscribe } from '@portojs/core';
import { resolveElapsed, resolveOffline } from '@portojs/core';
import type { OfflineOptions, OfflineReport } from '@portojs/core';
import {
  SaveCorruptedError,
  createSave,
  exportSave,
  importSave,
  isJsonObject,
  migrateSave,
  parseSave,
} from '@portojs/core';
import type { ExportOptions, JsonObject, Migrations, SaveData } from '@portojs/core';
import type { Component, ComponentType } from './component.ts';
import { Coroutine } from './coroutine.ts';
import type { CoroutineYield } from './coroutine.ts';
import { GameObject } from './game-object.ts';
import type { Prefab } from './prefab.ts';
import { Time } from './time.ts';

/**
 * Where a credited away-time span came from.
 */
export type OfflineSource = 'load' | 'background' | 'manual';

/**
 * Offline behaviour of a game.
 */
export interface GameOfflineOptions extends OfflineOptions {
  /**
   * Credit away-time automatically in {@link Game.load}. Default `true`.
   */
  readonly onLoad?: boolean;
  /**
   * Credit time the loop had to drop (for example a throttled background tab) as offline time,
   * using the same cap and efficiency. Default `true`.
   */
  readonly background?: boolean;
}

/**
 * Options for {@link Game}.
 */
export interface GameOptions {
  /**
   * Time source. Default `systemClock`. Inject a `ManualClock` for tests.
   */
  readonly clock?: Clock;
  /**
   * Loop driver. Default `setInterval`.
   */
  readonly scheduler?: Scheduler;
  /**
   * Fixed timestep in ms. Default `100`.
   */
  readonly stepMs?: number;
  /**
   * Maximum steps simulated per update before time is dropped. Default `100`.
   */
  readonly maxCatchUpTicks?: number;
  /**
   * How often the scheduler wakes the loop, in ms. Default `stepMs`.
   */
  readonly pollMs?: number;
  /**
   * Current save schema version. Default `1`. Bump it when your save layout changes.
   */
  readonly version?: number;
  /**
   * Migrations from older save versions.
   */
  readonly migrations?: Migrations;
  /**
   * Offline cap, efficiency and triggers.
   */
  readonly offline?: GameOfflineOptions;
  /**
   * Longest save string accepted by `load` / `importSave`, in characters. Default 10,000,000.
   */
  readonly maxSaveChars?: number;
}

/**
 * Options for {@link Game.createObject}.
 */
export interface CreateObjectOptions {
  /**
   * Parent object. A child is active only while its parent is.
   */
  readonly parent?: GameObject;
  /**
   * Initial value of `activeSelf`. Default `true`.
   */
  readonly active?: boolean;
}

/**
 * Options for {@link Game.instantiate}. `params` is required when the prefab declares parameters.
 */
export type InstantiateOptions<P> = CreateObjectOptions &
  (undefined extends P ? { readonly params?: P } : { readonly params: P });

/**
 * Options for {@link Game.load}.
 */
export interface LoadOptions {
  /**
   * Override automatic offline crediting for this load.
   */
  readonly offline?: boolean;
}

/**
 * Events emitted by a {@link Game}.
 */
export interface GameEvents {
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
  /**
   * A game object was created.
   */
  objectCreated: { object: GameObject };
  /**
   * A game object was destroyed.
   */
  objectDestroyed: { object: GameObject };
}

const DEFAULT_MAX_SAVE_CHARS = 10_000_000;

function orderOf(component: Component): number {
  const type = component.constructor as { executionOrder?: number };
  return type.executionOrder ?? 0;
}

function typeIdOf(component: Component): string {
  const type = component.constructor as { typeId?: string };
  return type.typeId ?? component.constructor.name;
}

function insertSorted(list: Component[], component: Component): void {
  const order = orderOf(component);
  let index = list.length;
  while (index > 0 && orderOf(list[index - 1] as Component) > order) index--;
  list.splice(index, 0, component);
}

function isRunning(coroutine: Coroutine): boolean {
  return coroutine.isRunning;
}

function removeFrom<T>(list: T[], item: T): void {
  const index = list.indexOf(item);
  if (index >= 0) list.splice(index, 1);
}

function collectSubtree(object: GameObject, into: Component[]): void {
  for (const component of object.components) into.push(component);
  for (const child of object.children) collectSubtree(child, into);
}

function componentKeys(object: GameObject): Array<readonly [string, Component]> {
  const seen = new Map<string, number>();
  const keyed: Array<readonly [string, Component]> = [];
  for (const component of object.components) {
    const id = typeIdOf(component);
    const count = (seen.get(id) ?? 0) + 1;
    seen.set(id, count);
    keyed.push([count === 1 ? id : `${id}#${count}`, component]);
  }
  return keyed;
}

function decodeText(text: string, maxChars: number): SaveData {
  if (text.length > maxChars) {
    throw new SaveCorruptedError(
      `Save string is too large (${text.length} > ${maxChars} characters)`,
    );
  }
  const trimmed = text.trim();
  return trimmed.startsWith('{') ? parseSave(trimmed) : importSave(trimmed, maxChars);
}

/**
 * The game: a fixed-timestep loop that runs the components of its {@link GameObject}s, plus
 * versioned saves, offline progress and a typed event bus. It knows nothing about any kind of
 * game; behavior comes from the components you add (your own, or the idle mechanics shipped in
 * `portojs/idle`).
 *
 * @example
 * const game = new Game();
 * const player = game.createObject('Player');
 * player.addComponent(Health, { max: 100 });
 * game.start();
 */
export class Game {
  /**
   * The game clock.
   */
  readonly clock: Clock;
  /**
   * Current save schema version.
   */
  readonly version: number;
  /**
   * Time information, like Unity's `Time`.
   */
  readonly time: Time;

  private readonly engine: Engine;
  private readonly bus = new Emitter<GameEvents>();
  private readonly objectList: GameObject[] = [];
  private readonly byName = new Map<string, GameObject>();
  private readonly componentList: Component[] = [];
  private readonly updatable: Component[] = [];
  private pendingStart: Component[] = [];
  private coroutines: Coroutine[] = [];
  private structure = 0;
  private readonly typeCache = new Map<
    ComponentType,
    { readonly structure: number; readonly found: Component[] }
  >();
  private readonly offlineOptions: GameOfflineOptions;
  private readonly migrations: Migrations;
  private readonly maxSaveChars: number;

  private readonly step = (dtMs: number): void => {
    this.time.advance();
    this.startPending();
    const dt = dtMs / 1000;
    for (const component of [...this.updatable]) {
      if (component.isActive) component.fixedUpdate?.(dt);
    }
    this.stepCoroutines(dt);
    this.bus.emit('tick', { dtMs, tick: this.engine.stepCount });
  };

  private readonly overflow = (droppedMs: number): void => {
    this.bus.emit('overflow', { droppedMs });
    if (this.offlineOptions.background !== false) {
      this.credit(resolveElapsed(droppedMs, this.offlineOptions), 'background');
    }
  };

  /**
   * @throws {RangeError} on invalid timing or offline options.
   */
  constructor(options: GameOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.version = options.version ?? 1;
    if (!Number.isInteger(this.version) || this.version < 1) {
      throw new RangeError('Game: version must be an integer >= 1');
    }
    this.migrations = options.migrations ?? {};
    this.maxSaveChars = options.maxSaveChars ?? DEFAULT_MAX_SAVE_CHARS;
    if (!(this.maxSaveChars > 0)) throw new RangeError('Game: maxSaveChars must be > 0');
    this.offlineOptions = options.offline ?? {};
    resolveElapsed(0, this.offlineOptions);

    this.engine = new Engine({
      clock: this.clock,
      onStep: this.step,
      onOverflow: this.overflow,
      ...(options.stepMs === undefined ? {} : { stepMs: options.stepMs }),
      ...(options.maxCatchUpTicks === undefined
        ? {}
        : { maxCatchUpTicks: options.maxCatchUpTicks }),
      ...(options.pollMs === undefined ? {} : { pollMs: options.pollMs }),
      ...(options.scheduler === undefined ? {} : { scheduler: options.scheduler }),
    });
    this.time = new Time(this.engine.stepMs / 1000);
  }

  /**
   * `true` while the loop is running.
   */
  get running(): boolean {
    return this.engine.running;
  }

  /**
   * Fixed steps executed so far.
   */
  get tickCount(): number {
    return this.engine.stepCount;
  }

  /**
   * Fixed step length in ms.
   */
  get stepMs(): number {
    return this.engine.stepMs;
  }

  /**
   * Current clock time in ms.
   */
  now(): number {
    return this.clock.now();
  }

  /**
   * Counter that changes whenever an object or component is added or removed. Components that
   * cache lookups can compare it to know when to refresh.
   */
  get structureVersion(): number {
    return this.structure;
  }

  /**
   * Every live game object, in creation order.
   */
  get objects(): readonly GameObject[] {
    return this.objectList;
  }

  /**
   * Starts the loop. No-op when already running.
   */
  start(): void {
    if (this.engine.running) return;
    this.engine.start();
    this.bus.emit('start', { at: this.clock.now() });
  }

  /**
   * Stops the loop. No-op when not running.
   */
  stop(): void {
    if (!this.engine.running) return;
    this.engine.stop();
    this.bus.emit('stop', { at: this.clock.now() });
  }

  /**
   * Pumps the loop once from the clock. The scheduler does this for you after
   * {@link Game.start}; call it yourself with a fake clock for deterministic tests.
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
   * Credits `ms` of away-time as if the player had been gone, applying the configured cap and
   * efficiency.
   */
  simulateOffline(ms: number): OfflineReport {
    const report = resolveElapsed(ms, this.offlineOptions);
    this.credit(report, 'manual');
    return report;
  }

  /**
   * Stops the loop, destroys every object and removes all listeners. Call it when discarding a
   * game (for example when a UI component unmounts).
   */
  dispose(): void {
    this.stop();
    for (const object of [...this.objectList]) object.destroy();
    this.bus.clear();
  }

  /**
   * Subscribes to an event. Returns a function that unsubscribes.
   */
  on<K extends keyof GameEvents>(event: K, listener: Listener<GameEvents[K]>): Unsubscribe {
    return this.bus.on(event, listener);
  }

  /**
   * Subscribes to a single emission of an event.
   */
  once<K extends keyof GameEvents>(event: K, listener: Listener<GameEvents[K]>): Unsubscribe {
    return this.bus.once(event, listener);
  }

  /**
   * Creates a game object, like Unity's `new GameObject(name)`.
   *
   * @throws {Error} if `name` is empty or already used by another live object.
   */
  createObject(name: string, options: CreateObjectOptions = {}): GameObject {
    if (name === '') throw new Error('Game: object names cannot be empty');
    if (this.byName.has(name)) throw new Error(`Game: an object named "${name}" already exists`);
    const object = new GameObject(this, name, options.parent, options.active ?? true);
    this.objectList.push(object);
    this.byName.set(name, object);
    this.structure += 1;
    this.bus.emit('objectCreated', { object });
    return object;
  }

  /**
   * Creates an object from a {@link Prefab}, like Unity's `Instantiate`. If the prefab's builder
   * throws, the half-built object is destroyed and the error is rethrown.
   *
   * @throws {Error} if `name` is empty or already used by another live object.
   */
  instantiate<P>(
    prefab: Prefab<P>,
    name: string,
    ...options: undefined extends P
      ? [options?: InstantiateOptions<P>]
      : [options: InstantiateOptions<P>]
  ): GameObject {
    const given = options[0];
    const object = this.createObject(name, {
      active: given?.active ?? prefab.active,
      ...(given?.parent === undefined ? {} : { parent: given.parent }),
    });
    try {
      prefab.build(object, given?.params as P);
    } catch (error) {
      object.destroy();
      throw error;
    }
    return object;
  }

  /**
   * Finds a live object by name.
   */
  find(name: string): GameObject | undefined {
    return this.byName.get(name);
  }

  /**
   * Finds the first component that is an instance of `type`, in any object.
   */
  findObjectOfType<C extends Component>(type: ComponentType<C>): C | undefined {
    return this.findObjectsOfType(type)[0];
  }

  /**
   * Finds every component that is an instance of `type`, in any object. The result is cached
   * until objects or components are added or removed, so calling it every step is cheap; do not
   * modify the returned array.
   */
  findObjectsOfType<C extends Component>(type: ComponentType<C>): C[] {
    const cached = this.typeCache.get(type);
    if (cached?.structure === this.structure) return cached.found as C[];
    const found: C[] = [];
    for (const component of this.componentList) {
      if (component instanceof type) found.push(component);
    }
    this.typeCache.set(type, { structure: this.structure, found });
    return found;
  }

  /**
   * @internal Called by {@link GameObject.addComponent}.
   */
  registerComponent(component: Component): void {
    insertSorted(this.componentList, component);
    if (typeof component.fixedUpdate === 'function') insertSorted(this.updatable, component);
    if (typeof component.start === 'function') this.pendingStart.push(component);
    else component.startCalled = true;
    this.structure += 1;
    component.awake?.();
    if (component.isActive) {
      component.wasActive = true;
      component.onEnable?.();
    }
  }

  /**
   * @internal Called by {@link GameObject.removeComponent}.
   */
  unregisterComponent(component: Component): void {
    if (component.wasActive) {
      component.wasActive = false;
      component.onDisable?.();
    }
    component.isDestroyed = true;
    for (const coroutine of this.coroutines) {
      if (coroutine.owner === component) coroutine.stop();
    }
    this.coroutines = this.coroutines.filter(isRunning);
    component.onDestroy?.();
    removeFrom(this.componentList, component);
    removeFrom(this.updatable, component);
    removeFrom(this.pendingStart, component);
    this.structure += 1;
  }

  /**
   * @internal Called by {@link GameObject.destroy}.
   */
  unregisterObject(object: GameObject): void {
    removeFrom(this.objectList, object);
    if (this.byName.get(object.name) === object) this.byName.delete(object.name);
    this.structure += 1;
    this.bus.emit('objectDestroyed', { object });
  }

  /**
   * @internal Fires `onEnable` / `onDisable` after an activity change.
   */
  refreshActivity(target: GameObject | Component): void {
    const affected: Component[] = [];
    if (target instanceof GameObject) collectSubtree(target, affected);
    else affected.push(target);
    for (const component of affected) {
      const active = component.isActive;
      if (active === component.wasActive) continue;
      component.wasActive = active;
      if (active) component.onEnable?.();
      else component.onDisable?.();
    }
  }

  /**
   * Captures the whole game state.
   */
  save(): SaveData {
    const save = createSave(this.version, this.clock.now(), this.collect());
    this.bus.emit('saved', { save });
    return save;
  }

  /**
   * Captures the state as a Base64 string, ready to copy or store. Pass `{ compress: true }` for
   * a much smaller string; loading reads both formats.
   */
  exportSave(options?: ExportOptions): string {
    return exportSave(this.save(), options);
  }

  /**
   * Restores state from a save object, a JSON string or an {@link Game.exportSave} string. Older
   * versions are migrated. Loading is atomic: if anything fails, the previous state is restored
   * and the error is rethrown.
   *
   * Unless disabled, the time between the save and now is credited as offline time.
   *
   * @returns the offline report, or `undefined` when offline crediting was off.
   * @throws {SaveCorruptedError} if the save is damaged or tampered with.
   * @throws {SaveVersionError} if the save is newer than this game or cannot be migrated.
   */
  load(input: SaveData | string, options: LoadOptions = {}): OfflineReport | undefined {
    const parsed =
      typeof input === 'string' ? decodeText(input, this.maxSaveChars) : parseSave(input);
    const save = migrateSave(parsed, this.version, this.migrations);
    const backup = this.collect();
    const failures = this.applyAll(save.data);
    if (failures.length > 0) {
      this.applyAll(backup);
      throw failures[0];
    }
    this.engine.discardPending();
    this.bus.emit('loaded', { save });
    if (!(options.offline ?? this.offlineOptions.onLoad ?? true)) return undefined;
    const report = resolveOffline(save.savedAt, this.clock.now(), this.offlineOptions);
    this.credit(report, 'load');
    return report;
  }

  /**
   * Alias of {@link Game.load} for strings from {@link Game.exportSave}.
   */
  importSave(encoded: string, options: LoadOptions = {}): OfflineReport | undefined {
    return this.load(encoded, options);
  }

  /**
   * Returns every component to its default state (as if loading an empty save).
   */
  reset(): void {
    const failures = this.applyAll({});
    if (failures.length > 0) throw failures[0];
  }

  /**
   * @internal Called by {@link Component.startCoroutine}.
   */
  startCoroutine(owner: Component, routine: Iterator<CoroutineYield>): Coroutine {
    const coroutine = new Coroutine(owner, routine);
    if (coroutine.isRunning) this.coroutines.push(coroutine);
    return coroutine;
  }

  /**
   * @internal Called by {@link Component.stopAllCoroutines}.
   */
  stopCoroutines(owner: Component): void {
    for (const coroutine of this.coroutines) {
      if (coroutine.owner === owner) coroutine.stop();
    }
    this.coroutines = this.coroutines.filter(isRunning);
  }

  private stepCoroutines(deltaTime: number): void {
    if (this.coroutines.length === 0) return;
    try {
      for (const coroutine of [...this.coroutines]) coroutine.step(deltaTime);
    } finally {
      this.coroutines = this.coroutines.filter(isRunning);
    }
  }

  private startPending(): void {
    if (this.pendingStart.length === 0) return;
    const batch = this.pendingStart;
    this.pendingStart = [];
    for (const component of batch) {
      if (component.isDestroyed) continue;
      if (component.isActive) {
        component.startCalled = true;
        component.start?.();
      } else {
        this.pendingStart.push(component);
      }
    }
  }

  private collect(): JsonObject {
    const objects: JsonObject = {};
    for (const object of this.objectList) {
      const entry: JsonObject = {};
      for (const [key, component] of componentKeys(object)) {
        const data = component.onSave?.();
        if (data !== undefined) entry[key] = data;
      }
      if (Object.keys(entry).length > 0) objects[object.name] = entry;
    }
    return { objects };
  }

  private applyAll(data: JsonObject): unknown[] {
    const failures: unknown[] = [];
    const objects = isJsonObject(data['objects']) ? data['objects'] : {};
    for (const object of this.objectList) {
      const saved = objects[object.name];
      const entry = isJsonObject(saved) ? saved : {};
      for (const [key, component] of componentKeys(object)) {
        try {
          component.onLoad?.(entry[key]);
        } catch (error) {
          failures.push(error);
        }
      }
    }
    return failures;
  }

  private credit(report: OfflineReport, source: OfflineSource): void {
    if (report.status === 'none') return;
    if (report.appliedMs > 0) {
      for (const component of [...this.componentList]) {
        if (component.isActive) component.onOffline?.(report.appliedMs);
      }
    }
    this.bus.emit('offline', { ...report, source });
  }
}
