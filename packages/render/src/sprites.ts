import { defineComponent } from '@portojs/ecs';
import type { System, World } from '@portojs/ecs';
import type { SpriteBatch, Texture } from './batch.js';

/**
 * Position, rotation (radians) and scale of an entity.
 */
export const Transform = defineComponent({
  x: 'f32',
  y: 'f32',
  rotation: 'f32',
  scaleX: 'f32',
  scaleY: 'f32',
});

/**
 * How an entity is drawn. `texture` is a {@link Texture} id; `width` and `height` are the
 * unscaled size in world units.
 */
export const Sprite = defineComponent({
  texture: 'u32',
  width: 'f32',
  height: 'f32',
  originX: 'f32',
  originY: 'f32',
  u: 'f32',
  v: 'f32',
  uWidth: 'f32',
  vHeight: 'f32',
  color: 'u32',
  layer: 'i16',
});

/**
 * Options for {@link spawnSprite}.
 */
export interface SpawnSpriteOptions {
  readonly x?: number;
  readonly y?: number;
  readonly rotation?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  /**
   * Size in world units. Default is the texture size.
   */
  readonly width?: number;
  /**
   * Size in world units. Default is the texture size.
   */
  readonly height?: number;
  /**
   * Tint as `0xRRGGBBAA`. Default `0xffffffff`.
   */
  readonly color?: number;
  /**
   * Draw order. Default `0`.
   */
  readonly layer?: number;
}

/**
 * Creates an entity with a {@link Transform} and a {@link Sprite} using sensible defaults.
 *
 * @returns the entity id.
 */
export function spawnSprite(
  world: World,
  texture: Texture,
  options: SpawnSpriteOptions = {},
): number {
  const entity = world.createEntity();
  world.addComponent(entity, Transform, {
    x: options.x ?? 0,
    y: options.y ?? 0,
    rotation: options.rotation ?? 0,
    scaleX: options.scaleX ?? 1,
    scaleY: options.scaleY ?? 1,
  });
  world.addComponent(entity, Sprite, {
    texture: texture.id,
    width: options.width ?? texture.width,
    height: options.height ?? texture.height,
    originX: 0.5,
    originY: 0.5,
    u: 0,
    v: 0,
    uWidth: 1,
    vHeight: 1,
    color: options.color ?? 0xffffffff,
    layer: options.layer ?? 0,
  });
  return entity;
}

/**
 * Creates a system that, every step, clears `batch` and adds one sprite per entity that has both
 * {@link Transform} and {@link Sprite}. Entities whose texture is not in `textures` are skipped.
 * Draw afterwards with `renderer.render(camera, batch.build())`.
 *
 * @example
 * const batch = new SpriteBatch();
 * world.addSystem(createSpriteSystem(world, textures, batch), { order: 100 });
 */
export function createSpriteSystem(
  world: World,
  textures: ReadonlyMap<number, Texture>,
  batch: SpriteBatch,
): System {
  const transform = world.use(Transform);
  const sprite = world.use(Sprite);
  const drawable = world.query(Transform, Sprite);

  return function collectSprites(): void {
    batch.clear();
    for (const entity of drawable.entities) {
      const texture = textures.get(sprite.texture[entity] ?? 0);
      if (texture === undefined) continue;
      batch.addRaw(
        texture,
        sprite.layer[entity] ?? 0,
        transform.x[entity] ?? 0,
        transform.y[entity] ?? 0,
        (sprite.width[entity] ?? 0) * (transform.scaleX[entity] ?? 1),
        (sprite.height[entity] ?? 0) * (transform.scaleY[entity] ?? 1),
        transform.rotation[entity] ?? 0,
        sprite.originX[entity] ?? 0.5,
        sprite.originY[entity] ?? 0.5,
        sprite.u[entity] ?? 0,
        sprite.v[entity] ?? 0,
        sprite.uWidth[entity] ?? 1,
        sprite.vHeight[entity] ?? 1,
        sprite.color[entity] ?? 0xffffffff,
      );
    }
  };
}
