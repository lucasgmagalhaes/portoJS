import { World, defineComponent } from '@portojs/ecs';
import { Rng } from '@portojs/math';
import {
  Camera2D,
  SpriteBatch,
  Transform,
  applyViewport,
  computeViewport,
  containerToViewport,
  createRenderer,
  createSpriteSystem,
  spawnSprite,
} from '@portojs/render';
import type { ViewportLayout } from '@portojs/render';

// The game is designed for a 320 x 180 world. 'fit' shows all of it on any screen.
const DESIGN_WIDTH = 320;
const DESIGN_HEIGHT = 180;

const Velocity = defineComponent({ vx: 'f32', vy: 'f32', spin: 'f32' });

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;

async function drawDisc(): Promise<ImageBitmap> {
  const surface = document.createElement('canvas');
  surface.width = 16;
  surface.height = 16;
  const context = surface.getContext('2d') as CanvasRenderingContext2D;
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(8, 8, 7.5, 0, Math.PI * 2);
  context.fill();
  return createImageBitmap(surface);
}

const renderer = await createRenderer(canvas, { clearColor: [0.06, 0.07, 0.11, 1] });
const disc = renderer.createTexture(await drawDisc());
const textures = new Map([[disc.id, disc]]);

const camera = new Camera2D(DESIGN_WIDTH, DESIGN_HEIGHT);
camera.x = DESIGN_WIDTH / 2;
camera.y = DESIGN_HEIGHT / 2;

let layout: ViewportLayout = computeViewport({
  mode: 'fit',
  designWidth: DESIGN_WIDTH,
  designHeight: DESIGN_HEIGHT,
  containerWidth: window.innerWidth,
  containerHeight: window.innerHeight,
});

function fit(): void {
  layout = computeViewport({
    mode: 'fit',
    designWidth: DESIGN_WIDTH,
    designHeight: DESIGN_HEIGHT,
    containerWidth: window.innerWidth,
    containerHeight: window.innerHeight,
    pixelRatio: window.devicePixelRatio,
  });
  canvas.style.width = `${layout.cssWidth}px`;
  canvas.style.height = `${layout.cssHeight}px`;
  canvas.style.left = `${layout.offsetX}px`;
  canvas.style.top = `${layout.offsetY}px`;
  renderer.resize(layout.pixelWidth, layout.pixelHeight);
  applyViewport(camera, layout);
}
fit();
window.addEventListener('resize', fit);

// A seeded generator: the same seed always gives the same start, which helps when debugging.
const random = new Rng(2024);
const world = new World({ capacity: 5_000 });
const transform = world.use(Transform);
const velocity = world.use(Velocity);

function spawn(x: number, y: number): void {
  const entity = spawnSprite(world, disc, {
    x,
    y,
    width: 12,
    height: 12,
    color: (random.int(0x404040, 0xffffff) << 8) | 0xff,
  });
  world.addComponent(entity, Velocity, {
    vx: random.float(-60, 60),
    vy: random.float(-60, 60),
    spin: random.float(-3, 3),
  });
}

for (let i = 0; i < 20; i++) {
  spawn(random.float(0, DESIGN_WIDTH), random.float(0, DESIGN_HEIGHT));
}

const moving = world.query(Transform, Velocity);
function bounce(_world: World, dt: number): void {
  for (const e of moving.entities) {
    let x = (transform.x[e] ?? 0) + (velocity.vx[e] ?? 0) * dt;
    let y = (transform.y[e] ?? 0) + (velocity.vy[e] ?? 0) * dt;
    if (x < 0 || x > DESIGN_WIDTH) {
      velocity.vx[e] = -(velocity.vx[e] ?? 0);
      x = Math.min(DESIGN_WIDTH, Math.max(0, x));
    }
    if (y < 0 || y > DESIGN_HEIGHT) {
      velocity.vy[e] = -(velocity.vy[e] ?? 0);
      y = Math.min(DESIGN_HEIGHT, Math.max(0, y));
    }
    transform.x[e] = x;
    transform.y[e] = y;
    transform.rotation[e] = (transform.rotation[e] ?? 0) + (velocity.spin[e] ?? 0) * dt;
  }
}

const batch = new SpriteBatch(5_000);
world.addSystem(bounce, { order: 0 });
world.addSystem(createSpriteSystem(world, textures, batch), { order: 100 });

canvas.addEventListener('pointerdown', (event) => {
  if (world.size >= 5_000) return;
  const rect = canvas.getBoundingClientRect();
  const inBuffer = containerToViewport(
    layout,
    event.clientX - rect.left + layout.offsetX,
    event.clientY - rect.top + layout.offsetY,
  );
  const point = camera.screenToWorld(inBuffer.x, inBuffer.y);
  spawn(point.x, point.y);
});

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  world.update(dt);
  renderer.render(camera, batch.build());
  hud.textContent = `${renderer.backend} - ${world.size} sprites - click or tap to add more`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
