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
}

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
