import type { Camera2D, SpriteBatch, Texture } from '@portojs/render';
import { FLIP_HORIZONTAL, FLIP_VERTICAL, GID_MASK } from './tiled.ts';
import type { TileLayer, TiledMap, Tileset } from './tiled.ts';

/**
 * Options of {@link TileMapView.draw}.
 */
export interface DrawMapOptions {
  /**
   * Names of the tile layers to draw, in order. Default every visible tile layer.
   */
  readonly layers?: readonly string[];
  /**
   * Seconds of game time, which picks the frame of animated tiles. Default `0` (first frame).
   */
  readonly time?: number;
  /**
   * Draw order of the first layer, as for sprites; each next layer is one higher, so layers stack
   * in order. Default `0`.
   */
  readonly layer?: number;
}

interface Animation {
  readonly totalMs: number;
  readonly frames: readonly { readonly tileId: number; readonly endsAtMs: number }[];
}

function between(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Draws a {@link TiledMap} into a sprite batch, only the tiles the camera can see, with animated
 * tiles and horizontal and vertical flips. A tile is one sprite, so a large visible area is still
 * a few thousand instances in a single draw call per tileset texture.
 *
 * Tile layers draw with the top-left of the map at the world origin plus the layer's offset.
 * Tiles larger than the map's cells are aligned to the bottom of their cell, like in Tiled.
 * Diagonal flips are not applied.
 *
 * @example
 * const view = new TileMapView(map, new Map([['tiles', tilesTexture]]));
 * view.draw(batch, camera, { time: game.time.time });
 */
export class TileMapView {
  private readonly lookup = new Map<number, number>();
  private readonly animations = new Map<number, Animation>();

  /**
   * @param map the parsed map.
   * @param textures the texture of each tileset, by tileset name.
   * @throws {RangeError} if a tileset has no texture, or a texture's size differs from the image
   * size the tileset declares.
   */
  constructor(
    readonly map: TiledMap,
    private readonly textures: ReadonlyMap<string, Texture>,
  ) {
    for (const [index, tileset] of map.tilesets.entries()) {
      const texture = textures.get(tileset.name);
      if (texture === undefined) {
        throw new RangeError(`TileMapView: no texture for tileset "${tileset.name}"`);
      }
      if (texture.width !== tileset.imageWidth || texture.height !== tileset.imageHeight) {
        throw new RangeError(
          `TileMapView: tileset "${tileset.name}" is ${tileset.imageWidth}x${tileset.imageHeight} but its texture is ${texture.width}x${texture.height}`,
        );
      }
      this.indexAnimations(tileset, index);
    }
  }

  /**
   * The global tile id at a cell of a tile layer, flags removed, or `0` outside the layer.
   */
  tileAt(layerName: string, tileX: number, tileY: number): number {
    const layer = this.tileLayer(layerName);
    if (tileX < 0 || tileY < 0 || tileX >= layer.width || tileY >= layer.height) return 0;
    return (layer.data[tileY * layer.width + tileX] ?? 0) & GID_MASK;
  }

  /**
   * The custom properties Tiled holds for the tile at a cell, or `undefined`.
   */
  propertiesAt(
    layerName: string,
    tileX: number,
    tileY: number,
  ): Readonly<Record<string, string | number | boolean>> | undefined {
    const gid = this.tileAt(layerName, tileX, tileY);
    const tileset = this.tilesetFor(gid);
    return tileset?.tileProperties.get(gid - tileset.firstGid);
  }

  /**
   * The cell that holds a world point.
   */
  worldToTile(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.floor(x / this.map.tileWidth),
      y: Math.floor(y / this.map.tileHeight),
    };
  }

  /**
   * Adds the visible tiles to the batch.
   *
   * @throws {RangeError} if a named layer does not exist or is not a tile layer.
   */
  draw(batch: SpriteBatch, camera: Camera2D, options: DrawMapOptions = {}): void {
    const bounds = visibleBounds(camera);
    const names = options.layers ?? this.map.layers.filter(isVisibleTileLayer).map(nameOf);
    const time = (options.time ?? 0) * 1000;
    for (const [order, name] of names.entries()) {
      this.drawLayer(batch, this.tileLayer(name), bounds, time, (options.layer ?? 0) + order);
    }
  }

  private drawLayer(
    batch: SpriteBatch,
    layer: TileLayer,
    bounds: { left: number; top: number; right: number; bottom: number },
    timeMs: number,
    order: number,
  ): void {
    const { tileWidth, tileHeight } = this.map;
    const first = {
      x: between(Math.floor((bounds.left - layer.offsetX) / tileWidth), 0, layer.width),
      y: between(Math.floor((bounds.top - layer.offsetY) / tileHeight) - 1, 0, layer.height),
    };
    const last = {
      x: between(Math.ceil((bounds.right - layer.offsetX) / tileWidth), 0, layer.width),
      y: between(Math.ceil((bounds.bottom - layer.offsetY) / tileHeight) + 1, 0, layer.height),
    };
    const color = (0xffffff00 | Math.round(between(layer.opacity, 0, 1) * 255)) >>> 0;
    for (let row = first.y; row < last.y; row++) {
      for (let column = first.x; column < last.x; column++) {
        const raw = layer.data[row * layer.width + column] ?? 0;
        const gid = raw & GID_MASK;
        if (gid === 0) continue;
        const tileset = this.tilesetFor(gid);
        const texture = tileset === undefined ? undefined : this.textures.get(tileset.name);
        if (tileset === undefined || texture === undefined) continue;
        const id = this.frameOf(tileset, gid - tileset.firstGid, timeMs);
        const u =
          (tileset.margin + (id % tileset.columns) * (tileset.tileWidth + tileset.spacing)) /
          tileset.imageWidth;
        const v =
          (tileset.margin +
            Math.floor(id / tileset.columns) * (tileset.tileHeight + tileset.spacing)) /
          tileset.imageHeight;
        const uWidth = tileset.tileWidth / tileset.imageWidth;
        const vHeight = tileset.tileHeight / tileset.imageHeight;
        const flipX = (raw & FLIP_HORIZONTAL) !== 0;
        const flipY = (raw & FLIP_VERTICAL) !== 0;
        batch.addRaw(
          texture,
          order,
          column * tileWidth + layer.offsetX,
          (row + 1) * tileHeight + layer.offsetY - tileset.tileHeight,
          tileset.tileWidth,
          tileset.tileHeight,
          0,
          0,
          0,
          flipX ? u + uWidth : u,
          flipY ? v + vHeight : v,
          flipX ? -uWidth : uWidth,
          flipY ? -vHeight : vHeight,
          color,
        );
      }
    }
  }

  private frameOf(tileset: Tileset, localId: number, timeMs: number): number {
    const animation = this.animations.get(tileset.firstGid * 1_000_000 + localId);
    if (animation === undefined || animation.totalMs <= 0) return localId;
    const at = timeMs % animation.totalMs;
    for (const frame of animation.frames) {
      if (at < frame.endsAtMs) return frame.tileId;
    }
    return localId;
  }

  private indexAnimations(tileset: Tileset, index: number): void {
    this.lookup.set(tileset.firstGid, index);
    for (const [localId, frames] of tileset.animations) {
      let total = 0;
      const timed: { tileId: number; endsAtMs: number }[] = [];
      for (const frame of frames) {
        total += frame.durationMs;
        timed.push({ tileId: frame.tileId, endsAtMs: total });
      }
      this.animations.set(tileset.firstGid * 1_000_000 + localId, {
        totalMs: total,
        frames: timed,
      });
    }
  }

  private tilesetFor(gid: number): Tileset | undefined {
    let found: Tileset | undefined;
    for (const tileset of this.map.tilesets) {
      if (tileset.firstGid > gid) break;
      found = tileset;
    }
    return found !== undefined && gid - found.firstGid < found.tileCount ? found : undefined;
  }

  private tileLayer(name: string): TileLayer {
    for (const layer of this.map.layers) {
      if (layer.name === name) {
        if (layer.kind !== 'tiles')
          throw new RangeError(`TileMapView: "${name}" is not a tile layer`);
        return layer;
      }
    }
    throw new RangeError(`TileMapView: no layer named "${name}"`);
  }
}

function isVisibleTileLayer(layer: TiledMap['layers'][number]): boolean {
  return layer.kind === 'tiles' && layer.visible;
}

function nameOf(layer: { readonly name: string }): string {
  return layer.name;
}

function visibleBounds(camera: Camera2D): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const corners = [
    camera.screenToWorld(0, 0),
    camera.screenToWorld(camera.width, 0),
    camera.screenToWorld(0, camera.height),
    camera.screenToWorld(camera.width, camera.height),
  ];
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const corner of corners) {
    left = Math.min(left, corner.x);
    top = Math.min(top, corner.y);
    right = Math.max(right, corner.x);
    bottom = Math.max(bottom, corner.y);
  }
  return { left, top, right, bottom };
}
