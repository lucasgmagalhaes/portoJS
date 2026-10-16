import type { PhysicsWorld } from './physics-world.ts';
import type { RigidBody2D } from './rigid-body.ts';

/**
 * A point in a body's own space, in world units from the body's centre.
 */
export interface Anchor {
  readonly x: number;
  readonly y: number;
}

/**
 * What a joint does between two bodies:
 *
 * - `revolute`: the bodies share a pivot and can rotate around it, like a hinge or pendulum.
 * - `rope`: the anchors can be at most `length` apart, and slack closer.
 * - `spring`: pulls the anchors towards `restLength` apart with `stiffness`, damped by `damping`.
 * - `prismatic`: the second body slides along `axis` relative to the first, like a piston.
 * - `fixed`: welds the bodies together at their current relative pose.
 */
export type JointSpec =
  | { readonly kind: 'revolute' }
  | { readonly kind: 'rope'; readonly length: number }
  | {
      readonly kind: 'spring';
      readonly restLength: number;
      readonly stiffness: number;
      readonly damping?: number;
    }
  | { readonly kind: 'prismatic'; readonly axis: { readonly x: number; readonly y: number } }
  | { readonly kind: 'fixed' };

/**
 * Options of {@link PhysicsWorld.createJoint}.
 */
export interface JointOptions {
  /**
   * A point in world coordinates where the joint attaches to both bodies, as they are now. The
   * natural way to place a hinge. Overrides `anchorA` and `anchorB`.
   */
  readonly worldAnchor?: Anchor;
  /**
   * Where the joint attaches to the first body, from its centre in its own space. Default its
   * centre.
   */
  readonly anchorA?: Anchor;
  /**
   * Where the joint attaches to the second body, from its centre in its own space. Default its
   * centre.
   */
  readonly anchorB?: Anchor;
}

/**
 * A constraint between two bodies, from {@link PhysicsWorld.createJoint}. It goes away when you
 * call {@link Joint.remove} or when either body is destroyed.
 */
export class Joint {
  private removedFlag = false;

  /**
   * @internal Use {@link PhysicsWorld.createJoint}.
   */
  constructor(
    readonly bodyA: RigidBody2D,
    readonly bodyB: RigidBody2D,
    private readonly world: PhysicsWorld,
    private readonly handle: number,
  ) {}

  /**
   * `true` once the joint was removed, by you or because a body was destroyed.
   */
  get removed(): boolean {
    return this.removedFlag || !this.world.hasJoint(this.handle);
  }

  /**
   * Removes the joint and wakes the bodies. Does nothing if it is already gone.
   */
  remove(): void {
    if (this.removed) return;
    this.removedFlag = true;
    this.world.removeJoint(this.handle);
  }
}
