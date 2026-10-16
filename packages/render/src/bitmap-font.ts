import type { SpriteBatch, Texture } from './batch.ts';
import { layoutText } from './text-layout.ts';
import type { FontData, TextLayout, TextLayoutOptions } from './text-layout.ts';

/**
 * Options of {@link BitmapFont.draw}.
 */
export interface DrawTextOptions extends TextLayoutOptions {
  /**
   * World position of the text block's anchor.
   */
  readonly x: number;
  readonly y: number;
  /**
   * Where the anchor sits in the block, `0` to `1`. Default `0` (top-left); `0.5` centres.
   */
  readonly anchorX?: number;
  readonly anchorY?: number;
  /**
   * Tint as `0xRRGGBBAA`. Default white.
   */
  readonly color?: number;
  /**
   * Draw order, as for sprites. Default `0`.
   */
  readonly layer?: number;
}

/**
 * A bitmap font: a texture and its metrics. Draw text into a {@link SpriteBatch}, so text shares
 * the batch and draw calls with the rest of the scene.
 *
 * @example
 * const font = new BitmapFont(texture, parseBmfont(fntText));
 * font.draw(batch, 'Score: 120', { x: 10, y: 10, size: 24, color: 0xffd800ff });
 */
export class BitmapFont {
  /**
   * @param texture the font page on the GPU.
   * @param data the parsed metrics; its texture size must match.
   * @throws {RangeError} if the sizes differ.
   */
  constructor(
    readonly texture: Texture,
    readonly data: FontData,
  ) {
    if (texture.width !== data.textureWidth || texture.height !== data.textureHeight) {
      throw new RangeError(
        `BitmapFont: metrics are for ${data.textureWidth}x${data.textureHeight} but the texture is ${texture.width}x${texture.height}`,
      );
    }
  }

  /**
   * Lays text out without drawing, to measure it or to cache the result for {@link BitmapFont.drawLayout}.
   */
  layout(text: string, options: TextLayoutOptions = {}): TextLayout {
    return layoutText(text, this.data, options);
  }

  /**
   * Lays out and draws `text`.
   *
   * @returns the layout, so the caller can read the size.
   */
  draw(batch: SpriteBatch, text: string, options: DrawTextOptions): TextLayout {
    const layout = this.layout(text, options);
    this.drawLayout(batch, layout, options);
    return layout;
  }

  /**
   * Draws a layout made earlier with {@link BitmapFont.layout}. Cheaper for text that does not
   * change from frame to frame.
   */
  drawLayout(batch: SpriteBatch, layout: TextLayout, options: DrawTextOptions): void {
    const left = options.x - layout.width * (options.anchorX ?? 0);
    const top = options.y - layout.height * (options.anchorY ?? 0);
    const { textureWidth, textureHeight } = this.data;
    for (const placed of layout.glyphs) {
      const glyph = placed.glyph;
      batch.add(this.texture, {
        x: left + placed.x,
        y: top + placed.y,
        width: placed.width,
        height: placed.height,
        originX: 0,
        originY: 0,
        u: glyph.x / textureWidth,
        v: glyph.y / textureHeight,
        uWidth: glyph.width / textureWidth,
        vHeight: glyph.height / textureHeight,
        ...(options.color === undefined ? {} : { color: options.color }),
        ...(options.layer === undefined ? {} : { layer: options.layer }),
      });
    }
  }
}
