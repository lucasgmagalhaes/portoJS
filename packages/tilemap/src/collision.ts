import type { TileMapView } from './view.ts';

/**
 * A rectangle in world pixels, by its top-left corner.
 */
export interface SolidRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Decides which tiles are solid: the name of a boolean custom property set in Tiled, or a
 * function of the tile's global id.
 */
export type SolidTest = string | ((gid: number) => boolean);

interface Strip {
  start: number;
  end: number;
  top: number;
  bottom: number;
}

/**
 * Turns the solid tiles of a layer into as few rectangles as possible, for static colliders:
 * neighbouring tiles in a row are joined, then identical rows are stacked. A level of thousands
 * of tiles becomes a handful of bodies.
 *
 * @example
 * for (const r of solidRects(view, 'ground', 'solid')) {
 *   game.createObject('Wall').addComponent(RigidBody2D, {
 *     type: 'fixed',
 *     shape: { kind: 'box', width: r.width, height: r.height },
 *     x: r.x + r.width / 2,
 *     y: r.y + r.height / 2,
 *   });
 * }
 *
 * @throws {RangeError} if the layer does not exist or is not a tile layer.
 */
export function solidRects(view: TileMapView, layerName: string, solid: SolidTest): SolidRect[] {
  const layer = view.map.layers.find(isNamed(layerName));
  if (layer?.kind !== 'tiles') {
    throw new RangeError(`solidRects: "${layerName}" is not a tile layer of the map`);
  }
  const test = typeof solid === 'string' ? hasProperty(view, solid) : solid;
  const open: Strip[] = [];
  const done: Strip[] = [];
  for (let row = 0; row < layer.height; row++) {
    const runs: { start: number; end: number }[] = [];
    let start = -1;
    for (let column = 0; column <= layer.width; column++) {
      const gid = column < layer.width ? view.tileAt(layerName, column, row) : 0;
      const isSolid = gid !== 0 && test(gid);
      if (isSolid && start < 0) start = column;
      if (!isSolid && start >= 0) {
        runs.push({ start, end: column });
        start = -1;
      }
    }
    const carried: Strip[] = [];
    for (const run of runs) {
      const above = open.find(sameSpan(run.start, run.end, row));
      if (above === undefined) {
        carried.push({ ...run, top: row, bottom: row + 1 });
      } else {
        above.bottom = row + 1;
        carried.push(above);
      }
    }
    for (const strip of open) if (!carried.includes(strip)) done.push(strip);
    open.length = 0;
    open.push(...carried);
  }
  done.push(...open);
  const { tileWidth, tileHeight } = view.map;
  const rects: SolidRect[] = [];
  for (const strip of done) {
    rects.push({
      x: strip.start * tileWidth + layer.offsetX,
      y: strip.top * tileHeight + layer.offsetY,
      width: (strip.end - strip.start) * tileWidth,
      height: (strip.bottom - strip.top) * tileHeight,
    });
  }
  return rects.sort(byPosition);
}

function isNamed(name: string): (layer: { readonly name: string }) => boolean {
  return (layer) => layer.name === name;
}

function sameSpan(start: number, end: number, row: number): (strip: Strip) => boolean {
  return (strip) => strip.start === start && strip.end === end && strip.bottom === row;
}

function hasProperty(view: TileMapView, property: string): (gid: number) => boolean {
  return (gid) => {
    for (const tileset of view.map.tilesets) {
      if (gid >= tileset.firstGid && gid - tileset.firstGid < tileset.tileCount) {
        return tileset.tileProperties.get(gid - tileset.firstGid)?.[property] === true;
      }
    }
    return false;
  };
}

function byPosition(a: SolidRect, b: SolidRect): number {
  return a.y - b.y || a.x - b.x;
}
