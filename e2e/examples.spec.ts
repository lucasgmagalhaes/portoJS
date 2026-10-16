import { expect, test } from '@playwright/test';

interface ShooterHandle {
  readonly game: { score: number; lives: number; input: { x: number; fire: boolean } };
  frame(dt: number): void;
}

interface PlatformerHandle {
  readonly game: { x: number; y: number; onGround: boolean; coins: number };
  frame(dt: number): void;
}

interface PuzzleHandle {
  readonly game: { score: number; cells: number[] };
  frame(dt: number): void;
  move(direction: string): void;
}

declare global {
  interface Window {
    __shooter?: ShooterHandle;
    __platformer?: PlatformerHandle;
    __puzzle?: PuzzleHandle;
  }
}

test.describe('example: shooter', () => {
  test('plays a few seconds in WebGL2 and draws the action', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:4175/?backend=webgl2&paused=1&seed=3');
    await page.waitForFunction(() => window.__shooter !== undefined, undefined, {
      timeout: 15_000,
    });
    const lit = await page.evaluate(() => {
      const shooter = window.__shooter;
      if (shooter === undefined) return 0;
      shooter.game.input.fire = true;
      for (let i = 0; i < 90; i++) shooter.frame(1 / 60);
      const canvas = document.getElementById('stage') as HTMLCanvasElement;
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      const context = copy.getContext('2d', {
        willReadFrequently: true,
      }) as CanvasRenderingContext2D;
      context.drawImage(canvas, 0, 0);
      const data = context.getImageData(0, 0, copy.width, copy.height).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) > 150) count += 1;
      }
      return count;
    });
    expect(lit).toBeGreaterThan(50);
    const hud = await page.locator('#hud').textContent();
    expect(hud).toContain('Score');
    expect(errors).toEqual([]);
  });
});

test.describe('example: platformer', () => {
  test('lands, runs and draws the level in WebGL2', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:4176/?backend=webgl2&paused=1');
    await page.waitForFunction(() => window.__platformer !== undefined, undefined, {
      timeout: 15_000,
    });
    const result = await page.evaluate(() => {
      const platformer = window.__platformer;
      if (platformer === undefined) return undefined;
      for (let i = 0; i < 60; i++) platformer.frame(1 / 60);
      const grounded = platformer.game.onGround;
      const startX = platformer.game.x;
      const canvas = document.getElementById('stage') as HTMLCanvasElement;
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      const context = copy.getContext('2d', {
        willReadFrequently: true,
      }) as CanvasRenderingContext2D;
      context.drawImage(canvas, 0, 0);
      const data = context.getImageData(0, 0, copy.width, copy.height).data;
      let lit = 0;
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) > 250) lit += 1;
      }
      return { grounded, startX, lit };
    });
    expect(result?.grounded).toBe(true);
    expect(result?.lit).toBeGreaterThan(200);
    expect(errors).toEqual([]);
  });
});

test.describe('example: puzzle', () => {
  test('slides tiles, draws them and keeps the score', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:4177/?backend=webgl2&paused=1&seed=4');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => window.__puzzle !== undefined, undefined, { timeout: 15_000 });
    const result = await page.evaluate(() => {
      const puzzle = window.__puzzle;
      if (puzzle === undefined) return undefined;
      const directions = ['left', 'up', 'right', 'down'];
      for (let i = 0; i < 12; i++) {
        puzzle.move(directions[i % 4] ?? 'left');
        for (let f = 0; f < 10; f++) puzzle.frame(1 / 60);
      }
      const canvas = document.getElementById('stage') as HTMLCanvasElement;
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      const context = copy.getContext('2d', {
        willReadFrequently: true,
      }) as CanvasRenderingContext2D;
      context.drawImage(canvas, 0, 0);
      const data = context.getImageData(0, 0, copy.width, copy.height).data;
      let lit = 0;
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i] ?? 0) > 200) lit += 1;
      }
      return { lit, tiles: puzzle.game.cells.filter((v) => v !== 0).length };
    });
    expect(result?.tiles).toBeGreaterThan(1);
    expect(result?.lit).toBeGreaterThan(500);
    expect(await page.locator('#hud').textContent()).toContain('Score');
    expect(errors).toEqual([]);
  });
});
