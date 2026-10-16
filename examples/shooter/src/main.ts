import { Input } from '@portojs/input';
import {
  Camera2D,
  ParticleEmitter,
  SpriteBatch,
  applyViewport,
  computeViewport,
  containerToViewport,
  createRenderer,
} from '@portojs/render';
import type { Texture, ViewportLayout } from '@portojs/render';
import { BULLET, ENEMY, SHIP, Shooter } from './game.ts';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 1);
const paused = params.get('paused') === '1';
const requested = params.get('backend');
const backend = requested === 'webgl2' || requested === 'webgpu' ? requested : 'auto';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;

async function whitePixel(): Promise<ImageBitmap> {
  const surface = document.createElement('canvas');
  surface.width = 4;
  surface.height = 4;
  const context = surface.getContext('2d') as CanvasRenderingContext2D;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 4, 4);
  return createImageBitmap(surface);
}

async function main(): Promise<void> {
  const game = new Shooter({ seed });
  const renderer = await createRenderer(canvas, { backend, clearColor: [0.02, 0.02, 0.05, 1] });
  const texture: Texture = renderer.createTexture(await whitePixel());
  const camera = new Camera2D(game.width, game.height);
  camera.x = game.width / 2;
  camera.y = game.height / 2;
  const batch = new SpriteBatch(4096);

  const sparks = new ParticleEmitter({
    texture,
    max: 600,
    rate: 0,
    lifetime: [0.3, 0.8],
    speed: [60, 260],
    angle: [0, Math.PI * 2],
    size: { start: 7, end: 1 },
    color: { start: 0xffc04dff, end: 0xff2a1a00 },
    drag: 1.5,
    layer: 5,
  });

  let layout: ViewportLayout = computeViewport({
    mode: 'fit',
    designWidth: game.width,
    designHeight: game.height,
    containerWidth: innerWidth,
    containerHeight: innerHeight,
    pixelRatio: Math.min(devicePixelRatio, 2),
  });
  function fit(): void {
    layout = computeViewport({
      mode: 'fit',
      designWidth: game.width,
      designHeight: game.height,
      containerWidth: innerWidth,
      containerHeight: innerHeight,
      pixelRatio: Math.min(devicePixelRatio, 2),
    });
    canvas.style.width = `${layout.cssWidth}px`;
    canvas.style.height = `${layout.cssHeight}px`;
    canvas.style.left = `${layout.offsetX}px`;
    canvas.style.top = `${layout.offsetY}px`;
    renderer.resize(layout.pixelWidth, layout.pixelHeight);
    applyViewport(camera, layout);
  }
  fit();
  addEventListener('resize', fit);

  const input = new Input({ pointerTarget: canvas });
  input.bind('left', 'key:ArrowLeft', 'key:KeyA');
  input.bind('right', 'key:ArrowRight', 'key:KeyD');
  input.bind('up', 'key:ArrowUp', 'key:KeyW');
  input.bind('down', 'key:ArrowDown', 'key:KeyS');
  input.bind('fire', 'key:Space', 'key:KeyZ');
  input.bind('restart', 'key:Enter');

  let touch: { x: number; y: number } | undefined;
  function track(event: PointerEvent): void {
    const bounds = canvas.getBoundingClientRect();
    const p = containerToViewport(
      { ...layout, offsetX: 0, offsetY: 0 },
      event.clientX - bounds.left,
      event.clientY - bounds.top,
    );
    const world = camera.screenToWorld(p.x, p.y);
    touch = { x: world.x, y: world.y };
  }
  canvas.addEventListener('pointerdown', track);
  canvas.addEventListener('pointermove', (event) => {
    if (touch) track(event);
  });
  addEventListener('pointerup', () => {
    touch = undefined;
  });

  function readInput(): void {
    game.input.x = input.axis('left', 'right');
    game.input.y = input.axis('up', 'down');
    game.input.fire = input.isDown('fire');
    if (touch) {
      const ship = game.ship;
      game.input.x = Math.max(-1, Math.min(1, ((touch.x - (game.motion.x[ship] ?? 0)) / 20) | 0));
      game.input.y = Math.max(
        -1,
        Math.min(1, ((touch.y - 60 - (game.motion.y[ship] ?? 0)) / 20) | 0),
      );
      game.input.fire = true;
    }
    if (game.over && input.wasPressed('restart')) game.restart();
  }

  function draw(): void {
    batch.clear();
    for (const entity of game.bodies.entities) {
      const team = game.body.team[entity];
      const radius = game.body.radius[entity] ?? 1;
      const x = game.motion.x[entity] ?? 0;
      const y = game.motion.y[entity] ?? 0;
      if (team === SHIP) {
        const blink = game.protection > 0 && Math.floor(game.protection * 12) % 2 === 0;
        batch.add(texture, {
          x,
          y,
          width: radius * 2,
          height: radius * 2.4,
          color: blink ? 0x66e0ff55 : 0x66e0ffff,
          layer: 3,
        });
      } else if (team === BULLET) {
        batch.add(texture, { x, y, width: 4, height: 14, color: 0xfff27aff, layer: 2 });
      } else if (team === ENEMY) {
        const big = radius > 20;
        batch.add(texture, {
          x,
          y,
          width: radius * 2,
          height: radius * 2,
          rotation: y / 40,
          color: big ? 0xff5a5aff : 0xc86bffff,
          layer: 1,
        });
      }
    }
    sparks.draw(batch);
    renderer.render(camera, batch.build());
    hud.textContent = game.over
      ? `Game over - score ${game.score} - press Enter`
      : `Score ${game.score}   Lives ${game.lives}   Wave ${game.wave}`;
  }

  function frame(dt: number): void {
    readInput();
    game.step(dt);
    for (const boom of game.explosions) {
      sparks.x = boom.x;
      sparks.y = boom.y;
      sparks.burst(boom.big ? 40 : 14);
    }
    sparks.update(dt);
    draw();
    input.endFrame();
  }

  (window as unknown as { __shooter: unknown }).__shooter = { game, frame, backend: renderer.backend };
  draw();
  if (paused) return;
  let last = performance.now();
  function loop(now: number): void {
    frame(Math.min((now - last) / 1000, 0.05));
    last = now;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

main().catch((error: unknown) => {
  hud.textContent = String(error);
  throw error;
});
