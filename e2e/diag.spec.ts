import { test } from '@playwright/test';

test('diag webgpu copy', async ({ page }) => {
  await page.goto('http://localhost:4174/?paused=1&count=0');
  const out = await page.evaluate(async () => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) return 'no adapter';
    const device = await adapter.requestDevice();
    const surface = document.createElement('canvas');
    surface.width = 16;
    surface.height = 16;
    const ctx = surface.getContext('2d') as CanvasRenderingContext2D;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 16, 16);
    const bitmap = await createImageBitmap(surface);
    const results: string[] = [];
    for (const [name, source] of [['canvas', surface], ['bitmap', bitmap]] as const) {
      const texture = device.createTexture({
        size: [16, 16],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      device.queue.copyExternalImageToTexture({ source }, { texture }, [16, 16]);
      const buffer = device.createBuffer({ size: 256 * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: 256 }, [16, 16]);
      device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      results.push(`${name}: ${Array.from(new Uint8Array(buffer.getMappedRange(0, 4))).join(',')}`);
    }
    return results.join(' | ');
  });
  console.log(`DIAG ${out}`);
});
