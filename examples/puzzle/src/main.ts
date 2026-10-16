import { GestureRecognizer, Pointer } from '@portojs/input';
import {
  Camera2D,
  CanvasText,
  SpriteBatch,
  applyViewport,
  computeViewport,
  createRenderer,
} from '@portojs/render';
import type { Texture } from '@portojs/render';
import { Tweens } from '@portojs/tween';
import { Puzzle } from './game.ts';
import type { Direction, PuzzleState } from './game.ts';

const params = new URLSearchParams(location.search);
const paused = params.get('paused') === '1';
const requested = params.get('backend');
const backend = requested === 'webgl2' || requested === 'webgpu' ? requested : 'auto';
const SAVE_KEY = 'portojs-puzzle';
const CELL = 100;
const GAP = 10;
const SLIDE_SECONDS = 0.12;

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;

interface Tile {
  x: number;
  y: number;
  scale: number;
  value: number;
}

const COLORS: Record<number, number> = {
  2: 0xeee4daff,
  4: 0xede0c8ff,
  8: 0xf2b179ff,
  16: 0xf59563ff,
  32: 0xf67c5fff,
  64: 0xf65e3bff,
  128: 0xedcf72ff,
  256: 0xedcc61ff,
  512: 0xedc850ff,
  1024: 0xedc53fff,
  2048: 0xedc22eff,
};

function load(game: Puzzle): void {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw !== null) game.load(JSON.parse(raw) as PuzzleState);
  } catch {
    localStorage.removeItem(SAVE_KEY);
  }
}

function save(game: Puzzle): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.save()));
  } catch {
    return;
  }
}

function white(): Promise<ImageBitmap> {
  const surface = document.createElement('canvas');
  surface.width = 4;
  surface.height = 4;
  const context = surface.getContext('2d') as CanvasRenderingContext2D;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 4, 4);
  return createImageBitmap(surface);
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  return surface;
}

async function main(): Promise<void> {
  const game = new Puzzle({ seed: Number(params.get('seed') ?? 1) });
  load(game);
  const side = 4 * CELL + 5 * GAP;
  const renderer = await createRenderer(canvas, { backend, clearColor: [0.1, 0.09, 0.08, 1] });
  const pixel: Texture = renderer.createTexture(await white());
  const camera = new Camera2D(side, side);
  camera.x = side / 2;
  camera.y = side / 2;
  const batch = new SpriteBatch(512);
  const tweens = new Tweens();
  const labels = new Map<number, CanvasText<HTMLCanvasElement>>();

  function fit(): void {
    const layout = computeViewport({
      mode: 'fit',
      designWidth: side,
      designHeight: side,
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

  const place = (index: number): number => GAP + index * (CELL + GAP) + CELL / 2;
  function settled(): Tile[] {
    const tiles: Tile[] = [];
    for (let y = 0; y < game.size; y++) {
      for (let x = 0; x < game.size; x++) {
        const value = game.at(x, y);
        if (value !== 0) tiles.push({ x: place(x), y: place(y), scale: 1, value });
      }
    }
    return tiles;
  }

  let tiles = settled();
  let sliding = 0;

  function label(value: number): CanvasText<HTMLCanvasElement> {
    let text = labels.get(value);
    if (text === undefined) {
      text = new CanvasText(renderer, makeCanvas);
      text.set(String(value), {
        font: `bold ${value >= 1024 ? 34 : 44}px sans-serif`,
        color: value <= 4 ? '#776e65' : '#ffffff',
      });
      labels.set(value, text);
    }
    return text;
  }

  function move(direction: Direction): void {
    if (sliding > 0) return;
    const result = game.move(direction);
    if (!result.moved) return;
    tiles = result.slides.map((slide) => ({
      x: place(slide.fromX),
      y: place(slide.fromY),
      scale: 1,
      value: slide.value,
    }));
    for (const [index, slide] of result.slides.entries()) {
      const tile = tiles[index];
      if (tile) {
        tweens.to(tile, { x: place(slide.toX), y: place(slide.toY) }, {
          duration: SLIDE_SECONDS,
          ease: 'quadOut',
        });
      }
    }
    sliding = SLIDE_SECONDS;
    save(game);
  }

  function finishSlide(): void {
    tiles = settled();
    for (const tile of tiles) {
      tweens.from(tile, { scale: 0.7 }, { duration: 0.1, ease: 'quadOut' });
    }
  }

  const pointer = new Pointer(canvas);
  const gestures = new GestureRecognizer();
  gestures.attach(pointer);
  gestures.swipe.addListener((swipe) => move(swipe.direction));
  const keys: Record<string, Direction> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    KeyA: 'left',
    KeyD: 'right',
    KeyW: 'up',
    KeyS: 'down',
  };
  addEventListener('keydown', (event) => {
    const direction = keys[event.code];
    if (direction) {
      event.preventDefault();
      move(direction);
    }
  });
  (document.getElementById('undo') as HTMLElement).addEventListener('click', () => {
    if (game.undo()) {
      tiles = settled();
      save(game);
    }
  });
  (document.getElementById('restart') as HTMLElement).addEventListener('click', () => {
    game.restart();
    tiles = settled();
    save(game);
  });

  function draw(): void {
    batch.clear();
    batch.add(pixel, { x: side / 2, y: side / 2, width: side, height: side, color: 0xbbada0ff });
    for (let y = 0; y < game.size; y++) {
      for (let x = 0; x < game.size; x++) {
        batch.add(pixel, {
          x: place(x),
          y: place(y),
          width: CELL,
          height: CELL,
          color: 0xcdc1b4ff,
          layer: 1,
        });
      }
    }
    for (const tile of tiles) {
      batch.add(pixel, {
        x: tile.x,
        y: tile.y,
        width: CELL * tile.scale,
        height: CELL * tile.scale,
        color: COLORS[tile.value] ?? 0x3c3a32ff,
        layer: 2,
      });
      label(tile.value).draw(batch, {
        x: tile.x,
        y: tile.y,
        anchorX: 0.5,
        anchorY: 0.5,
        scale: tile.scale * 0.5,
        layer: 3,
      });
    }
    renderer.render(camera, batch.build());
    hud.textContent = `Score ${game.score}   Best ${game.best}${game.over ? '   Game over' : ''}`;
  }

  function frame(dt: number): void {
    tweens.update(dt);
    gestures.update(performance.now());
    if (sliding > 0) {
      sliding -= dt;
      if (sliding <= 0) {
        sliding = 0;
        finishSlide();
      }
    }
    draw();
  }

  (window as unknown as { __puzzle: unknown }).__puzzle = {
    game,
    frame,
    move,
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
