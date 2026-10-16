import { Input } from '@portojs/input';
import {
  Camera2D,
  CameraController,
  SpriteBatch,
  applyViewport,
  computeViewport,
  createRenderer,
} from '@portojs/render';
import type { Texture } from '@portojs/render';
import { TileMapView } from '@portojs/tilemap';
import { Platformer } from './game.ts';
import { TILE, loadLevel } from './level.ts';

const params = new URLSearchParams(location.search);
const paused = params.get('paused') === '1';
const requested = params.get('backend');
const backend = requested === 'webgl2' || requested === 'webgpu' ? requested : 'auto';
const WORLD_HEIGHT = 12 * TILE;

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;

function drawTiles(): Promise<ImageBitmap> {
  const surface = document.createElement('canvas');
  surface.width = TILE * 4;
  surface.height = TILE;
  const context = surface.getContext('2d') as CanvasRenderingContext2D;
  context.fillStyle = '#5b6b8c';
  context.fillRect(0, 0, TILE, TILE);
  context.fillStyle = '#7e90b8';
  context.fillRect(0, 0, TILE, 3);
  context.translate(TILE, 0);
  context.fillStyle = '#ff5d6c';
  context.beginPath();
  context.moveTo(0, TILE);
  context.lineTo(TILE / 4, TILE / 2);
  context.lineTo(TILE / 2, TILE);
  context.lineTo((TILE * 3) / 4, TILE / 2);
  context.lineTo(TILE, TILE);
  context.fill();
  return createImageBitmap(surface);
}

function drawWhite(): Promise<ImageBitmap> {
  const surface = document.createElement('canvas');
  surface.width = 4;
  surface.height = 4;
  const context = surface.getContext('2d') as CanvasRenderingContext2D;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 4, 4);
  return createImageBitmap(surface);
}

async function main(): Promise<void> {
  const map = loadLevel();
  const renderer = await createRenderer(canvas, { backend, clearColor: [0.08, 0.1, 0.16, 1] });
  const tiles: Texture = renderer.createTexture(await drawTiles());
  const white: Texture = renderer.createTexture(await drawWhite());
  const view = new TileMapView(map, new Map([['tiles', tiles]]));
  const game = new Platformer(view);

  const camera = new Camera2D(640, 360);
  const controller = new CameraController(camera);
  controller.follow({
    target: () => ({ x: game.x + game.width / 2, y: game.y }),
    smoothTime: 0.15,
    offset: { x: 0, y: -TILE * 2 },
  });
  controller.setBounds({ x: 0, y: 0, width: map.width * TILE, height: map.height * TILE });
  controller.snapTo(game.x, game.y);

  function fit(): void {
    const layout = computeViewport({
      mode: 'fixedHeight',
      designWidth: 640,
      designHeight: WORLD_HEIGHT,
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
  input.bind('jump', 'key:Space', 'key:ArrowUp', 'key:KeyW');

  const batch = new SpriteBatch(4096);
  function draw(): void {
    batch.clear();
    view.draw(batch, camera, { time: game.time });
    for (const coin of game.objects('coin')) {
      if (game.collected.has(coin.id)) continue;
      batch.add(white, {
        x: coin.x + TILE / 2,
        y: coin.y + TILE / 2,
        width: 8,
        height: 8,
        rotation: Math.PI / 4,
        color: 0xffd23fff,
        layer: 5,
      });
    }
    for (const goal of game.objects('goal')) {
      batch.add(white, {
        x: goal.x + TILE / 2,
        y: goal.y + TILE / 2,
        width: 6,
        height: TILE,
        color: 0x6dffa0ff,
        layer: 5,
      });
    }
    batch.add(white, {
      x: game.x + game.width / 2,
      y: game.y + game.height / 2,
      width: game.width,
      height: game.height,
      color: 0x8fd3ffff,
      layer: 10,
    });
    renderer.render(camera, batch.build());
    hud.textContent = game.won
      ? `You made it! Coins ${game.coins}/${game.objects('coin').length}, deaths ${game.deaths}`
      : `Coins ${game.coins}/${game.objects('coin').length}   Deaths ${game.deaths}   Arrows or WASD to move, Space to jump`;
  }

  function frame(dt: number): void {
    game.step(dt, {
      axis: input.axis('left', 'right'),
      jumpPressed: input.wasPressed('jump'),
      jumpHeld: input.isDown('jump'),
    });
    controller.update(dt);
    draw();
    input.endFrame();
  }

  (window as unknown as { __platformer: unknown }).__platformer = {
    game,
    frame,
    backend: renderer.backend,
  };
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
