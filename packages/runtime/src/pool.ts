import type { GameObject } from './game-object.ts';

/**
 * Options of a {@link Pool}.
 */
export interface PoolOptions<A> {
  /**
   * Prefix for the objects' names, which must be unique in a game. Objects are named
   * `<name>#1`, `<name>#2`...
   */
  readonly name: string;
  /**
   * Builds a new object with the given name, usually with `game.instantiate(prefab, name)`.
   */
  readonly create: (name: string) => GameObject;
  /**
   * Objects to build up front, ready and inactive. Default `0`.
   */
  readonly prewarm?: number;
  /**
   * Most objects the pool will ever have, in use and waiting. Default no limit.
   */
  readonly max?: number;
  /**
   * Called each time an object leaves the pool, after it is switched on. Reset its state here.
   */
  readonly onGet?: (object: GameObject, argument: A) => void;
  /**
   * Called when an object comes back, before it is switched off.
   */
  readonly onRelease?: (object: GameObject) => void;
}

/**
 * Reuses game objects instead of creating and destroying them, for things that appear in large
 * numbers such as bullets and particles. Released objects are switched off and kept for the next
 * {@link Pool.get}.
 *
 * Pooled objects are still part of the game, so their components are saved and found by queries
 * even while switched off. Keep `max` modest.
 *
 * @example
 * const bullets = new Pool(game, {
 *   name: 'Bullet',
 *   create: (name) => game.instantiate(bulletPrefab, name),
 *   prewarm: 20,
 *   onGet: (bullet, at: { x: number; y: number }) => bullet.requireComponent(Mover).moveTo(at),
 * });
 * const bullet = bullets.get({ x: 0, y: 0 });
 * bullets.release(bullet);
 */
export class Pool<A = undefined> {
  private readonly free: GameObject[] = [];
  private readonly used = new Set<GameObject>();
  private created = 0;

  /**
   * @throws {RangeError} if `prewarm` or `max` is not valid.
   */
  constructor(private readonly options: PoolOptions<A>) {
    const { prewarm = 0, max } = options;
    if (!Number.isInteger(prewarm) || prewarm < 0) {
      throw new RangeError('Pool: prewarm must be an integer >= 0');
    }
    if (max !== undefined && (!Number.isInteger(max) || max < 1)) {
      throw new RangeError('Pool: max must be an integer >= 1');
    }
    if (max !== undefined && prewarm > max) {
      throw new RangeError('Pool: prewarm cannot be above max');
    }
    for (let index = 0; index < prewarm; index++) {
      const object = this.build();
      object.setActive(false);
      this.free.push(object);
    }
  }

  /**
   * Objects waiting to be reused.
   */
  get available(): number {
    return this.free.length;
  }

  /**
   * Objects handed out and not yet released.
   */
  get inUse(): number {
    return this.used.size;
  }

  /**
   * Takes an object: a waiting one, or a new one if the pool is below `max`. The object is
   * switched on and `onGet` runs.
   *
   * @throws {RangeError} when `max` objects exist and none is waiting. Use {@link Pool.tryGet}
   * to get `undefined` instead.
   */
  get(...argument: undefined extends A ? [argument?: A] : [argument: A]): GameObject {
    const object = this.tryGet(...argument);
    if (object === undefined) {
      throw new RangeError(
        `Pool "${this.options.name}": all ${this.options.max} objects are in use`,
      );
    }
    return object;
  }

  /**
   * Like {@link Pool.get}, but returns `undefined` when the pool is full.
   */
  tryGet(
    ...argument: undefined extends A ? [argument?: A] : [argument: A]
  ): GameObject | undefined {
    let object = this.free.pop();
    while (object?.isDestroyed === true) object = this.free.pop();
    if (object === undefined) {
      if (this.options.max !== undefined && this.size >= this.options.max) return undefined;
      object = this.build();
    }
    this.used.add(object);
    object.setActive(true);
    this.options.onGet?.(object, argument[0] as A);
    return object;
  }

  /**
   * Gives an object back: `onRelease` runs and the object is switched off.
   *
   * @throws {Error} if the object is not one this pool handed out.
   */
  release(object: GameObject): void {
    if (!this.used.delete(object)) {
      throw new Error(`Pool "${this.options.name}": ${object.name} is not in use from this pool`);
    }
    if (object.isDestroyed) return;
    this.options.onRelease?.(object);
    object.setActive(false);
    this.free.push(object);
  }

  /**
   * Gives back every object in use.
   */
  releaseAll(): void {
    for (const object of [...this.used]) this.release(object);
  }

  /**
   * Destroys the waiting objects. Objects in use are left alone.
   */
  clear(): void {
    for (const object of this.free) object.destroy();
    this.free.length = 0;
  }

  /**
   * Objects the pool has, in use and waiting.
   */
  get size(): number {
    return this.free.length + this.used.size;
  }

  private build(): GameObject {
    this.created += 1;
    return this.options.create(`${this.options.name}#${this.created}`);
  }
}
