import type { Texture } from '@portojs/render';
import { describe, expect, it } from 'vitest';
import { TileMapView, parseTiledMap, solidRects } from '../src/index.ts';
import { layerJson, sampleMap } from './sample.ts';

const texture: Texture = { id: 1, width: 64, height: 32 };

function levelView(rows: number[][], offsetX = 0): TileMapView {
  const json = sampleMap();
  json['width'] = rows[0]?.length ?? 0;
  json['height'] = rows.length;
  const layer = layerJson(json, 0);
  layer['width'] = rows[0]?.length ?? 0;
  layer['height'] = rows.length;
  layer['data'] = rows.flat();
  layer['offsetx'] = offsetX;
  return new TileMapView(parseTiledMap(json), new Map([['tiles', texture]]));
}

const level = [
  [1, 1, 0, 0, 1, 1],
  [1, 1, 0, 0, 1, 1],
  [1, 1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 0],
];

describe('solidRects', () => {
  it('merges neighbouring solid tiles into few rectangles', () => {
    const rects = solidRects(levelView(level), 'ground', 'solid');
    expect(rects).toEqual([
      { x: 0, y: 0, width: 32, height: 32 },
      { x: 64, y: 0, width: 32, height: 32 },
      { x: 0, y: 32, width: 96, height: 16 },
    ]);
  });

  it('covers exactly the solid tiles, with no overlap', () => {
    const view = levelView([
      [1, 0, 1, 1, 0],
      [1, 1, 1, 0, 0],
      [0, 1, 1, 1, 1],
    ]);
    const rects = solidRects(view, 'ground', 'solid');
    const covered = new Set<string>();
    for (const r of rects) {
      for (let y = r.y / 16; y < (r.y + r.height) / 16; y++) {
        for (let x = r.x / 16; x < (r.x + r.width) / 16; x++) {
          expect(covered.has(`${x},${y}`)).toBe(false);
          covered.add(`${x},${y}`);
        }
      }
    }
    const expected = new Set<string>();
    [
      [1, 0, 1, 1, 0],
      [1, 1, 1, 0, 0],
      [0, 1, 1, 1, 1],
    ].forEach((row, y) => row.forEach((tile, x) => tile === 1 && expected.add(`${x},${y}`)));
    expect(covered).toEqual(expected);
  });

  it('uses a predicate on the global id, ignoring empty cells', () => {
    const view = levelView([[0, 2, 2, 0]]);
    expect(solidRects(view, 'ground', (gid) => gid === 2)).toEqual([
      { x: 16, y: 0, width: 32, height: 16 },
    ]);
    expect(solidRects(view, 'ground', () => true)).toHaveLength(1);
    expect(solidRects(view, 'ground', 'solid')).toEqual([]);
  });

  it('shifts by the layer offset and returns nothing when nothing is solid', () => {
    expect(solidRects(levelView([[1]], 8), 'ground', 'solid')).toEqual([
      { x: 8, y: 0, width: 16, height: 16 },
    ]);
    expect(solidRects(levelView([[0, 0]]), 'ground', 'solid')).toEqual([]);
  });

  it('rejects a missing layer and an object layer', () => {
    const view = levelView(level);
    expect(() => solidRects(view, 'nope', 'solid')).toThrow(RangeError);
    expect(() => solidRects(view, 'spawns', 'solid')).toThrow(RangeError);
  });
});
