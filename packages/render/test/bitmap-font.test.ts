import { describe, expect, it } from 'vitest';
import { BitmapFont, SpriteBatch, parseBmfont } from '../src/index.ts';

const fnt = `info size=16
common lineHeight=20 base=16 scaleW=128 scaleH=64 pages=1
char id=65 x=32 y=16 width=8 height=12 xoffset=1 yoffset=2 xadvance=10
`;
const texture = { id: 3, width: 128, height: 64 };
const font = new BitmapFont(texture, parseBmfont(fnt));

function instances(batch: SpriteBatch): number[][] {
  const { data, count } = batch.build();
  const rows: number[][] = [];
  for (let i = 0; i < count; i++) rows.push(Array.from(data.subarray(i * 12, i * 12 + 11)));
  return rows;
}

describe('BitmapFont', () => {
  it('draws one textured quad per glyph from the top-left', () => {
    const batch = new SpriteBatch();
    font.draw(batch, 'AA', { x: 100, y: 50 });
    const rows = instances(batch);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual([101, 52, 8, 12, 0, 0, 0, 0.25, 0.25, 0.0625, 0.1875]);
    expect(rows[1]?.[0]).toBe(111);
  });

  it('anchors the block, scales, tints and sets the layer', () => {
    const batch = new SpriteBatch();
    const layout = font.draw(batch, 'A', {
      x: 0,
      y: 0,
      size: 32,
      anchorX: 0.5,
      anchorY: 0.5,
      color: 0x11223344,
      layer: 4,
    });
    expect(layout.width).toBe(20);
    expect(layout.height).toBe(40);
    const { data } = batch.build();
    const bits = new Uint32Array(data.buffer, data.byteOffset, data.length);
    expect(data[0]).toBe(-10 + 2);
    expect(data[1]).toBe(-20 + 4);
    expect(bits[11]).toBe(0x11223344);
  });

  it('reuses a cached layout and reports the measured size', () => {
    const batch = new SpriteBatch();
    const layout = font.layout('AAA');
    expect(layout.width).toBe(30);
    font.drawLayout(batch, layout, { x: 0, y: 0 });
    font.drawLayout(batch, layout, { x: 0, y: 100 });
    expect(batch.count).toBe(6);
  });

  it('draws into the same group as other sprites of the texture', () => {
    const batch = new SpriteBatch();
    font.draw(batch, 'AA', { x: 0, y: 0 });
    batch.add(texture, { x: 0, y: 0, width: 4, height: 4 });
    expect(batch.build().groups).toHaveLength(1);
  });

  it('checks the texture size against the metrics', () => {
    expect(() => new BitmapFont({ id: 1, width: 10, height: 10 }, parseBmfont(fnt))).toThrow(
      RangeError,
    );
  });
});
