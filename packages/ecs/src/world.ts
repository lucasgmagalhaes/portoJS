import { ComponentDef } from './component-def.ts';
import type { FieldArrays, FieldType, Schema, Store, Values } from './component-def.ts';

const ARRAY_TYPES: { readonly [K in FieldType]: new (length: number) => FieldArrays[K] } = {
  i8: Int8Array,
  u8: Uint8Array,
  i16: Int16Array,
  u16: Uint16Array,
  i32: Int32Array,
  u32: Uint32Array,
  f32: Float32Array,
  f64: Float64Array,
};

/**
 * A world saved by {@link World.snapshot}: plain JSON.
 */
export interface WorldSnapshot {
  readonly entities: readonly {
    readonly id: number;
    /**
     * Field values by component name, in the order of the component's schema.
     */
    readonly components: Readonly<Record<string, readonly number[]>>;
  }[];
}

/**
 * Thrown by {@link World.restore} when the snapshot does not fit the world or the components.
 */
export class SnapshotError extends Error {
  override readonly name = 'SnapshotError';
}

/**
 * Options for {@link World}.
 */
export interface WorldOptions {
  /**
   * Maximum number of live entities. Component arrays are allocated once at this size, so
   * they never move. Default `10000`.
   */
  readonly capacity?: number;
  /**
   * Maximum number of distinct component types. Default `64`.
   */
  readonly maxComponents?: number;
}

/**
 * Excludes entities that have a component, for use in {@link World.query}.
 */
export interface Not {
  readonly not: ComponentDef;
}

/**
 * A term of a query: a component the entity must have, or a {@link Not} it must lack.
 */
export type QueryTerm = ComponentDef | Not;

/**
 * A system: logic that runs every step over the entities it cares about.
 */
export type System = (world: World, deltaTime: number) => void;

/**
 * Options for {@link World.addSystem}.
 */
export interface SystemOptions {
  /**
   * Systems with a lower value run first. Default `0`.
   */
  readonly order?: number;
}

type FieldStore = Record<string, ArrayLike<number> & { [index: number]: number }>;

interface Registered {
  readonly bit: number;
  readonly store: FieldStore;
}

interface SystemEntry {
  readonly system: System;
  readonly order: number;
}

function isNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function byNumber(a: number, b: number): number {
  return a - b;
}

function isNot(entry: SystemEntry): (candidate: SystemEntry) => boolean {
  return (candidate) => candidate !== entry;
}

function bySystemOrder(a: SystemEntry, b: SystemEntry): number {
  return a.order - b.order;
}

/**
 * Marks a component as excluded in a query.
 *
 * @example
 * world.query(Position, not(Frozen));
 */
export function not(component: ComponentDef): Not {
  return { not: component };
}

/**
 * The entities matching a query, kept in a dense array and refreshed lazily when entities or
 * components change.
 */
export class Query {
  private version = -1;
  private matches: number[] = [];

  /**
   * @internal Use {@link World.query}.
   * @param world the world to search.
   * @param include bits that must be set.
   * @param exclude bits that must be clear.
   */
  constructor(
    private readonly world: World,
    private readonly include: readonly number[],
    private readonly exclude: readonly number[],
  ) {}

  /**
   * Matching entity ids. The array is reused between refreshes: copy it if you need to keep it,
   * and collect entities first if you add or remove components of matched entities in a loop.
   */
  get entities(): readonly number[] {
    if (this.version !== this.world.structureVersion) {
      this.matches = this.world.collect(this.include, this.exclude, this.matches);
      this.version = this.world.structureVersion;
    }
    return this.matches;
  }
}

/**
 * An ECS world: entities are plain integer ids, components are numeric data in typed arrays and
 * systems are functions over queries. It is separate from the object model of
 * `@portojs/runtime`; use `EcsWorld` to run one inside a game.
 *
 * @example
 * const Position = defineComponent({ x: 'f32', y: 'f32' });
 * const Velocity = defineComponent({ vx: 'f32', vy: 'f32' });
 * const world = new World();
 * const pos = world.use(Position);
 * const vel = world.use(Velocity);
 * const moving = world.query(Position, Velocity);
 */
export class World {
  /**
   * Maximum number of live entities.
   */
  readonly capacity: number;

  private readonly maxComponents: number;
  private readonly words: number;
  private readonly masks: Uint32Array;
  private readonly alive: Uint8Array;
  private readonly free: number[] = [];
  private readonly registry = new Map<ComponentDef, Registered>();
  private readonly queries = new Map<string, Query>();
  private systems: SystemEntry[] = [];
  private nextId = 0;
  private liveCount = 0;
  private structure = 0;
  private restores = 0;

  /**
   * @throws {RangeError} if `capacity` or `maxComponents` is not a positive integer.
   */
  constructor(options: WorldOptions = {}) {
    this.capacity = options.capacity ?? 10_000;
    this.maxComponents = options.maxComponents ?? 64;
    if (!Number.isInteger(this.capacity) || this.capacity < 1) {
      throw new RangeError('World: capacity must be a positive integer');
    }
    if (!Number.isInteger(this.maxComponents) || this.maxComponents < 1) {
      throw new RangeError('World: maxComponents must be a positive integer');
    }
    this.words = Math.ceil(this.maxComponents / 32);
    this.masks = new Uint32Array(this.capacity * this.words);
    this.alive = new Uint8Array(this.capacity);
  }

  /**
   * Number of live entities.
   */
  get size(): number {
    return this.liveCount;
  }

  /**
   * @internal Changes whenever an entity or component is added or removed.
   */
  get structureVersion(): number {
    return this.structure;
  }

  /**
   * Counts how many times the world was cleared or restored. Code that holds entity ids can
   * compare it to know its ids may now mean something else.
   */
  get restoreVersion(): number {
    return this.restores;
  }

  /**
   * Creates an entity and returns its id.
   *
   * @throws {RangeError} when the world is at capacity.
   */
  createEntity(): number {
    let id = this.free.pop();
    if (id === undefined) {
      if (this.nextId >= this.capacity) throw new RangeError('World: capacity reached');
      id = this.nextId;
      this.nextId += 1;
    }
    this.alive[id] = 1;
    this.liveCount += 1;
    this.structure += 1;
    return id;
  }

  /**
   * Creates an entity with a given id, for restoring a saved world. Ids below the highest one
   * that were never used stay free.
   *
   * @throws {RangeError} if `id` is not an integer below `capacity`.
   * @throws {Error} if the id is already alive.
   */
  createEntityAt(id: number): void {
    if (!Number.isInteger(id) || id < 0 || id >= this.capacity) {
      throw new RangeError(`World: entity id ${id} is outside the capacity`);
    }
    if (this.isAlive(id)) throw new Error(`World: entity ${id} is already alive`);
    if (id >= this.nextId) {
      for (let unused = this.nextId; unused < id; unused++) this.free.push(unused);
      this.nextId = id + 1;
    } else {
      this.free.splice(this.free.indexOf(id), 1);
    }
    this.alive[id] = 1;
    this.liveCount += 1;
    this.structure += 1;
  }

  /**
   * Destroys every entity and forgets all ids, so the next entity is `0` again.
   */
  clear(): void {
    this.masks.fill(0);
    this.alive.fill(0);
    this.free.length = 0;
    this.nextId = 0;
    this.liveCount = 0;
    this.structure += 1;
    this.restores += 1;
  }

  /**
   * Captures the live entities and the data of the named components as plain JSON. Components
   * that are not in `components` are not saved. Values that are not finite are saved as `0`.
   *
   * @example
   * const snapshot = world.snapshot({ Position, Health });
   */
  snapshot(components: Readonly<Record<string, ComponentDef>>): WorldSnapshot {
    const entities: { id: number; components: Record<string, number[]> }[] = [];
    for (let id = 0; id < this.nextId; id++) {
      if (this.alive[id] !== 1) continue;
      const saved: Record<string, number[]> = {};
      for (const [name, definition] of Object.entries(components)) {
        const registered = this.registry.get(definition);
        if (registered === undefined || !this.hasBit(id, registered.bit)) continue;
        const values: number[] = [];
        for (const field of Object.keys(definition.schema)) {
          const value = registered.store[field]?.[id] ?? 0;
          values.push(Number.isFinite(value) ? value : 0);
        }
        saved[name] = values;
      }
      entities.push({ id, components: saved });
    }
    return { entities };
  }

  /**
   * Replaces the whole world with a snapshot, keeping entity ids. Systems and queries stay.
   * Nothing changes if the snapshot is invalid.
   *
   * @throws {SnapshotError} if the snapshot is malformed, names an unknown component or an
   * entity that does not fit the capacity.
   */
  restore(snapshot: unknown, components: Readonly<Record<string, ComponentDef>>): void {
    const entities = this.validate(snapshot, components);
    this.clear();
    for (const { id, saved } of entities) {
      this.createEntityAt(id);
      for (const [name, values] of saved) {
        const definition = components[name] as ComponentDef;
        const fields = Object.keys(definition.schema);
        const given: Record<string, number> = {};
        for (const [index, field] of fields.entries()) given[field] = values[index] ?? 0;
        this.addComponent(id, definition, given);
      }
    }
  }

  private validate(
    snapshot: unknown,
    components: Readonly<Record<string, ComponentDef>>,
  ): { id: number; saved: [string, number[]][] }[] {
    const list = (snapshot as { entities?: unknown } | null)?.entities;
    if (!Array.isArray(list)) throw new SnapshotError('snapshot.entities must be an array');
    const seen = new Set<number>();
    const result: { id: number; saved: [string, number[]][] }[] = [];
    for (const entry of list as unknown[]) {
      const { id, components: data } = (entry ?? {}) as { id?: unknown; components?: unknown };
      if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= this.capacity) {
        throw new SnapshotError(
          `an entity id is invalid or beyond the capacity of ${this.capacity}`,
        );
      }
      if (seen.has(id)) throw new SnapshotError(`entity ${id} appears twice`);
      seen.add(id);
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new SnapshotError(`entity ${id} has no components object`);
      }
      const saved: [string, number[]][] = [];
      for (const [name, values] of Object.entries(data)) {
        const definition = components[name];
        if (definition === undefined) throw new SnapshotError(`unknown component "${name}"`);
        const expected = Object.keys(definition.schema).length;
        if (
          !Array.isArray(values) ||
          values.length !== expected ||
          !(values as unknown[]).every(isNumber)
        ) {
          throw new SnapshotError(`entity ${id}: "${name}" needs ${expected} numbers`);
        }
        saved.push([name, values as number[]]);
      }
      result.push({ id, saved });
    }
    return result;
  }

  /**
   * Destroys an entity and clears its components. Ids are recycled, so drop references to a
   * destroyed entity.
   */
  destroyEntity(entity: number): void {
    if (!this.isAlive(entity)) return;
    const base = entity * this.words;
    for (let word = 0; word < this.words; word++) this.masks[base + word] = 0;
    this.alive[entity] = 0;
    this.free.push(entity);
    this.liveCount -= 1;
    this.structure += 1;
  }

  /**
   * Whether `entity` is a live entity of this world.
   */
  isAlive(entity: number): boolean {
    return entity >= 0 && entity < this.nextId && this.alive[entity] === 1;
  }

  /**
   * Returns the typed arrays of `component` in this world, registering it on first use. Read and
   * write fields by entity id: `pos.x[entity] += 1`.
   *
   * @throws {RangeError} if the world already has `maxComponents` component types.
   */
  use<S extends Schema>(component: ComponentDef<S>): Store<S> {
    return this.register(component).store as unknown as Store<S>;
  }

  /**
   * Adds `component` to `entity`, optionally setting field values (others reset to `0`).
   *
   * @throws {Error} if the entity is not alive.
   */
  addComponent<S extends Schema>(
    entity: number,
    component: ComponentDef<S>,
    values: Values<S> = {},
  ): void {
    if (!this.isAlive(entity)) throw new Error(`World: entity ${entity} is not alive`);
    const { bit, store } = this.register(component);
    const given: Readonly<Record<string, number | undefined>> = values;
    for (const field of Object.keys(component.schema)) {
      const array = store[field];
      if (array !== undefined) array[entity] = given[field] ?? 0;
    }
    const index = entity * this.words + (bit >>> 5);
    const before = this.masks[index] ?? 0;
    const after = (before | (1 << (bit & 31))) >>> 0;
    if (after !== before) {
      this.masks[index] = after;
      this.structure += 1;
    }
  }

  /**
   * Removes `component` from `entity`. No-op when it does not have it.
   */
  removeComponent(entity: number, component: ComponentDef): void {
    if (!this.isAlive(entity)) return;
    const registered = this.registry.get(component);
    if (registered === undefined) return;
    const index = entity * this.words + (registered.bit >>> 5);
    const before = this.masks[index] ?? 0;
    const after = (before & ~(1 << (registered.bit & 31))) >>> 0;
    if (after !== before) {
      this.masks[index] = after;
      this.structure += 1;
    }
  }

  /**
   * Whether `entity` has `component`.
   */
  hasComponent(entity: number, component: ComponentDef): boolean {
    if (!this.isAlive(entity)) return false;
    const registered = this.registry.get(component);
    return registered !== undefined && this.hasBit(entity, registered.bit);
  }

  /**
   * Creates (or reuses) a query for entities with every plain term and none of the {@link not}
   * terms.
   *
   * @example
   * const moving = world.query(Position, Velocity, not(Frozen));
   * for (const entity of moving.entities) pos.x[entity] += vel.vx[entity];
   */
  query(...terms: QueryTerm[]): Query {
    const include: number[] = [];
    const exclude: number[] = [];
    for (const term of terms) {
      if (term instanceof ComponentDef) include.push(this.register(term).bit);
      else exclude.push(this.register(term.not).bit);
    }
    include.sort(byNumber);
    exclude.sort(byNumber);
    const key = `${include.join(',')}|${exclude.join(',')}`;
    let query = this.queries.get(key);
    if (query === undefined) {
      query = new Query(this, include, exclude);
      this.queries.set(key, query);
    }
    return query;
  }

  /**
   * Adds a system. Returns a function that removes it.
   */
  addSystem(system: System, options: SystemOptions = {}): () => void {
    const entry: SystemEntry = { system, order: options.order ?? 0 };
    const systems = [...this.systems, entry];
    systems.sort(bySystemOrder);
    this.systems = systems;
    return () => {
      this.systems = this.systems.filter(isNot(entry));
    };
  }

  /**
   * Runs every system once with the step length in seconds.
   */
  update(deltaTime: number): void {
    for (const entry of this.systems) entry.system(this, deltaTime);
  }

  /**
   * @internal Used by {@link Query}.
   */
  collect(include: readonly number[], exclude: readonly number[], into: number[]): number[] {
    into.length = 0;
    for (let entity = 0; entity < this.nextId; entity++) {
      if (this.alive[entity] !== 1) continue;
      if (this.matches(entity, include, exclude)) into.push(entity);
    }
    return into;
  }

  private matches(entity: number, include: readonly number[], exclude: readonly number[]): boolean {
    for (const bit of include) if (!this.hasBit(entity, bit)) return false;
    for (const bit of exclude) if (this.hasBit(entity, bit)) return false;
    return true;
  }

  private hasBit(entity: number, bit: number): boolean {
    const word = this.masks[entity * this.words + (bit >>> 5)] ?? 0;
    return (word & (1 << (bit & 31))) !== 0;
  }

  private register(component: ComponentDef): Registered {
    const existing = this.registry.get(component);
    if (existing !== undefined) return existing;
    const bit = this.registry.size;
    if (bit >= this.maxComponents) {
      throw new RangeError(`World: more than ${this.maxComponents} component types`);
    }
    const store: FieldStore = {};
    for (const field of Object.keys(component.schema)) {
      const type = component.schema[field] as FieldType;
      store[field] = new ARRAY_TYPES[type](this.capacity);
    }
    const registered: Registered = { bit, store };
    this.registry.set(component, registered);
    return registered;
  }
}
