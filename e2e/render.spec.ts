import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const BASE = 'http://localhost:4174/';

type Backend = 'webgl2' | 'webgpu';

async function open(page: Page, backend: Backend, count: number): Promise<void> {
  await page.goto(`${BASE}?backend=${backend}&paused=1&count=${count}`);
  await page.waitForFunction(() => window.__demo !== undefined, undefined, { timeout: 15_000 });
}

async function pixel(page: Page, x: number, y: number): Promise<readonly number[]> {
  return page.evaluate(([px, py]) => window.__demo?.readPixel(px ?? 0, py ?? 0) ?? [], [x, y]);
}

test.describe('WebGL2 renderer', () => {
  test('draws a tinted sprite over the clear colour', async ({ page }) => {
    await open(page, 'webgl2', 0);
    expect(await page.evaluate(() => window.__demo?.backend)).toBe('webgl2');
    const size = await page.evaluate(() => {
      const canvas = document.getElementById('stage') as HTMLCanvasElement;
      return [canvas.width, canvas.height];
    });
    const cx = Math.floor((size[0] ?? 0) / 2);
    const cy = Math.floor((size[1] ?? 0) / 2);

    await page.evaluate(() => {
      window.__demo?.spawnBox(0, 0, 100, 0xff0000ff);
    });
    const centre = await pixel(page, cx, cy);
    expect(centre.slice(0, 3)).toEqual([255, 0, 0]);
    const corner = await pixel(page, 2, 2);
    expect(corner[0]).toBeLessThan(30);
    expect(corner[2]).toBeGreaterThan(10);
  });

  test('draws thousands of sprites in a frame', async ({ page }) => {
    await open(page, 'webgl2', 10_000);
    const lit = await page.evaluate(() => {
      const demo = window.__demo;
      if (demo === undefined) return 0;
      let found = 0;
      for (let x = 0; x < 400; x += 20) {
        const [r = 0, g = 0, b = 0] = demo.readPixel(x, 300);
        if (r + g + b > 120) found += 1;
      }
      return found;
    });
    expect(lit).toBeGreaterThan(3);
  });
});

test.describe('WebGPU renderer', () => {
  test('draws a tinted sprite when WebGPU is available', async ({ page }) => {
    await page.goto(`${BASE}?paused=1&count=0`);
    const available = await page.evaluate(async () => {
      const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      return gpu !== undefined && (await gpu.requestAdapter()) !== null;
    });
    test.skip(!available, 'WebGPU is not available in this browser');
    await open(page, 'webgpu', 0);
    expect(await page.evaluate(() => window.__demo?.backend)).toBe('webgpu');
    await page.evaluate(() => {
      window.__demo?.spawnBox(0, 0, 100, 0x00ff00ff);
    });
    const size = await page.evaluate(() => {
      const canvas = document.getElementById('stage') as HTMLCanvasElement;
      return [canvas.width, canvas.height];
    });
    const centre = await pixel(
      page,
      Math.floor((size[0] ?? 0) / 2),
      Math.floor((size[1] ?? 0) / 2),
    );
    expect(centre.slice(0, 3)).toEqual([0, 255, 0]);
  });
});

declare global {
  interface Window {
    __demo?: {
      readonly backend: string;
      readonly count: number;
      frame(dt: number): void;
      spawnBox(x: number, y: number, size: number, color: number): void;
      readPixel(x: number, y: number): readonly number[];
    };
  }
}
