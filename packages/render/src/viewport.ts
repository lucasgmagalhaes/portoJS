import type { Camera2D } from './camera.ts';

/**
 * How the game area is fitted into the space available.
 *
 * - `fit`: show all of the design size, with bars on the sides that do not match.
 * - `fill`: cover the whole space, cropping what does not fit.
 * - `stretch`: cover the whole space and distort the picture to match.
 * - `fixedWidth`: keep the design width; the visible height follows the aspect ratio.
 * - `fixedHeight`: keep the design height; the visible width follows the aspect ratio.
 * - `pixelPerfect`: like `fit`, but only whole-number scales, for crisp pixel art.
 */
export type ScaleMode = 'fit' | 'fill' | 'stretch' | 'fixedWidth' | 'fixedHeight' | 'pixelPerfect';

/**
 * Inputs of {@link computeViewport}.
 */
export interface ViewportInput {
  readonly mode: ScaleMode;
  /**
   * Width the game was designed for, in world units.
   */
  readonly designWidth: number;
  /**
   * Height the game was designed for, in world units.
   */
  readonly designHeight: number;
  /**
   * Width of the space available, in CSS pixels.
   */
  readonly containerWidth: number;
  /**
   * Height of the space available, in CSS pixels.
   */
  readonly containerHeight: number;
  /**
   * Device pixels per CSS pixel. Default `1`.
   */
  readonly pixelRatio?: number;
}

/**
 * Where and how big the canvas is, and what the camera should show.
 */
export interface ViewportLayout {
  /**
   * Canvas width in CSS pixels.
   */
  readonly cssWidth: number;
  /**
   * Canvas height in CSS pixels.
   */
  readonly cssHeight: number;
  /**
   * Distance from the left of the container to the canvas, in CSS pixels.
   */
  readonly offsetX: number;
  /**
   * Distance from the top of the container to the canvas, in CSS pixels.
   */
  readonly offsetY: number;
  /**
   * Drawing buffer width in device pixels: pass it to `renderer.resize`.
   */
  readonly pixelWidth: number;
  /**
   * Drawing buffer height in device pixels: pass it to `renderer.resize`.
   */
  readonly pixelHeight: number;
  /**
   * World units visible horizontally.
   */
  readonly worldWidth: number;
  /**
   * World units visible vertically.
   */
  readonly worldHeight: number;
  /**
   * Camera zoom: device pixels per world unit.
   */
  readonly zoom: number;
}

function check(name: string, value: number): void {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new RangeError(`computeViewport: ${name} must be a positive number`);
  }
}

/**
 * Works out the canvas size, position and camera settings for a scaling mode. Pure, so it is
 * easy to test and to reuse outside the browser.
 *
 * @throws {RangeError} if a size or the pixel ratio is not a positive number.
 */
export function computeViewport(input: ViewportInput): ViewportLayout {
  const { designWidth: dw, designHeight: dh, containerWidth: cw, containerHeight: ch } = input;
  const ratio = input.pixelRatio ?? 1;
  check('designWidth', dw);
  check('designHeight', dh);
  check('containerWidth', cw);
  check('containerHeight', ch);
  check('pixelRatio', ratio);

  let cssWidth = cw;
  let cssHeight = ch;
  let worldWidth = dw;
  let worldHeight = dh;
  let pixelWidth: number;
  let pixelHeight: number;

  switch (input.mode) {
    case 'fit':
    case 'pixelPerfect': {
      const fitted = Math.min(cw / dw, ch / dh);
      const scale = input.mode === 'pixelPerfect' ? Math.max(1, Math.floor(fitted)) : fitted;
      cssWidth = dw * scale;
      cssHeight = dh * scale;
      break;
    }
    case 'fill': {
      const scale = Math.max(cw / dw, ch / dh);
      worldWidth = cw / scale;
      worldHeight = ch / scale;
      break;
    }
    case 'fixedWidth':
      worldHeight = ch / (cw / dw);
      break;
    case 'fixedHeight':
      worldWidth = cw / (ch / dh);
      break;
    case 'stretch':
      break;
  }

  if (input.mode === 'stretch') {
    pixelWidth = Math.max(1, Math.round(dw * ratio));
    pixelHeight = Math.max(1, Math.round(dh * ratio));
  } else {
    pixelWidth = Math.max(1, Math.round(cssWidth * ratio));
    pixelHeight = Math.max(1, Math.round(cssHeight * ratio));
  }

  return {
    cssWidth,
    cssHeight,
    offsetX: (cw - cssWidth) / 2,
    offsetY: (ch - cssHeight) / 2,
    pixelWidth,
    pixelHeight,
    worldWidth,
    worldHeight,
    zoom: pixelWidth / worldWidth,
  };
}

/**
 * Converts a point in container CSS pixels (such as a pointer position relative to the
 * container) to drawing-buffer pixels, ready for {@link Camera2D.screenToWorld}.
 */
export function containerToViewport(
  layout: ViewportLayout,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: ((x - layout.offsetX) / layout.cssWidth) * layout.pixelWidth,
    y: ((y - layout.offsetY) / layout.cssHeight) * layout.pixelHeight,
  };
}

/**
 * Applies a layout to a camera: viewport in drawing-buffer pixels and zoom.
 */
export function applyViewport(camera: Camera2D, layout: ViewportLayout): void {
  camera.setViewport(layout.pixelWidth, layout.pixelHeight);
  camera.zoom = layout.zoom;
}
