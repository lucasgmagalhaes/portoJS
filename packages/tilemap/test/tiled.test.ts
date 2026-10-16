import { describe, expect, it } from 'vitest';
import { FLIP_HORIZONTAL, GID_MASK, parseTiledMap } from '../src/index.ts';
import { layerJson, sampleMap, tilesetJson } from './sample.ts';

describe('parseTiledMap', () => {
  it('reads sizes, properties, tilesets, tile layers and object layers', () => {
    const map = parseTiledMap(sampleMap());
    expect([map.width, map.height, map.tileWidth, map.tileHeight]).toEqual([4, 3, 16, 16]);
    expect(map.properties).toEqual({ title: 'Cave' });
    expect(map.tilesets).toHaveLength(1);
    const tileset = map.tilesets[0];
    expect(tileset).toMatchObject({ firstGid: 1, columns: 4, tileCount: 8, image: 'tiles.png' });
    expect(tileset?.animations.get(1)).toEqual([
      { tileId: 1, durationMs: 100 },
      { tileId: 2, durationMs: 300 },
    ]);
    expect(tileset?.tileProperties.get(0)).toEqual({ solid: true });
    const [ground, spawns] = map.layers;
    expect(ground).toMatchObject({
      kind: 'tiles',
      name: 'ground',
      opacity: 0.5,
      offsetX: 8,
      visible: true,
    });
    expect(Array.from((ground as { data: Uint32Array }).data)).toEqual([
      0, 0, 0, 0, 0, 2, 0, 0, 1, 1, 1, 1,
    ]);
    expect(spawns).toMatchObject({ kind: 'objects', name: 'spawns' });
    expect((spawns as unknown as { objects: unknown[] }).objects[0]).toMatchObject({
      id: 7,
      type: 'spawn',
      x: 20,
      y: 30,
      properties: { team: 'red' },
    });
  });

  it('flattens group layers in order', () => {
    const map = parseTiledMap(sampleMap());
    expect(map.layers.map((layer) => layer.name)).toEqual(['ground', 'spawns']);
  });

  it('uses external tilesets from the options and sorts tilesets by first id', () => {
    const json = sampleMap();
    const inline = tilesetJson(json, 0);
    json['tilesets'] = [
      { firstgid: 100, source: 'more.tsj' },
      { ...inline, firstgid: 1 },
    ];
    const map = parseTiledMap(json, { tilesets: { 'more.tsj': { ...inline, name: 'more' } } });
    expect(map.tilesets.map((t) => [t.name, t.firstGid])).toEqual([
      ['tiles', 1],
      ['more', 100],
    ]);
    expect(() => parseTiledMap(json)).toThrow(/external/);
  });

  it('keeps the flip flags in the ids', () => {
    const json = sampleMap();
    layerJson(json, 0)['data'] = [FLIP_HORIZONTAL + 2, ...new Array<number>(11).fill(0)];
    const ground = parseTiledMap(json).layers[0] as { data: Uint32Array };
    const id = ground.data[0] ?? 0;
    expect(id & GID_MASK).toBe(2);
    expect((id & FLIP_HORIZONTAL) !== 0).toBe(true);
  });

  it('rejects unsupported and malformed maps', () => {
    const changed = (change: (json: Record<string, unknown>) => void): unknown => {
      const json = sampleMap();
      change(json);
      return json;
    };
    expect(() => parseTiledMap(null)).toThrow(RangeError);
    expect(() => parseTiledMap(changed((j) => (j['orientation'] = 'isometric')))).toThrow(
      /orthogonal/,
    );
    expect(() => parseTiledMap(changed((j) => (j['infinite'] = true)))).toThrow(/infinite/);
    expect(() => parseTiledMap(changed((j) => delete j['tilesets']))).toThrow(/tilesets/);
    expect(() => parseTiledMap(changed((j) => (layerJson(j, 0)['data'] = 'eJzt')))).toThrow(/CSV/);
    expect(() => parseTiledMap(changed((j) => (layerJson(j, 0)['data'] = [1, 2])))).toThrow(
      /expected 12/,
    );
    expect(() =>
      parseTiledMap(changed((j) => (layerJson(j, 0)['data'] = new Array<number>(12).fill(-1)))),
    ).toThrow(/not a tile id/);
    expect(() => parseTiledMap(changed((j) => delete tilesetJson(j, 0)['image']))).toThrow(
      /no image/,
    );
    expect(() => parseTiledMap(changed((j) => (tilesetJson(j, 0)['columns'] = 0)))).toThrow(
      /tile grid/,
    );
    expect(() => parseTiledMap(changed((j) => (layerJson(j, 0)['chunks'] = [])))).toThrow(
      /infinite/,
    );
  });
});
