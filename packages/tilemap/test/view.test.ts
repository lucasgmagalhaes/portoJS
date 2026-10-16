import { Camera2D, SpriteBatch } from '@portojs/render';
import type { Texture } from '@portojs/render';
import { describe, expect, it } from 'vitest';
import { FLIP_HORIZONTAL, FLIP_VERTICAL, TileMapView, parseTiledMap } from '../src/index.ts';
import { layerJson, sampleMap, tilesetJson } from './sample.ts';

const texture: Texture = { id: 1, width: 64, height: 32 };

interface Drawn {
  x: number;
  y: number;
  w: number;
  h: number;
  u: number;
  v: number;
  uw: number;
  vh: number;
  alpha: number;
}

function draw(
  view: TileMapView,
  camera: Camera2D,
  options?: Parameters<TileMapView['draw']>[2],
): Drawn[] {
  const batch = new SpriteBatch();
  view.draw(batch, camera, options);
  const { data, count } = batch.build();
  const bits = new Uint32Array(data.buffer, data.byteOffset, data.length);
  const rows: Drawn[] = [];
  for (let i = 0; i < count; i++) {
    const at = i * 12;
    rows.push({
      x: data[at] ?? 0,
      y: data[at + 1] ?? 0,
      w: data[at + 2] ?? 0,
      h: data[at + 3] ?? 0,
      u: data[at + 7] ?? 0,
      v: data[at + 8] ?? 0,
      uw: data[at + 9] ?? 0,
      vh: data[at + 10] ?? 0,
      alpha: (bits[at + 11] ?? 0) & 0xff,
    });
  }
  return rows;
}

function view(change?: (json: Record<string, unknown>) => void): TileMapView {
  const json = sampleMap();
  change?.(json);
  return new TileMapView(parseTiledMap(json), new Map([['tiles', texture]]));
}

function wholeMap(): Camera2D {
  const camera = new Camera2D(64, 48);
  camera.x = 32;
  camera.y = 24;
  return camera;
}

describe('TileMapView drawing', () => {
  it('draws every non-empty tile with its UV, offset and opacity', () => {
    const rows = draw(view(), wholeMap());
    expect(rows).toHaveLength(5);
    const ground = rows.filter((r) => r.y === 32).sort((a, b) => a.x - b.x);
    expect(ground.map((r) => r.x)).toEqual([8, 24, 40, 56]);
    expect(ground[0]).toMatchObject({ w: 16, h: 16, u: 0, v: 0, uw: 0.25, vh: 0.5, alpha: 128 });
  });

  it('picks the frame of an animated tile from the time', () => {
    const at = (time: number): number => {
      const rows = draw(view(), wholeMap(), { time });
      return rows.find((r) => r.y === 16)?.u ?? -1;
    };
    expect(at(0)).toBe(16 / 64);
    expect(at(0.05)).toBe(16 / 64);
    expect(at(0.15)).toBe(32 / 64);
    expect(at(0.39)).toBe(32 / 64);
    expect(at(0.41)).toBe(16 / 64);
  });

  it('only draws the tiles the camera can see', () => {
    const camera = new Camera2D(16, 16);
    camera.x = 56;
    camera.y = 40;
    const rows = draw(view(), camera);
    expect(rows.length).toBeLessThan(5);
    expect(rows.some((r) => r.x === 56 && r.y === 32)).toBe(true);
    const far = new Camera2D(16, 16);
    far.x = 1000;
    far.y = 1000;
    expect(draw(view(), far)).toEqual([]);
  });

  it('culls correctly for a zoomed and rotated camera', () => {
    const camera = wholeMap();
    camera.zoom = 2;
    camera.rotation = Math.PI / 4;
    expect(draw(view(), camera).length).toBeGreaterThan(0);
  });

  it('flips tiles by reversing the UV rectangle', () => {
    const flipped = view((json) => {
      layerJson(json, 0)['data'] = [
        FLIP_HORIZONTAL + 1,
        FLIP_VERTICAL + 1,
        FLIP_HORIZONTAL + FLIP_VERTICAL + 1,
        1,
        ...new Array<number>(8).fill(0),
      ];
    });
    const rows = draw(flipped, wholeMap()).sort((a, b) => a.x - b.x);
    expect(rows[0]).toMatchObject({ u: 0.25, uw: -0.25, v: 0, vh: 0.5 });
    expect(rows[1]).toMatchObject({ u: 0, uw: 0.25, v: 0.5, vh: -0.5 });
    expect(rows[2]).toMatchObject({ u: 0.25, uw: -0.25, v: 0.5, vh: -0.5 });
    expect(rows[3]).toMatchObject({ u: 0, uw: 0.25, v: 0, vh: 0.5 });
  });

  it('aligns tiles taller than the cell to the bottom of the cell', () => {
    const tall = view((json) => {
      tilesetJson(json, 0)['tileheight'] = 32;
      tilesetJson(json, 0)['tilecount'] = 4;
      tilesetJson(json, 0)['columns'] = 4;
      layerJson(json, 0)['data'] = [1, ...new Array<number>(11).fill(0)];
    });
    const [row] = draw(tall, wholeMap());
    expect(row).toMatchObject({ y: 16 - 32, h: 32, vh: 1 });
  });

  it('draws the chosen layers in order, each above the one before', () => {
    const two = view((json) => {
      const layers = json['layers'] as Record<string, unknown>[];
      layers.unshift({
        ...layerJson(json, 0),
        name: 'back',
        data: [1, ...new Array<number>(11).fill(0)],
      });
    });
    const batch = new SpriteBatch();
    two.draw(batch, wholeMap(), { layers: ['ground', 'back'], layer: 3 });
    expect(batch.count).toBe(6);
    const { data, count } = batch.build();
    expect([data[(count - 1) * 12], data[(count - 1) * 12 + 1]]).toEqual([8, 0]);
    expect(() => two.draw(batch, wholeMap(), { layers: ['nope'] })).toThrow(/no layer/);
    expect(() => two.draw(batch, wholeMap(), { layers: ['spawns'] })).toThrow(/not a tile layer/);
  });

  it('skips hidden layers by default and ignores ids no tileset owns', () => {
    const hidden = view((json) => {
      layerJson(json, 0)['visible'] = false;
    });
    expect(draw(hidden, wholeMap())).toEqual([]);
    const stray = view((json) => {
      layerJson(json, 0)['data'] = [99, ...new Array<number>(11).fill(0)];
    });
    expect(draw(stray, wholeMap())).toEqual([]);
  });
});

describe('TileMapView queries', () => {
  it('reads tile ids without flags, and 0 outside the layer', () => {
    const v = view();
    expect(v.tileAt('ground', 1, 1)).toBe(2);
    expect(v.tileAt('ground', 0, 2)).toBe(1);
    expect(v.tileAt('ground', -1, 0)).toBe(0);
    expect(v.tileAt('ground', 4, 0)).toBe(0);
    expect(v.tileAt('ground', 0, 3)).toBe(0);
    const flipped = view((json) => {
      layerJson(json, 0)['data'] = [FLIP_HORIZONTAL + 2, ...new Array<number>(11).fill(0)];
    });
    expect(flipped.tileAt('ground', 0, 0)).toBe(2);
  });

  it('reads tile properties and converts world points to cells', () => {
    const v = view();
    expect(v.propertiesAt('ground', 0, 2)).toEqual({ solid: true });
    expect(v.propertiesAt('ground', 1, 1)).toBeUndefined();
    expect(v.propertiesAt('ground', 0, 0)).toBeUndefined();
    expect(v.worldToTile(33, 17)).toEqual({ x: 2, y: 1 });
    expect(v.worldToTile(-1, -1)).toEqual({ x: -1, y: -1 });
  });

  it('checks the textures against the tilesets', () => {
    const map = parseTiledMap(sampleMap());
    expect(() => new TileMapView(map, new Map())).toThrow(/no texture/);
    expect(
      () => new TileMapView(map, new Map([['tiles', { id: 1, width: 10, height: 10 }]])),
    ).toThrow(/texture is 10x10/);
  });
});
