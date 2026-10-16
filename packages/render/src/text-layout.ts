/**
 * One glyph of a bitmap font: where it is in the texture, and how to place it.
 */
export interface GlyphInfo {
  /**
   * Character code.
   */
  readonly id: number;
  /**
   * Region in the font texture, in pixels.
   */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /**
   * Offset from the pen position to the region's top-left corner.
   */
  readonly xOffset: number;
  readonly yOffset: number;
  /**
   * How far the pen moves after this glyph.
   */
  readonly xAdvance: number;
}

/**
 * Metrics of a bitmap font, in pixels at its design size.
 */
export interface FontData {
  /**
   * The size the font was generated at.
   */
  readonly size: number;
  /**
   * Distance between baselines of consecutive lines.
   */
  readonly lineHeight: number;
  /**
   * Texture width and height in pixels.
   */
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly glyphs: ReadonlyMap<number, GlyphInfo>;
  /**
   * Extra advance for a pair, keyed by `first * 65536 + second`.
   */
  readonly kerning: ReadonlyMap<number, number>;
}

/**
 * Horizontal alignment of lines inside the text block.
 */
export type TextAlign = 'left' | 'center' | 'right';

/**
 * Options of {@link layoutText}.
 */
export interface TextLayoutOptions {
  /**
   * Text height in output units. Default: the font's own size.
   */
  readonly size?: number;
  /**
   * Wrap lines wider than this, in output units. Default: no wrapping.
   */
  readonly maxWidth?: number;
  /**
   * Default `left`.
   */
  readonly align?: TextAlign;
  /**
   * Extra space between lines, in output units. Default `0`.
   */
  readonly lineSpacing?: number;
}

/**
 * A glyph placed by {@link layoutText}.
 */
export interface PlacedGlyph {
  readonly glyph: GlyphInfo;
  /**
   * Top-left corner in output units, relative to the text block's top-left.
   */
  readonly x: number;
  readonly y: number;
  /**
   * Drawn size in output units.
   */
  readonly width: number;
  readonly height: number;
}

/**
 * The result of {@link layoutText}.
 */
export interface TextLayout {
  readonly glyphs: readonly PlacedGlyph[];
  /**
   * Size of the block that holds every line.
   */
  readonly width: number;
  readonly height: number;
  /**
   * Number of lines after wrapping.
   */
  readonly lineCount: number;
}

const FALLBACK = 63;

function glyphFor(font: FontData, code: number): GlyphInfo | undefined {
  return font.glyphs.get(code) ?? font.glyphs.get(FALLBACK);
}

function advanceOf(font: FontData, previous: number | undefined, code: number): number {
  const glyph = glyphFor(font, code);
  const kern = previous === undefined ? 0 : (font.kerning.get(previous * 65536 + code) ?? 0);
  return (glyph?.xAdvance ?? 0) + kern;
}

function widthOf(font: FontData, codes: readonly number[]): number {
  let width = 0;
  let previous: number | undefined;
  for (const code of codes) {
    width += advanceOf(font, previous, code);
    previous = code;
  }
  return width;
}

function wrapLine(font: FontData, line: string, limit: number): number[][] {
  const lines: number[][] = [];
  let current: number[] = [];
  for (const word of line.split(' ')) {
    const codes = [...word].map(codePoint);
    const candidate = current.length === 0 ? codes : [...current, 32, ...codes];
    if (widthOf(font, candidate) <= limit) {
      current = candidate;
      continue;
    }
    if (current.length > 0) lines.push(current);
    current = [];
    for (const code of codes) {
      if (current.length > 0 && widthOf(font, [...current, code]) > limit) {
        lines.push(current);
        current = [];
      }
      current.push(code);
    }
  }
  lines.push(current);
  return lines;
}

function codePoint(character: string): number {
  return character.codePointAt(0) ?? FALLBACK;
}

/**
 * Places the glyphs of `text` using a bitmap font: handles `\n`, optional word wrapping,
 * kerning, alignment and scaling. It is pure, so the result can be cached while the text
 * does not change.
 *
 * @example
 * const layout = layoutText('Hello\nworld', font, { size: 24, align: 'center' });
 */
export function layoutText(
  text: string,
  font: FontData,
  options: TextLayoutOptions = {},
): TextLayout {
  const scale = (options.size ?? font.size) / font.size;
  const limit = options.maxWidth === undefined ? Infinity : options.maxWidth / scale;
  const lines: number[][] = [];
  for (const raw of text.split('\n')) {
    if (limit === Infinity) lines.push([...raw].map(codePoint));
    else lines.push(...wrapLine(font, raw, limit));
  }
  const spacing = options.lineSpacing ?? 0;
  const widths: number[] = [];
  for (const codes of lines) widths.push(widthOf(font, codes) * scale);
  const blockWidth = Math.max(0, ...widths);
  const placed: PlacedGlyph[] = [];
  for (const [row, codes] of lines.entries()) {
    const lineWidth = widths[row] ?? 0;
    const shift =
      options.align === 'center'
        ? (blockWidth - lineWidth) / 2
        : options.align === 'right'
          ? blockWidth - lineWidth
          : 0;
    let pen = 0;
    let previous: number | undefined;
    for (const code of codes) {
      const glyph = glyphFor(font, code);
      pen += previous === undefined ? 0 : (font.kerning.get(previous * 65536 + code) ?? 0);
      if (glyph !== undefined && glyph.width > 0 && glyph.height > 0) {
        placed.push({
          glyph,
          x: shift + (pen + glyph.xOffset) * scale,
          y: row * (font.lineHeight * scale + spacing) + glyph.yOffset * scale,
          width: glyph.width * scale,
          height: glyph.height * scale,
        });
      }
      pen += glyph?.xAdvance ?? 0;
      previous = code;
    }
  }
  return {
    glyphs: placed,
    width: blockWidth,
    height: lines.length * font.lineHeight * scale + Math.max(0, lines.length - 1) * spacing,
    lineCount: lines.length,
  };
}
