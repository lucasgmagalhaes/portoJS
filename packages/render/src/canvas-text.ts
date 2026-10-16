import type { SpriteBatch, Texture } from './batch.ts';
import type { TextureSource } from './renderer.ts';
import type { TextAlign } from './text-layout.ts';

/**
 * The part of a 2D canvas context that text drawing uses.
 */
export interface TextContext {
  font: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  textBaseline: CanvasTextBaseline;
  textAlign: CanvasTextAlign;
  lineJoin: CanvasLineJoin;
  measureText(text: string): { readonly width: number };
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  scale(x: number, y: number): void;
}

/**
 * A canvas that {@link rasterizeText} can draw on.
 */
export interface TextCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): TextContext | null;
}

/**
 * Looks of rasterised text.
 */
export interface TextStyle {
  /**
   * A CSS font, for example `'bold 24px Arial'`. The size must be in `px`.
   */
  readonly font: string;
  /**
   * CSS colour of the fill. Default `#ffffff`.
   */
  readonly color?: string;
  /**
   * An outline drawn under the fill.
   */
  readonly stroke?: { readonly color: string; readonly width: number };
  /**
   * Wrap lines wider than this, in CSS pixels. Default: no wrapping.
   */
  readonly maxWidth?: number;
  /**
   * Default `left`.
   */
  readonly align?: TextAlign;
  /**
   * Line height in CSS pixels. Default 1.25 times the font size.
   */
  readonly lineHeight?: number;
  /**
   * Empty space around the text, in CSS pixels, so strokes are not clipped. Default `2`.
   */
  readonly padding?: number;
  /**
   * Canvas pixels per CSS pixel; use `devicePixelRatio` for sharp text on dense screens.
   * Default `1`.
   */
  readonly resolution?: number;
}

/**
 * Text drawn on a canvas.
 */
export interface RasterizedText<C> {
  readonly canvas: C;
  /**
   * Size in CSS pixels (the canvas is larger by `resolution`).
   */
  readonly width: number;
  readonly height: number;
  readonly lineCount: number;
}

const SIZE_PATTERN = /(\d+(?:\.\d+)?)px/;

function fontSize(font: string): number {
  const size = Number(SIZE_PATTERN.exec(font)?.[1]);
  if (!(size > 0)) throw new RangeError(`rasterizeText: the font needs a size in px: "${font}"`);
  return size;
}

function splitLines(context: TextContext, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(' ')) {
      const candidate = current === '' ? word : `${current} ${word}`;
      if (current === '' || context.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines;
}

/**
 * Draws text on a new canvas, ready to upload as a texture. `createCanvas` makes a canvas of the
 * given pixel size (for example `(w, h) => new OffscreenCanvas(w, h)`), which keeps this function
 * free of the DOM and easy to test.
 *
 * @throws {RangeError} if the font has no `px` size.
 * @throws {Error} if the canvas has no 2D context.
 */
export function rasterizeText<C extends TextCanvas>(
  text: string,
  style: TextStyle,
  createCanvas: (width: number, height: number) => C,
): RasterizedText<C> {
  const size = fontSize(style.font);
  const resolution = style.resolution ?? 1;
  const padding = style.padding ?? 2;
  const lineHeight = style.lineHeight ?? size * 1.25;
  const measuring = createCanvas(1, 1).getContext('2d');
  if (measuring === null) throw new Error('rasterizeText: the canvas has no 2D context');
  measuring.font = style.font;
  const lines =
    style.maxWidth === undefined ? text.split('\n') : splitLines(measuring, text, style.maxWidth);
  let widest = 0;
  for (const line of lines) widest = Math.max(widest, measuring.measureText(line).width);
  const width = Math.ceil(widest + padding * 2);
  const height = Math.ceil(lines.length * lineHeight + padding * 2);
  const canvas = createCanvas(
    Math.max(1, Math.ceil(width * resolution)),
    Math.max(1, Math.ceil(height * resolution)),
  );
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('rasterizeText: the canvas has no 2D context');
  context.scale(resolution, resolution);
  context.font = style.font;
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.fillStyle = style.color ?? '#ffffff';
  const align = style.align ?? 'left';
  context.textAlign = align;
  const anchor = align === 'left' ? padding : align === 'right' ? width - padding : width / 2;
  for (const [row, line] of lines.entries()) {
    const y = padding + row * lineHeight + lineHeight / 2;
    if (style.stroke !== undefined) {
      context.strokeStyle = style.stroke.color;
      context.lineWidth = style.stroke.width;
      context.strokeText(line, anchor, y);
    }
    context.fillText(line, anchor, y);
  }
  return { canvas, width, height, lineCount: lines.length };
}

/**
 * What {@link CanvasText} needs from a renderer.
 */
export interface TextureHost {
  createTexture(source: TextureSource): Texture;
  deleteTexture(texture: Texture): void;
}

/**
 * Text that lives as a texture. It is rasterised again only when the text or style changes, and
 * the old texture is freed then. Draw it into a {@link SpriteBatch} like any sprite.
 *
 * @example
 * const label = new CanvasText(renderer, (w, h) => new OffscreenCanvas(w, h));
 * label.set('Level 3', { font: 'bold 32px Arial', stroke: { color: '#000', width: 4 } });
 * label.draw(batch, { x: 400, y: 20, anchorX: 0.5 });
 */
export class CanvasText<C extends TextCanvas & TextureSource> {
  private current: Texture | undefined;
  private key: string | undefined;
  private size = { width: 0, height: 0 };

  constructor(
    private readonly host: TextureHost,
    private readonly createCanvas: (width: number, height: number) => C,
  ) {}

  /**
   * Width in CSS pixels, `0` before the first {@link CanvasText.set}.
   */
  get width(): number {
    return this.size.width;
  }

  /**
   * Height in CSS pixels.
   */
  get height(): number {
    return this.size.height;
  }

  /**
   * The current texture, or `undefined` before the first {@link CanvasText.set}.
   */
  get texture(): Texture | undefined {
    return this.current;
  }

  /**
   * Shows `text`. Does nothing when it and the style are the same as last time.
   */
  set(text: string, style: TextStyle): void {
    const key = JSON.stringify([text, style]);
    if (key === this.key) return;
    const rasterized = rasterizeText(text, style, this.createCanvas);
    if (this.current !== undefined) this.host.deleteTexture(this.current);
    this.current = this.host.createTexture(rasterized.canvas);
    this.key = key;
    this.size = { width: rasterized.width, height: rasterized.height };
  }

  /**
   * Adds the text to a batch. Does nothing before the first {@link CanvasText.set}.
   */
  draw(
    batch: SpriteBatch,
    options: {
      readonly x: number;
      readonly y: number;
      readonly anchorX?: number;
      readonly anchorY?: number;
      readonly scale?: number;
      readonly color?: number;
      readonly layer?: number;
    },
  ): void {
    if (this.current === undefined) return;
    const scale = options.scale ?? 1;
    batch.add(this.current, {
      x: options.x - this.size.width * scale * (options.anchorX ?? 0),
      y: options.y - this.size.height * scale * (options.anchorY ?? 0),
      width: this.size.width * scale,
      height: this.size.height * scale,
      originX: 0,
      originY: 0,
      ...(options.color === undefined ? {} : { color: options.color }),
      ...(options.layer === undefined ? {} : { layer: options.layer }),
    });
  }

  /**
   * Frees the texture.
   */
  dispose(): void {
    if (this.current !== undefined) this.host.deleteTexture(this.current);
    this.current = undefined;
    this.key = undefined;
  }
}
