/**
 * 2D rendering for PortoJS: an orthographic camera, an auto-batching sprite renderer with WebGPU and WebGL2 backends and ECS integration.
 *
 * @module @portojs/render
 */

export { INSTANCE_FLOATS, SpriteBatch } from './batch.ts';
export type { BatchResult, DrawGroup, SpriteDraw, Texture } from './batch.ts';
export { Camera2D } from './camera.ts';
export type { Point } from './camera.ts';
export { createRenderer } from './create-renderer.ts';
export { INSTANCE_BYTES } from './renderer.ts';
export type {
  ClearColor,
  Renderer,
  RendererBackend,
  RendererOptions,
  TextureSource,
} from './renderer.ts';
export { WebGL2Renderer, createWebGL2Renderer } from './webgl2.ts';
export { WebGPURenderer, createWebGPURenderer } from './webgpu.ts';
export { Sprite, Transform, createSpriteSystem, spawnSprite } from './sprites.ts';
export type { SpawnSpriteOptions } from './sprites.ts';
