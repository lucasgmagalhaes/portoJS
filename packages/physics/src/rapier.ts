import type * as RapierNamespace from '@dimforge/rapier2d-compat';

/**
 * The Rapier module, initialised: the namespace you get from `@dimforge/rapier2d-compat`.
 */
export type Rapier = typeof RapierNamespace;

/**
 * Loads and initialises Rapier's 2D physics engine (WebAssembly embedded in the package).
 * Await it once and pass the result to `PhysicsWorld`.
 *
 * @example
 * const rapier = await loadRapier();
 * game.createObject('Physics').addComponent(PhysicsWorld, { rapier });
 */
export async function loadRapier(): Promise<Rapier> {
  const module = await import('@dimforge/rapier2d-compat');
  await module.init();
  return module;
}
