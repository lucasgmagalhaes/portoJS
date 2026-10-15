import type { BatchResult, Texture } from './batch.js';
import type { Camera2D } from './camera.js';

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
   * Clears the canvas and draws the batch: one instanced draw call per group.
   */
  render(camera: Camera2D, batch: BatchResult): void;
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
