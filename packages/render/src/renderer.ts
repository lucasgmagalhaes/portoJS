import type { BatchResult, Texture } from './batch.ts';
import type { Camera2D } from './camera.ts';
import type { RendererEvent } from './context-loss.ts';

/**
 * Anything a texture can be created from.
 */
export type TextureSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;

/**
 * Which graphics API a renderer uses.
 */
export type RendererBackend = 'webgpu' | 'webgl2';

/**
 * Clear colour as `[r, g, b, a]`, each `0` to `1`.
 */
export type ClearColor = readonly [number, number, number, number];

/**
 * A region of the drawing buffer, in pixels, with the origin at the top left.
 */
export interface RenderViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Options of {@link Renderer.render}.
 */
export interface RenderOptions {
  /**
   * Draw only inside this region of the canvas, for split screen or a minimap. Give the camera
   * the same size with `camera.setViewport(width, height)`. Default: the whole canvas.
   */
  readonly viewport?: RenderViewport;
  /**
   * Clear the whole canvas to the clear colour first. Default `true`. For several views in one
   * frame, clear on the first call and pass `false` on the others.
   */
  readonly clear?: boolean;
}

/**
 * Draws batched sprites to a canvas. Get one with {@link createRenderer}.
 */
export interface Renderer {
  /**
   * The API in use.
   */
  readonly backend: RendererBackend;
  /**
   * The canvas being drawn to.
   */
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  /**
   * Whether the GPU has taken the resources away and they are not back yet. While `true`,
   * `render` draws nothing and textures created are uploaded when the context returns.
   */
  readonly lost: boolean;
  /**
   * Listens to context loss and recovery. The renderer keeps what it needs to rebuild itself:
   * keep the image behind every texture alive (do not `close()` an `ImageBitmap` you gave it)
   * and re-draw when `contextrestored` fires.
   *
   * @returns a function that removes the listener.
   */
  on(event: RendererEvent, listener: () => void): () => void;
  /**
   * Uploads an image to the GPU.
   */
  createTexture(source: TextureSource): Texture;
  /**
   * Frees a texture. Do not draw with it afterwards.
   */
  deleteTexture(texture: Texture): void;
  /**
   * Resizes the drawing buffer, in pixels. Keep the camera's viewport in sync.
   */
  resize(width: number, height: number): void;
  /**
   * Clears the canvas (unless `options.clear` is `false`) and draws the batch: one instanced
   * draw call per group.
   */
  render(camera: Camera2D, batch: BatchResult, options?: RenderOptions): void;
  /**
   * Releases GPU resources.
   */
  destroy(): void;
}

/**
 * Options for {@link createRenderer}.
 */
export interface RendererOptions {
  /**
   * `auto` tries WebGPU and falls back to WebGL2. Default `auto`.
   */
  readonly backend?: 'auto' | RendererBackend;
  /**
   * Colour the canvas is cleared to every frame. Default transparent black.
   */
  readonly clearColor?: ClearColor;
}

/**
 * Bytes per sprite instance (12 floats).
 */
export const INSTANCE_BYTES = 48;

/**
 * Size of the camera matrix in bytes (a 4x4 float matrix).
 */
export const MATRIX_BYTES = 64;
