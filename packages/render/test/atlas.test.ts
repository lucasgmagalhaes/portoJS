import { describe, expect, it } from 'vitest';
import { Atlas, SpriteBatch, parseAtlasJson } from '../src/index.ts';
import type { Texture } from '../src/index.ts';

const texture: Texture = { id: 7, width: 128, height: 64 };

const hash = {
  frames: {
    hero_0: {
      frame: { x: 0, y: 0, w: 32, h: 32 },
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      sourceSize: { w: 32, h: 32 },
      duration: 100,
    },
    hero_1: {
      frame: { x: 32, y: 0, w: 30, h: 28 },
      spriteSourceSize: { x: 2, y: 4, w: 30, h: 28 },
      sourceSize: { w: 32, h: 32 },
      duration: 200,
      pivot: { x: 0.5, y: 1 },
    },
    coin: { frame: { x: 64, y: 0, w: 16, h: 16 } },
  },
  meta: {
    size: { w: 128, h: 64 },
    frameTags: [
      { name: 'walk', from: 0, to: 1, direction: 'forward' },
      { name: 'back', from: 0, to: 1, direction: 'reverse' },
      { name: 'bounce', from: 0, to: 1, direction: 'pingpong' },
    ],
  },
};

describe('parseAtlasJson', () => {
  it('reads the hash format with trimming, pivots and durations', () => {
    const data = parseAtlasJson(hash);
    expect([data.width, data.height]).toEqual([128, 64]);
    expect(data.frames.map((f) => f.name)).toEqual(['hero_0', 'hero_1', 'coin']);
    const second = data.frames[1];
    expect(second).toMatchObject({
      x: 32,
      width: 30,
      offsetX: 2,
      offsetY: 4,
      sourceWidth: 32,
      pivotX: 0.5,
      pivotY: 1,
      durationMs: 200,
    });
    const coin = data.frames[2];
    expect(coin).toMatchObject({
      sourceWidth: 16,
      sourceHeight: 16,
      pivotX: 0.5,
      durationMs: undefined,
    });
  });

  it('reads the array format using filename', () => {
    const data = parseAtlasJson({
      frames: [
        { filename: 'a', frame: { x: 0, y: 0, w: 8, h: 8 } },
        { frame: { x: 8, y: 0, w: 8, h: 8 } },
      ],
      meta: { size: { w: 16, h: 8 } },
    });
    expect(data.frames.map((f) => f.name)).toEqual(['a', '1']);
    expect(data.tags).toEqual([]);
  });

  it('reads Aseprite tags with durations and directions', () => {
    const data = parseAtlasJson(hash);
    expect(data.tags.map((t) => [t.name, t.direction])).toEqual([
      ['walk', 'forward'],
      ['back', 'reverse'],
      ['bounce', 'pingpong'],
    ]);
    expect(data.tags[0]).toMatchObject({ frames: ['hero_0', 'hero_1'], durationsMs: [100, 200] });
  });

  it('rejects malformed input and rotated frames', () => {
    expect(() => parseAtlasJson(null)).toThrow(RangeError);
    expect(() => parseAtlasJson({ frames: 3, meta: { size: { w: 1, h: 1 } } })).toThrow(RangeError);
    expect(() => parseAtlasJson({ frames: {}, meta: {} })).toThrow(RangeError);
    expect(() =>
      parseAtlasJson({
        frames: { r: { frame: { x: 0, y: 0, w: 1, h: 1 }, rotated: true } },
        meta: { size: { w: 1, h: 1 } },
      }),
    ).toThrow(/rotated/);
    expect(() =>
      parseAtlasJson({
        frames: { r: { frame: { x: 0, y: 0, w: 'a', h: 1 } } },
        meta: { size: { w: 1, h: 1 } },
      }),
    ).toThrow(RangeError);
    expect(() =>
      parseAtlasJson({
        frames: { a: { frame: { x: 0, y: 0, w: 1, h: 1 } } },
        meta: { size: { w: 1, h: 1 }, frameTags: [{ name: 't', from: 5, to: 6 }] },
      }),
    ).toThrow(/no frames/);
  });
});

describe('Atlas', () => {
  const atlas = new Atlas(texture, parseAtlasJson(hash));

  it('looks frames up and computes UVs', () => {
    expect(atlas.names).toEqual(['hero_0', 'hero_1', 'coin']);
    expect(atlas.has('coin')).toBe(true);
    expect(atlas.has('nope')).toBe(false);
    expect(atlas.uv('hero_1')).toEqual({ u: 0.25, v: 0, uWidth: 30 / 128, vHeight: 28 / 64 });
    expect(() => atlas.frame('nope')).toThrow(RangeError);
  });

  it('checks the texture size and duplicate names', () => {
    expect(() => new Atlas({ id: 1, width: 10, height: 10 }, parseAtlasJson(hash))).toThrow(
      /texture is 10x10/,
    );
    const dup = parseAtlasJson({
      frames: [
        { filename: 'a', frame: { x: 0, y: 0, w: 1, h: 1 } },
        { filename: 'a', frame: { x: 1, y: 0, w: 1, h: 1 } },
      ],
      meta: { size: { w: 128, h: 64 } },
    });
    expect(() => new Atlas(texture, dup)).toThrow(/duplicate/);
  });

  it('draws frames into one group and keeps trimmed frames in place', () => {
    const batch = new SpriteBatch();
    atlas.draw(batch, 'hero_0', { x: 10, y: 20 });
    atlas.draw(batch, 'hero_1', { x: 10, y: 20, scale: 2 });
    atlas.draw(batch, 'coin', { x: 0, y: 0 });
    const { data, groups, count } = batch.build();
    expect(count).toBe(3);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.texture.id).toBe(7);
    expect(Array.from(data.subarray(0, 11))).toEqual([
      10, 20, 32, 32, 0, 0.5, 0.5, 0, 0, 0.25, 0.5,
    ]);
    const second = Array.from(data.subarray(12, 23));
    expect(second[2]).toBe(60);
    expect(second[3]).toBe(56);
    expect(second[5]).toBeCloseTo((32 * 0.5 - 2) / 30, 6);
    expect(second[6]).toBeCloseTo((32 * 1 - 4) / 28, 6);
  });
});
