import { World, defineComponent, not } from '@portojs/ecs';
import {
  Camera2D,
  SpriteBatch,
  Transform,
  createRenderer,
  createSpriteSystem,
  spawnSprite,
} from '@portojs/render';
import type { Renderer, RendererBackend, Texture } from '@portojs/render';

const params = new URLSearchParams(location.search);
const count = Number(params.get('count') ?? 10_000);
const paused = params.get('paused') === '1';
const requested = params.get('backend');
const backend = requested === 'webgl2' || requested === 'webgpu' ? requested : 'auto';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;

const Velocity = defineComponent({ vx: 'f32', vy: 'f32', spin: 'f32' });
const Frozen = defineComponent({ flag: 'u8' });

function mulberry32(seed: number): () => number {
  let state = seed;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawTexture(round: boolean): HTMLCanvasElement {
  const surface = document.createElement('canvas');
  surface.width = 16;
  surface.height = 16;
  const context = surface.getContext('2d') as CanvasRenderingContext2D;
  context.fillStyle = '#ffffff';
  if (round) {
    context.beginPath();
    context.arc(8, 8, 7.5, 0, Math.PI * 2);
    context.fill();
  } else {
    context.fillRect(0, 0, 16, 16);
  }
  return surface;
}

interface Demo {
  readonly backend: RendererBackend;
  readonly count: number;
  frame(dt: number): void;
  spawnBox(x: number, y: number, size: number, color: number): void;
  readPixel(x: number, y: number): readonly number[];
}

declare global {
  interface Window {
    __demo?: Demo;
  }
}

async function main(): Promise<void> {
  const renderer: Renderer = await createRenderer(canvas, {
    backend,
    clearColor: [0.06, 0.06, 0.09, 1],
  });
  const camera = new Camera2D(800, 600);
  const pixelRatio = Math.min(window.devicePixelRatio, 2);

  function fit(): void {
    const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));
    renderer.resize(width, height);
    camera.setViewport(width, height);
  }
  fit();
  window.addEventListener('resize', fit);

  const disc: Texture = renderer.createTexture(drawTexture(true));
  const box: Texture = renderer.createTexture(drawTexture(false));
  const textures = new Map<number, Texture>([
    [disc.id, disc],
    [box.id, box],
  ]);

  const world = new World({ capacity: count + 64 });
  const velocity = world.use(Velocity);
  const transform = world.use(Transform);
  const random = mulberry32(1234);
  const half = 600;

  for (let i = 0; i < count; i++) {
    const entity = spawnSprite(world, i % 2 === 0 ? disc : box, {
      x: (random() * 2 - 1) * half,
      y: (random() * 2 - 1) * half,
      width: 10,
      height: 10,
      rotation: random() * Math.PI,
      color: (Math.floor(random() * 0xffffff) << 8) | 0xff,
    });
    world.addComponent(entity, Velocity, {
      vx: (random() * 2 - 1) * 120,
      vy: (random() * 2 - 1) * 120,
      spin: (random() * 2 - 1) * 3,
    });
  }

  const moving = world.query(Transform, Velocity, not(Frozen));
  function move(_world: World, dt: number): void {
    for (const e of moving.entities) {
      let x = (transform.x[e] ?? 0) + (velocity.vx[e] ?? 0) * dt;
      let y = (transform.y[e] ?? 0) + (velocity.vy[e] ?? 0) * dt;
      if (x > half || x < -half) {
        velocity.vx[e] = -(velocity.vx[e] ?? 0);
        x = Math.max(-half, Math.min(half, x));
      }
      if (y > half || y < -half) {
        velocity.vy[e] = -(velocity.vy[e] ?? 0);
        y = Math.max(-half, Math.min(half, y));
      }
      transform.x[e] = x;
      transform.y[e] = y;
      transform.rotation[e] = (transform.rotation[e] ?? 0) + (velocity.spin[e] ?? 0) * dt;
    }
  }

  const batch = new SpriteBatch(count + 64);
  world.addSystem(move, { order: 0 });
  world.addSystem(createSpriteSystem(world, textures, batch), { order: 100 });

  function frame(dt: number): void {
    world.update(dt);
    renderer.render(camera, batch.build());
  }

  const scratch = document.createElement('canvas');
  window.__demo = {
    backend: renderer.backend,
    count,
    frame,
    spawnBox(x, y, size, color) {
      spawnSprite(world, box, { x, y, width: size, height: size, color });
    },
    readPixel(x, y) {
      frame(0);
      scratch.width = canvas.width;
      scratch.height = canvas.height;
      const context = scratch.getContext('2d', {
        willReadFrequently: true,
      }) as CanvasRenderingContext2D;
      context.drawImage(canvas, 0, 0);
      return Array.from(context.getImageData(x, y, 1, 1).data);
    },
  };

  let last = performance.now();
  let frames = 0;
  let shown = last;
  function loop(now: number): void {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    frame(dt);
    frames += 1;
    if (now - shown >= 500) {
      const fps = Math.round((frames * 1000) / (now - shown));
      hud.textContent = `${renderer.backend} - ${count.toLocaleString()} sprites - ${fps} fps`;
      frames = 0;
      shown = now;
    }
    requestAnimationFrame(loop);
  }
  hud.textContent = `${renderer.backend} - ${count.toLocaleString()} sprites`;
  if (!paused) requestAnimationFrame(loop);
}

main().catch((error: unknown) => {
  hud.textContent = String(error);
  throw error;
});
