import { test } from '@playwright/test';

test('diag webgpu present', async ({ page }) => {
  page.on('console', (m) => console.log(`[page ${m.type()}] ${m.text()}`));
  await page.goto('http://localhost:4174/?backend=webgpu&paused=1&count=0');
  await page.waitForFunction(() => window.__demo !== undefined);
  const out = await page.evaluate(async () => {
    const demo = window.__demo as {
      spawnBox(x: number, y: number, s: number, c: number): void;
      frame(dt: number): void;
      readPixel(x: number, y: number): number[];
    };
    demo.spawnBox(0, 0, 100, 0x00ff00ff);
    const lines: string[] = [];
    lines.push(`same task: ${demo.readPixel(640, 360).join(',')}`);
    await new Promise((r) => requestAnimationFrame(r));
    lines.push(`next rAF: ${demo.readPixel(640, 360).join(',')}`);
    await new Promise((r) => setTimeout(r, 500));
    lines.push(`after 500ms: ${demo.readPixel(640, 360).join(',')}`);
    const canvas = document.getElementById('stage') as HTMLCanvasElement;
    lines.push(`canvas ${canvas.width}x${canvas.height} client ${canvas.clientWidth}x${canvas.clientHeight}`);
    return lines.join(' | ');
  });
  console.log(`DIAG ${out}`);
});
