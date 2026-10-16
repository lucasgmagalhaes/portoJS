/**
 * 2D physics for PortoJS on Rapier: rigid bodies, colliders and collision events as components.
 *
 * @module @portojs/physics
 */

export { loadRapier } from './rapier.ts';
export type { Rapier } from './rapier.ts';
export { PhysicsWorld } from './physics-world.ts';
export type { CollisionEvent, PhysicsWorldOptions, QueryOptions, RayHit } from './physics-world.ts';
export { RigidBody2D } from './rigid-body.ts';
export type { BodyShape, BodyType, RigidBodyOptions } from './rigid-body.ts';
