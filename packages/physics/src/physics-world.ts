import { Component, GameEvent } from '@portojs/runtime';
import type { GameObject } from '@portojs/runtime';
import type { Rapier } from './rapier.ts';
import type { RigidBody2D } from './rigid-body.ts';

/**
 * Options of {@link PhysicsWorld}.
 */
export interface PhysicsWorldOptions {
  /**
   * The module from `loadRapier`.
   */
  rapier: Rapier;
  /**
   * Gravity in world units per second squared. The y axis points down, like the renderer's
   * camera, so the default `{ x: 0, y: 9.81 }` pulls things down the screen.
   */
  gravity?: { x: number; y: number };
  /**
   * Names of the collision layers, up to 16. Bodies pick one with `layer` and the layers they hit
   * with `collidesWith`; queries filter with `layers`. Without names every body hits every other.
   */
  layers?: readonly string[];
}

/**
 * Filters shared by the queries of {@link PhysicsWorld}.
 */
export interface QueryOptions {
  /**
   * Only consider bodies on these layers. Default all.
   */
  layers?: readonly string[];
  /**
   * Include sensors. Default `false`.
   */
  includeSensors?: boolean;
  /**
   * Ignore this body, for example the one casting the ray.
   */
  exclude?: RigidBody2D;
}

/**
 * What a ray hit.
 */
export interface RayHit {
  /**
   * The body that was hit.
   */
  body: RigidBody2D;
  /**
   * Where the ray hit, in world coordinates.
   */
  point: { x: number; y: number };
  /**
   * Surface normal at the hit, pointing away from the body.
   */
  normal: { x: number; y: number };
  /**
   * Distance from the origin to the hit.
   */
  distance: number;
}

const ALL_LAYERS = 0xffff;
const MAX_LAYERS = 16;

/**
 * A pair of bodies that started or stopped touching.
 */
export interface CollisionEvent {
  /**
   * One of the two bodies.
   */
  a: RigidBody2D;
  /**
   * The other body.
   */
  b: RigidBody2D;
}

/**
 * The simulation: owns a Rapier world and steps it once per fixed update, so physics runs at the
 * game's fixed timestep and is deterministic for a given sequence of steps. Add one per game and
 * add `RigidBody2D` components to objects.
 *
 * @example
 * const rapier = await loadRapier();
 * const physics = game.createObject('Physics').addComponent(PhysicsWorld, { rapier });
 */
export class PhysicsWorld extends Component {
  static override typeId = 'PhysicsWorld';
  static override executionOrder = -1000;

  /**
   * The Rapier module this world was created with.
   */
  readonly rapier: Rapier;
  /**
   * The underlying Rapier world, for anything this package does not wrap.
   */
  readonly world: InstanceType<Rapier['World']>;
  /**
   * Raised when two bodies start touching. Sensors raise it when something enters them.
   */
  readonly collisionStarted = new GameEvent<CollisionEvent>();
  /**
   * Raised when two bodies stop touching.
   */
  readonly collisionEnded = new GameEvent<CollisionEvent>();

  private readonly layerBits = new Map<string, number>();
  private readonly events: InstanceType<Rapier['EventQueue']>;
  private readonly bodiesByCollider = new Map<number, RigidBody2D>();

  /**
   * @param gameObject the object this component is attached to.
   * @param options Rapier and gravity.
   */
  constructor(gameObject: GameObject, options: PhysicsWorldOptions) {
    super(gameObject);
    this.rapier = options.rapier;
    const gravity = options.gravity ?? { x: 0, y: 9.81 };
    this.world = new options.rapier.World(gravity);
    this.events = new options.rapier.EventQueue(true);
    const layers = options.layers ?? [];
    if (layers.length > MAX_LAYERS) {
      throw new RangeError(`PhysicsWorld: at most ${MAX_LAYERS} layers are supported`);
    }
    for (const name of layers) {
      if (this.layerBits.has(name)) throw new RangeError(`PhysicsWorld: duplicate layer "${name}"`);
      this.layerBits.set(name, 1 << this.layerBits.size);
    }
  }

  /**
   * Rapier collision groups for a body on `layer` that hits `collidesWith`. Called by
   * `RigidBody2D`.
   *
   * @throws {RangeError} for a layer that was not declared.
   */
  groupsFor(layer: string | undefined, collidesWith: readonly string[] | undefined): number {
    const member = layer === undefined ? ALL_LAYERS : this.bit(layer);
    const filter = collidesWith === undefined ? ALL_LAYERS : this.maskOf(collidesWith);
    return ((member << 16) | filter) >>> 0;
  }

  /**
   * The first body a ray hits, or `undefined`.
   *
   * @param origin start of the ray.
   * @param direction direction of the ray; it need not be normalised.
   * @param maxDistance how far to look.
   */
  raycast(
    origin: { x: number; y: number },
    direction: { x: number; y: number },
    maxDistance: number,
    options: QueryOptions = {},
  ): RayHit | undefined {
    const length = Math.hypot(direction.x, direction.y);
    if (!(length > 0)) throw new RangeError('raycast: direction cannot be zero');
    const unit = { x: direction.x / length, y: direction.y / length };
    const hit = this.world.castRayAndGetNormal(
      new this.rapier.Ray(origin, unit),
      maxDistance,
      true,
      this.flags(options),
      this.queryGroups(options),
      undefined,
      options.exclude?.rigidBody,
    );
    const body = hit === null ? undefined : this.bodiesByCollider.get(hit.collider.handle);
    if (hit === null || body === undefined) return undefined;
    return {
      body,
      distance: hit.timeOfImpact,
      point: {
        x: origin.x + unit.x * hit.timeOfImpact,
        y: origin.y + unit.y * hit.timeOfImpact,
      },
      normal: { x: hit.normal.x, y: hit.normal.y },
    };
  }

  /**
   * Bodies that contain the point.
   */
  overlapPoint(x: number, y: number, options: QueryOptions = {}): RigidBody2D[] {
    const found: RigidBody2D[] = [];
    this.world.intersectionsWithPoint(
      { x, y },
      this.collect(found),
      this.flags(options),
      this.queryGroups(options),
      undefined,
      options.exclude?.rigidBody,
    );
    return found;
  }

  /**
   * Bodies that overlap a circle.
   */
  overlapCircle(x: number, y: number, radius: number, options: QueryOptions = {}): RigidBody2D[] {
    return this.overlapShape(new this.rapier.Ball(radius), x, y, 0, options);
  }

  /**
   * Bodies that overlap a box of `width` by `height` centred on `(x, y)`, optionally rotated.
   */
  overlapBox(
    x: number,
    y: number,
    width: number,
    height: number,
    rotation = 0,
    options: QueryOptions = {},
  ): RigidBody2D[] {
    return this.overlapShape(
      new this.rapier.Cuboid(width / 2, height / 2),
      x,
      y,
      rotation,
      options,
    );
  }

  private overlapShape(
    shape: InstanceType<Rapier['Ball']> | InstanceType<Rapier['Cuboid']>,
    x: number,
    y: number,
    rotation: number,
    options: QueryOptions,
  ): RigidBody2D[] {
    const found: RigidBody2D[] = [];
    this.world.intersectionsWithShape(
      { x, y },
      rotation,
      shape,
      this.collect(found),
      this.flags(options),
      this.queryGroups(options),
      undefined,
      options.exclude?.rigidBody,
    );
    return found;
  }

  private collect(found: RigidBody2D[]): (collider: { handle: number }) => boolean {
    return (collider) => {
      const body = this.bodiesByCollider.get(collider.handle);
      if (body !== undefined) found.push(body);
      return true;
    };
  }

  private flags(options: QueryOptions): number {
    return options.includeSensors === true ? 0 : this.rapier.QueryFilterFlags.EXCLUDE_SENSORS;
  }

  private queryGroups(options: QueryOptions): number {
    const mask = options.layers === undefined ? ALL_LAYERS : this.maskOf(options.layers);
    return ((ALL_LAYERS << 16) | mask) >>> 0;
  }

  private maskOf(names: readonly string[]): number {
    let mask = 0;
    for (const name of names) mask |= this.bit(name);
    return mask;
  }

  private bit(name: string): number {
    const bit = this.layerBits.get(name);
    if (bit === undefined) throw new RangeError(`PhysicsWorld: unknown layer "${name}"`);
    return bit;
  }

  /**
   * Number of bodies in the simulation.
   */
  get bodyCount(): number {
    return this.world.bodies.len();
  }

  /**
   * Registers a body's collider so collisions can be mapped back to it. Called by `RigidBody2D`.
   *
   * @param colliderHandle the Rapier collider handle.
   * @param body the component that owns it.
   */
  register(colliderHandle: number, body: RigidBody2D): void {
    this.bodiesByCollider.set(colliderHandle, body);
  }

  /**
   * Forgets a collider. Called by `RigidBody2D`.
   *
   * @param colliderHandle the Rapier collider handle.
   */
  unregister(colliderHandle: number): void {
    this.bodiesByCollider.delete(colliderHandle);
  }

  /**
   * Advances the simulation by `deltaTime` seconds, then updates every body's cached pose and
   * raises collision events. Runs on its own every fixed update.
   *
   * @param deltaTime seconds to simulate.
   */
  override fixedUpdate(deltaTime: number): void {
    this.world.timestep = deltaTime;
    this.world.step(this.events);
    for (const body of this.bodiesByCollider.values()) body.syncFromPhysics();
    this.events.drainCollisionEvents(this.dispatchCollision);
  }

  override onDestroy(): void {
    this.bodiesByCollider.clear();
    this.events.free();
    this.world.free();
  }

  private readonly dispatchCollision = (first: number, second: number, started: boolean): void => {
    const a = this.bodiesByCollider.get(first);
    const b = this.bodiesByCollider.get(second);
    if (a === undefined || b === undefined) return;
    const event = started ? this.collisionStarted : this.collisionEnded;
    event.invoke({ a, b });
    (started ? a.collisionStarted : a.collisionEnded).invoke(b);
    (started ? b.collisionStarted : b.collisionEnded).invoke(a);
  };
}
