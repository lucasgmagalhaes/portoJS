import {
  createSpriteSystem,
  Camera2D,
  Sprite,
  SpriteBatch,
  Transform,
  createRenderer,
  spawnSprite,
} from '@portojs/render';
import type { Texture } from '@portojs/render';
import { World, defineComponent } from '@portojs/ecs';

/**
 * Step 1: describe what moves. Components are typed arrays, so ten thousand of them stay fast.
 */
export const Velocity = defineComponent({ vx: 'f32', vy: 'f32' });

/**
 * Step 2: build a world and fill it with sprites that share one texture.
 */
export function createWorld(texture: Texture, count: number) {
  const world = new World({ capacity: count + 16 });
  const transform = world.use(Transform);
  const velocity = world.use(Velocity);
  world.use(Sprite);

  for (let i = 0; i < count; i++) {
    const entity = spawnSprite(world, texture, {
      x: (i % 100) * 8,
      y: Math.floor(i / 100) * 8,
      width: 6,
      height: 6,
      color: 0x33ccffff,
    });
    world.addComponent(entity, Velocity, { vx: 20, vy: 10 });
  }

  const moving = world.query(Transform, Velocity);
  world.addSystem(
    (_world, dt) => {
      for (const e of moving.entities) {
        transform.x[e] = (transform.x[e] ?? 0) + (velocity.vx[e] ?? 0) * dt;
        transform.y[e] = (transform.y[e] ?? 0) + (velocity.vy[e] ?? 0) * dt;
      }
    },
    { order: 0 },
  );
  return world;
}

/**
 * Step 3: a system turns the world into draw calls. Sprites with the same texture become one
 * instanced draw.
 */
export function createFrame(world: World, texture: Texture) {
  const batch = new SpriteBatch(world.capacity);
  const textures = new Map<number, Texture>([[texture.id, texture]]);
  world.addSystem(createSpriteSystem(world, textures, batch), { order: 100 });
  return batch;
}

/**
 * Step 4: draw to a canvas. WebGPU is used when the browser has it, WebGL2 otherwise.
 */
export async function start(canvas: HTMLCanvasElement, count = 10_000): Promise<() => void> {
  const renderer = await createRenderer(canvas);
  const camera = new Camera2D(canvas.width, canvas.height);
  const surface = new OffscreenCanvas(4, 4);
  surface.getContext('2d')?.fillRect(0, 0, 4, 4);
  const texture = renderer.createTexture(await createImageBitmap(surface));

  const world = createWorld(texture, count);
  const batch = createFrame(world, texture);

  let running = true;
  let last = performance.now();
  const frame = (now: number): void => {
    if (!running) return;
    world.update(Math.min((now - last) / 1000, 0.05));
    last = now;
    renderer.render(camera, batch.build());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return () => {
    running = false;
  };
}
