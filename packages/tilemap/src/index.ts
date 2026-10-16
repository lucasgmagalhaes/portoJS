/**
 * Tilemaps: Tiled import, camera-culled drawing, animated tiles and collision rectangles.
 *
 * @module @portojs/tilemap
 */

export { FLIP_DIAGONAL, FLIP_HORIZONTAL, FLIP_VERTICAL, GID_MASK, parseTiledMap } from './tiled.ts';
export type {
  AnimationFrame,
  MapObject,
  ObjectLayer,
  ParseOptions,
  Properties,
  PropertyValue,
  TileLayer,
  TiledMap,
  Tileset,
} from './tiled.ts';
export { TileMapView } from './view.ts';
export type { DrawMapOptions } from './view.ts';
