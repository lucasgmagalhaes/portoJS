import type { FontData, GlyphInfo } from './text-layout.ts';

type Fields = Record<string, string>;

const PAIR = /(\w+)=("[^"]*"|\S+)/g;

function fields(line: string): Fields {
  const found: Fields = {};
  for (const match of line.matchAll(PAIR)) {
    const key = match[1];
    const value = match[2];
    if (key !== undefined && value !== undefined) found[key] = value.replace(/^"|"$/g, '');
  }
  return found;
}

function int(values: Fields, key: string, line: string): number {
  const value = Number(values[key]);
  if (values[key] === undefined || !Number.isFinite(value)) {
    throw new RangeError(`bmfont: "${key}" is missing or not a number in: ${line}`);
  }
  return value;
}

function glyphOf(values: Fields, line: string): GlyphInfo {
  return {
    id: int(values, 'id', line),
    x: int(values, 'x', line),
    y: int(values, 'y', line),
    width: int(values, 'width', line),
    height: int(values, 'height', line),
    xOffset: int(values, 'xoffset', line),
    yOffset: int(values, 'yoffset', line),
    xAdvance: int(values, 'xadvance', line),
  };
}

/**
 * Reads the text format of AngelCode BMFont (also written by Hiero, ShoeBox and msdf-bmfont):
 * the `info`, `common`, `char` and `kerning` lines. Only one texture page is supported.
 *
 * @throws {RangeError} if the file is incomplete, has several pages or a malformed line.
 */
export function parseBmfont(text: string): FontData {
  const glyphs = new Map<number, GlyphInfo>();
  const kerning = new Map<number, number>();
  let size = 0;
  let lineHeight = 0;
  let textureWidth = 0;
  let textureHeight = 0;
  let sawCommon = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const tag = line.split(/\s+/, 1)[0];
    if (tag === 'info') {
      size = Math.abs(int(fields(line), 'size', line));
    } else if (tag === 'common') {
      const values = fields(line);
      lineHeight = int(values, 'lineHeight', line);
      textureWidth = int(values, 'scaleW', line);
      textureHeight = int(values, 'scaleH', line);
      if (int(values, 'pages', line) !== 1) {
        throw new RangeError('bmfont: only fonts with one texture page are supported');
      }
      sawCommon = true;
    } else if (tag === 'char') {
      const glyph = glyphOf(fields(line), line);
      glyphs.set(glyph.id, glyph);
    } else if (tag === 'kerning') {
      const values = fields(line);
      kerning.set(
        int(values, 'first', line) * 65536 + int(values, 'second', line),
        int(values, 'amount', line),
      );
    }
  }
  if (!sawCommon) throw new RangeError('bmfont: the file has no "common" line');
  if (glyphs.size === 0) throw new RangeError('bmfont: the file has no "char" lines');
  return {
    size: size > 0 ? size : lineHeight,
    lineHeight,
    textureWidth,
    textureHeight,
    glyphs,
    kerning,
  };
}
