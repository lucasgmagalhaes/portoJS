import type { GameObject } from './game-object.js';

/**
 * Builds the contents of an object created from a {@link Prefab}.
 */
export type PrefabBuilder<P> = (object: GameObject, params: P) => void;

/**
 * A reusable template for game objects, like a Unity prefab. It holds a builder that adds
 * components (and child objects) to a fresh object; create instances with
 * {@link Game.instantiate}. Parameters let one prefab produce variations.
 *
 * @example
 * const minerPrefab = new Prefab<{ gold: Resource; base: number }>((object, { gold, base }) => {
 *   object.addComponent(Generator, {
 *     cost: { resource: gold, base, growth: 1.15 },
 *     produces: gold,
 *     rate: 1,
 *   });
 * });
 * game.instantiate(minerPrefab, 'Miner1', { params: { gold, base: 10 } });
 * game.instantiate(minerPrefab, 'Miner2', { params: { gold, base: 100 } });
 */
export class Prefab<P = undefined> {
  /**
   * @param build adds components and children to a new object.
   * @param active initial `activeSelf` of every instance. Default `true`.
   */
  constructor(
    readonly build: PrefabBuilder<P>,
    readonly active = true,
  ) {}
}
