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
  RenderOptions,
  RenderViewport,
  Renderer,
  RendererBackend,
  RendererOptions,
  TextureSource,
} from './renderer.ts';
export { WebGL2Renderer, createWebGL2Renderer } from './webgl2.ts';
export { WebGPURenderer, createWebGPURenderer } from './webgpu.ts';
export { Sprite, Transform, createSpriteSystem, spawnSprite } from './sprites.ts';
export type { SpawnSpriteOptions } from './sprites.ts';
export { Atlas, parseAtlasJson } from './atlas.ts';
export type { AtlasData, AtlasFrame, AtlasTag, FrameUv } from './atlas.ts';
export { Animator, clipFromTag, clipsFromAtlas } from './animation.ts';
export type { AnimationClip, AnimationTransition, AnimatorOptions, LoopMode } from './animation.ts';
export { SortingLayers } from './sorting.ts';
export { applyViewport, computeViewport, containerToViewport } from './viewport.ts';
export type { ScaleMode, ViewportInput, ViewportLayout } from './viewport.ts';
export { layoutText } from './text-layout.ts';
export type {
  FontData,
  GlyphInfo,
  PlacedGlyph,
  TextAlign,
  TextLayout,
  TextLayoutOptions,
} from './text-layout.ts';
export { parseBmfont } from './bmfont.ts';
export { BitmapFont } from './bitmap-font.ts';
export type { DrawTextOptions } from './bitmap-font.ts';
export { CanvasText, rasterizeText } from './canvas-text.ts';
export type {
  RasterizedText,
  TextCanvas,
  TextContext,
  TextStyle,
  TextureHost,
} from './canvas-text.ts';
export { CameraController } from './camera-controller.ts';
export type { CameraControllerOptions, FollowOptions, WorldRect } from './camera-controller.ts';
export { ParticleEmitter } from './particles.ts';
export type { ColorOverLife, OverLife, ParticleOptions, Range, SpawnArea } from './particles.ts';
