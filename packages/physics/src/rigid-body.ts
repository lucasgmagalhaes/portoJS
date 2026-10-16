import { Component, GameEvent } from '@portojs/runtime';
import type { GameObject } from '@portojs/runtime';
import { PhysicsWorld } from './physics-world.ts';

/**
 * How a body moves: `dynamic` is simulated, `fixed` never moves, `kinematic` moves only when you
 * set its velocity or position.
 */
export type BodyType = 'dynamic' | 'fixed' | 'kinematic';

/**
 * The collider shape: a box of `width` by `height` centred on the body, or a circle.
 */
export type BodyShape =
  { kind: 'box'; width: number; height: number } | { kind: 'circle'; radius: number };

/**
 * Options of {@link RigidBody2D}.
 */
export interface RigidBodyOptions {
  /**
   * Collider shape.
   */
  shape: BodyShape;
  /**
   * Default `dynamic`.
   */
  type?: BodyType;
  /**
   * Start position, default 0.
   */
  x?: number;
  /**
   * Start position, default 0.
   */
  y?: number;
  /**
   * Start rotation in radians, default 0.
   */
  rotation?: number;
  /**
   * Bounciness, 0 to 1. Default 0.
   */
  restitution?: number;
  /**
   * Friction coefficient, default 0.5.
   */
  friction?: number;
  /**
   * Mass per area, default 1.
   */
  density?: number;
  /**
   * A sensor detects overlaps and raises collision events but does not push anything.
   */
  sensor?: boolean;
  /**
   * The collision layer this body is on, one of the `layers` of the {@link PhysicsWorld}.
   */
  layer?: string;
  /**
   * The layers this body collides with. Default all.
   */
  collidesWith?: readonly string[];
}

/**
 * A rigid body with one collider, simulated by the game's {@link PhysicsWorld}. Read `x`, `y` and
 * `rotation` after each fixed step to place sprites, and use the collision events to react.
 *
 * @example
 * const ball = game.createObject('Ball').addComponent(RigidBody2D, {
 *   shape: { kind: 'circle', radius: 0.5 },
 *   x: 0,
 *   y: -5,
 *   restitution: 0.8,
 * });
 * ball.collisionStarted.addListener((other) => console.log('hit', other.gameObject.name));
 */
export class RigidBody2D extends Component {
  static override typeId = 'RigidBody2D';

  /**
   * Raised with the other body when this one starts touching it.
   */
  readonly collisionStarted = new GameEvent<RigidBody2D>();
  /**
   * Raised with the other body when this one stops touching it.
   */
  readonly collisionEnded = new GameEvent<RigidBody2D>();
  /**
   * World position after the last fixed step.
   */
  x: number;
  /**
   * World position after the last fixed step.
   */
  y: number;
  /**
   * Rotation in radians after the last fixed step.
   */
  rotation: number;

  private readonly physics: PhysicsWorld;
  /**
   * The underlying Rapier body, for anything this package does not wrap.
   */
  readonly rigidBody: ReturnType<PhysicsWorld['world']['createRigidBody']>;
  private readonly colliderHandle: number;

  /**
   * @param gameObject the object this component is attached to.
   * @param options shape and material.
   * @throws if the game has no {@link PhysicsWorld}.
   */
  constructor(gameObject: GameObject, options: RigidBodyOptions) {
    super(gameObject);
    const physics = gameObject.game.findObjectOfType(PhysicsWorld);
    if (physics === undefined) {
      throw new Error('RigidBody2D needs a PhysicsWorld component in the game');
    }
    this.physics = physics;
    const { rapier, world } = physics;
    this.x = options.x ?? 0;
    this.y = options.y ?? 0;
    this.rotation = options.rotation ?? 0;

    const type = options.type ?? 'dynamic';
    const description =
      type === 'dynamic'
        ? rapier.RigidBodyDesc.dynamic()
        : type === 'fixed'
          ? rapier.RigidBodyDesc.fixed()
          : rapier.RigidBodyDesc.kinematicVelocityBased();
    description.setTranslation(this.x, this.y).setRotation(this.rotation);
    this.rigidBody = world.createRigidBody(description);

    const shape = options.shape;
    const collider =
      shape.kind === 'box'
        ? rapier.ColliderDesc.cuboid(shape.width / 2, shape.height / 2)
        : rapier.ColliderDesc.ball(shape.radius);
    collider
      .setRestitution(options.restitution ?? 0)
      .setFriction(options.friction ?? 0.5)
      .setDensity(options.density ?? 1)
      .setSensor(options.sensor ?? false)
      .setCollisionGroups(physics.groupsFor(options.layer, options.collidesWith))
      .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS);
    const created = world.createCollider(collider, this.rigidBody);
    this.colliderHandle = created.handle;
    physics.register(this.colliderHandle, this);
  }

  /**
   * Linear velocity in world units per second.
   */
  get velocity(): { x: number; y: number } {
    const { x, y } = this.rigidBody.linvel();
    return { x, y };
  }

  /**
   * Sets the linear velocity.
   *
   * @param x world units per second.
   * @param y world units per second.
   */
  setVelocity(x: number, y: number): void {
    this.rigidBody.setLinvel({ x, y }, true);
  }

  /**
   * Gives the body an instant push, changing its velocity by `impulse / mass`.
   *
   * @param x impulse along x.
   * @param y impulse along y.
   */
  applyImpulse(x: number, y: number): void {
    this.rigidBody.applyImpulse({ x, y }, true);
  }

  /**
   * Teleports the body.
   *
   * @param x new x.
   * @param y new y.
   * @param rotation new rotation in radians; keeps the current one when omitted.
   */
  setPosition(x: number, y: number, rotation: number = this.rotation): void {
    this.rigidBody.setTranslation({ x, y }, true);
    this.rigidBody.setRotation(rotation, true);
    this.x = x;
    this.y = y;
    this.rotation = rotation;
  }

  /**
   * Copies the simulated pose into `x`, `y` and `rotation`. Called by {@link PhysicsWorld}.
   */
  syncFromPhysics(): void {
    const position = this.rigidBody.translation();
    this.x = position.x;
    this.y = position.y;
    this.rotation = this.rigidBody.rotation();
  }

  override onDestroy(): void {
    this.physics.unregister(this.colliderHandle);
    this.physics.world.removeRigidBody(this.rigidBody);
  }
}
