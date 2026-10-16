import { describe, expect, it } from 'vitest';
import { layoutText, parseBmfont } from '../src/index.ts';

const file = `info face="Pixel Font" size=16 bold=0 italic=0 charset="" unicode=1
common lineHeight=20 base=16 scaleW=128 scaleH=64 pages=1 packed=0
page id=0 file="pixel.png"
chars count=3
char id=65 x=0 y=0 width=9 height=12 xoffset=0 yoffset=3 xadvance=10 page=0 chnl=15
char id=66 x=10 y=0 width=8 height=12 xoffset=1 yoffset=3 xadvance=9 page=0 chnl=15
char id=32 x=0 y=0 width=0 height=0 xoffset=0 yoffset=0 xadvance=5 page=0 chnl=15
kernings count=1
kerning first=65 second=66 amount=-2
`;

describe('parseBmfont', () => {
  it('reads metrics, glyphs and kerning', () => {
    const font = parseBmfont(file);
    expect(font).toMatchObject({ size: 16, lineHeight: 20, textureWidth: 128, textureHeight: 64 });
    expect(font.glyphs.size).toBe(3);
    expect(font.glyphs.get(66)).toEqual({
      id: 66,
      x: 10,
      y: 0,
      width: 8,
      height: 12,
      xOffset: 1,
      yOffset: 3,
      xAdvance: 9,
    });
    expect(font.kerning.get(65 * 65536 + 66)).toBe(-2);
  });

  it('accepts Windows line endings and a negative info size', () => {
    const font = parseBmfont(file.replace(/\n/g, '\r\n').replace('size=16', 'size=-16'));
    expect(font.size).toBe(16);
    expect(font.glyphs.size).toBe(3);
  });

  it('feeds layoutText', () => {
    const layout = layoutText('AB', parseBmfont(file));
    expect(layout.glyphs[1]?.x).toBe(10 - 2 + 1);
  });

  it('rejects incomplete, multi-page and malformed files', () => {
    expect(() => parseBmfont('')).toThrow(/common/);
    expect(() => parseBmfont('common lineHeight=1 scaleW=1 scaleH=1 pages=1')).toThrow(/char/);
    expect(() => parseBmfont(file.replace('pages=1', 'pages=2'))).toThrow(/one texture page/);
    expect(() => parseBmfont(file.replace('xadvance=10', 'xadvance=abc'))).toThrow(/xadvance/);
    expect(() => parseBmfont(file.replace(' width=9', ''))).toThrow(/width/);
  });
});
