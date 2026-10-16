import { describe, expect, it } from 'vitest';
import { layoutText } from '../src/index.ts';
import type { FontData, GlyphInfo } from '../src/index.ts';

function glyph(char: string, advance = 10, width = 8): GlyphInfo {
  return {
    id: char.charCodeAt(0),
    x: 0,
    y: 0,
    width,
    height: 12,
    xOffset: 1,
    yOffset: 2,
    xAdvance: advance,
  };
}

function font(chars: string, kerning: [string, string, number][] = []): FontData {
  const glyphs = new Map<number, GlyphInfo>();
  for (const char of chars) {
    glyphs.set(char.charCodeAt(0), glyph(char, char === ' ' ? 5 : 10, char === ' ' ? 0 : 8));
  }
  const pairs = new Map<number, number>();
  for (const [a, b, amount] of kerning)
    pairs.set(a.charCodeAt(0) * 65536 + b.charCodeAt(0), amount);
  return { size: 16, lineHeight: 20, textureWidth: 64, textureHeight: 64, glyphs, kerning: pairs };
}

const abc = font('abc ?');

describe('layoutText', () => {
  it('places glyphs along the pen with their offsets', () => {
    const layout = layoutText('ab', abc);
    expect(layout.glyphs.map((g) => [g.x, g.y])).toEqual([
      [1, 2],
      [11, 2],
    ]);
    expect(layout.width).toBe(20);
    expect(layout.height).toBe(20);
    expect(layout.lineCount).toBe(1);
  });

  it('scales to the requested size', () => {
    const layout = layoutText('a', abc, { size: 32 });
    expect(layout.glyphs[0]).toMatchObject({ x: 2, y: 4, width: 16, height: 24 });
    expect(layout.width).toBe(20);
    expect(layout.height).toBe(40);
  });

  it('applies kerning between a pair', () => {
    const kerned = font('ab', [['a', 'b', -3]]);
    const layout = layoutText('ab', kerned);
    expect(layout.glyphs[1]?.x).toBe(8);
    expect(layout.width).toBe(17);
  });

  it('starts a new line on \\n with the line height and spacing', () => {
    const layout = layoutText('a\nb', abc, { lineSpacing: 4 });
    expect(layout.lineCount).toBe(2);
    expect(layout.glyphs[1]?.y).toBe(20 + 4 + 2);
    expect(layout.height).toBe(44);
  });

  it('aligns lines inside the block', () => {
    const centre = layoutText('abc\na', abc, { align: 'center' });
    const right = layoutText('abc\na', abc, { align: 'right' });
    const lastCentre = centre.glyphs.at(-1);
    const lastRight = right.glyphs.at(-1);
    expect(centre.width).toBe(30);
    expect(lastCentre?.x).toBe(10 + 1);
    expect(lastRight?.x).toBe(20 + 1);
  });

  it('wraps words at the maximum width', () => {
    const layout = layoutText('ab ca', abc, { maxWidth: 30 });
    expect(layout.lineCount).toBe(2);
    expect(layout.width).toBeLessThanOrEqual(30);
  });

  it('breaks a word that is wider than the limit', () => {
    const layout = layoutText('abcabc', abc, { maxWidth: 25 });
    expect(layout.lineCount).toBe(3);
    expect(layout.glyphs).toHaveLength(6);
  });

  it('wraps in output units when scaled', () => {
    const layout = layoutText('ab ab', abc, { size: 32, maxWidth: 45 });
    expect(layout.lineCount).toBe(2);
  });

  it('uses ? for missing characters and skips empty glyphs', () => {
    const layout = layoutText('z a', abc);
    expect(layout.glyphs).toHaveLength(2);
    const noFallback = layoutText('z', font('a'));
    expect(noFallback.glyphs).toHaveLength(0);
    expect(noFallback.width).toBe(0);
  });

  it('handles empty text and counts astral characters once', () => {
    expect(layoutText('', abc)).toMatchObject({ glyphs: [], width: 0, lineCount: 1, height: 20 });
    const emoji = font('?');
    expect(layoutText('😀', emoji).glyphs).toHaveLength(1);
  });
});
