import type { Renderer, RendererOptions } from './renderer.js';
import { createWebGL2Renderer } from './webgl2.js';
import { createWebGPURenderer } from './webgpu.js';

const TRANSPARENT = [0, 0, 0, 0] as const;

/**
 * Creates a renderer for a canvas: WebGPU when available, otherwise WebGL2. The canvas must not
 * already have a different kind of context.
 *
 * @example
 * const renderer = await createRenderer(canvas, { clearColor: [0.1, 0.1, 0.12, 1] });
 * const texture = renderer.createTexture(await createImageBitmap(blob));
 *
 * @throws {Error} if the requested backend is not available.
 */
export async function createRenderer(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options: RendererOptions = {},
): Promise<Renderer> {
  const clearColor = options.clearColor ?? TRANSPARENT;
  const backend = options.backend ?? 'auto';
  if (backend !== 'webgl2') {
    const gpu = await createWebGPURenderer(canvas, clearColor);
    if (gpu !== undefined) return gpu;
    if (backend === 'webgpu') throw new Error('createRenderer: WebGPU is not available');
  }
  const gl = createWebGL2Renderer(canvas, clearColor);
  if (gl === undefined) throw new Error('createRenderer: neither WebGPU nor WebGL2 is available');
  return gl;
}
