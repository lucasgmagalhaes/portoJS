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
      const gpu = (navigator as { gpu?: { requestAdapter(): Promise<GPUAdapter | null> } }).gpu;
      const adapter = await gpu?.requestAdapter();
      if (adapter === undefined || adapter === null) return false;
      try {
        (await adapter.requestDevice()).destroy();
        return true;
      } catch {
        return false;
      }
    });
    if (process.env['CI'] !== undefined) expect(available, 'WebGPU adapter in CI').toBe(true);
    else test.skip(!available, 'WebGPU is not available in this browser');
    page.on('console', (message) => console.log(`[page ${message.type()}] ${message.text()}`));
    page.on('pageerror', (error) => console.log(`[page error] ${error.message}`));
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const original = GPUAdapter.prototype.requestDevice;
      GPUAdapter.prototype.requestDevice = async function (this: GPUAdapter, descriptor) {
        const device = await original.call(this, descriptor);
        device.addEventListener('uncapturederror', (event) => {
          console.error(`uncaptured: ${event.error.message}`);
        });
        console.log(
          `adapter: ${this.info.vendor} ${this.info.architecture} ${this.info.description}`,
        );
        return device;
      };
    });
    await open(page, 'webgpu', 0);
    expect(await page.evaluate(() => window.__demo?.backend)).toBe('webgpu');
    await page.evaluate(() => {
      window.__demo?.spawnBox(0, 0, 100, 0x00ff00ff);
    });
    await page.evaluate(() => {
      window.__demo?.frame(0);
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    const shot = (await page.locator('#stage').screenshot()).toString('base64');
    await test
      .info()
      .attach('webgpu.png', { body: Buffer.from(shot, 'base64'), contentType: 'image/png' });
    const centre = await page.evaluate(async (data) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = surface.getContext('2d') as OffscreenCanvasRenderingContext2D;
      context.drawImage(bitmap, 0, 0);
      return Array.from(context.getImageData(bitmap.width >> 1, bitmap.height >> 1, 1, 1).data);
    }, shot);
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
