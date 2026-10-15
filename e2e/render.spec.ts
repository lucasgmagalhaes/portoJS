import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type * as BatchSource from '../packages/render/src/batch.ts';
import type * as CameraSource from '../packages/render/src/camera.ts';
import type * as WebGPUSource from '../packages/render/src/webgpu.ts';

const BASE = 'http://localhost:4174/';

type WebGPUModule = typeof WebGPUSource;
type CameraModule = typeof CameraSource;
type BatchModule = typeof BatchSource;

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
  test('draws a tinted sprite through the real pipeline', async ({ page }) => {
    await page.goto(`${BASE}?paused=1&count=0`);
    const base = process.cwd().replaceAll(String.fromCharCode(92), '/');
    const modules = {
      webgpu: `/@fs/${base}/packages/render/src/webgpu.ts`,
      camera: `/@fs/${base}/packages/render/src/camera.ts`,
      batch: `/@fs/${base}/packages/render/src/batch.ts`,
    };
    const result = await page.evaluate(async (urls) => {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter === null) return { available: false, pixels: [] as number[] };
      let device: GPUDevice;
      try {
        device = await adapter.requestDevice();
      } catch {
        return { available: false, pixels: [] as number[] };
      }
      const [{ WebGPURenderer }, { Camera2D }, { SpriteBatch }] = await Promise.all([
        import(urls.webgpu) as Promise<WebGPUModule>,
        import(urls.camera) as Promise<CameraModule>,
        import(urls.batch) as Promise<BatchModule>,
      ]);
      const size = 64;
      const target = device.createTexture({
        size: [size, size],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      const context = {
        getCurrentTexture: () => target,
        unconfigure: () => undefined,
      } as unknown as GPUCanvasContext;
      const canvas = document.createElement('canvas');
      const renderer = new WebGPURenderer(canvas, device, context, 'rgba8unorm', [0, 0, 0, 1]);
      const surface = document.createElement('canvas');
      surface.width = 4;
      surface.height = 4;
      const paint = surface.getContext('2d') as CanvasRenderingContext2D;
      paint.fillStyle = '#ffffff';
      paint.fillRect(0, 0, 4, 4);
      const texture = renderer.createTexture(await createImageBitmap(surface));
      const batch = new SpriteBatch(8);
      batch.add(texture, { x: 0, y: 0, width: 32, height: 32, color: 0x00ff00ff });
      renderer.render(new Camera2D(size, size), batch.build());

      const readback = device.createBuffer({
        size: 256 * size,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: 256 }, [
        size,
        size,
      ]);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const bytes = new Uint8Array(readback.getMappedRange());
      const at = (x: number, y: number): number[] => {
        const offset = y * 256 + x * 4;
        return [bytes[offset] ?? -1, bytes[offset + 1] ?? -1, bytes[offset + 2] ?? -1];
      };
      return { available: true, pixels: [...at(32, 32), ...at(2, 2)] };
    }, modules);

    if (process.env['CI'] !== undefined) expect(result.available, 'WebGPU device in CI').toBe(true);
    else test.skip(!result.available, 'WebGPU is not available in this browser');
    expect(result.pixels).toEqual([0, 255, 0, 0, 0, 0]);
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
