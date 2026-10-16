/**
 * A custom property from Tiled.
 */
export type PropertyValue = string | number | boolean;

/**
 * Custom properties of a map, layer, object or tile, by name.
 */
export type Properties = Readonly<Record<string, PropertyValue>>;

/**
 * One frame of an animated tile.
 */
export interface AnimationFrame {
  /**
   * The tile to show, as an id inside the same tileset.
   */
  readonly tileId: number;
  readonly durationMs: number;
}

/**
 * A tileset: a grid of tiles in one image.
 */
export interface Tileset {
  readonly name: string;
  /**
   * The global id of this tileset's first tile. A tile's global id is `firstGid + id`.
   */
  readonly firstGid: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly columns: number;
  readonly tileCount: number;
  /**
   * The image path, as written in the Tiled file.
   */
  readonly image: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly margin: number;
  readonly spacing: number;
  /**
   * Animations by tile id inside this tileset.
   */
  readonly animations: ReadonlyMap<number, readonly AnimationFrame[]>;
  /**
   * Custom properties by tile id inside this tileset.
   */
  readonly tileProperties: ReadonlyMap<number, Properties>;
}

/**
 * A layer of tiles.
 */
export interface TileLayer {
  readonly kind: 'tiles';
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /**
   * Global tile ids, row by row, `0` for empty. The top bits hold the flip flags, see
   * {@link FLIP_HORIZONTAL}.
   */
  readonly data: Uint32Array;
  readonly visible: boolean;
  readonly opacity: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly properties: Properties;
}

/**
 * An object on an object layer: a spawn point, a trigger, a region.
 */
export interface MapObject {
  readonly id: number;
  readonly name: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly visible: boolean;
  readonly properties: Properties;
}

/**
 * A layer of objects.
 */
export interface ObjectLayer {
  readonly kind: 'objects';
  readonly name: string;
  readonly objects: readonly MapObject[];
  readonly visible: boolean;
  readonly properties: Properties;
}

/**
 * A map read from a Tiled file.
 */
export interface TiledMap {
  /**
   * Size in tiles.
   */
  readonly width: number;
  readonly height: number;
  /**
   * Size of one tile in pixels.
   */
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly tilesets: readonly Tileset[];
  readonly layers: readonly (TileLayer | ObjectLayer)[];
  readonly properties: Properties;
}

/**
 * Options of {@link parseTiledMap}.
 */
export interface ParseOptions {
  /**
   * Contents of external tilesets (`.tsj` files) by the `source` the map names, for maps that do
   * not embed their tilesets.
   */
  readonly tilesets?: Readonly<Record<string, unknown>>;
}

/**
 * Flip flags in the top bits of a global tile id.
 */
export const FLIP_HORIZONTAL = 0x80000000;
export const FLIP_VERTICAL = 0x40000000;
export const FLIP_DIAGONAL = 0x20000000;

/**
 * Mask that removes the flip flags from a global tile id.
 */
export const GID_MASK = 0x1fffffff;

type Json = Record<string, unknown>;

function record(value: unknown, where: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RangeError(`tiled: ${where} must be an object`);
  }
  return value as Json;
}

function list(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) throw new RangeError(`tiled: ${where} must be an array`);
  return value as unknown[];
}

function int(source: Json, key: string, where: string, fallback?: number): number {
  const value = source[key] ?? fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`tiled: ${where}.${key} must be a number`);
  }
  return value;
}

function text(source: Json, key: string, fallback = ''): string {
  const value = source[key];
  return typeof value === 'string' ? value : fallback;
}

function flag(source: Json, key: string, fallback: boolean): boolean {
  const value = source[key];
  return typeof value === 'boolean' ? value : fallback;
}

function properties(value: unknown): Properties {
  if (!Array.isArray(value)) return {};
  const found: Record<string, PropertyValue> = {};
  for (const entry of value as unknown[]) {
    const property = entry as Json;
    const name = property['name'];
    const given = property['value'];
    if (typeof name === 'string' && ['string', 'number', 'boolean'].includes(typeof given)) {
      found[name] = given as PropertyValue;
    }
  }
  return found;
}

function parseTileset(source: Json, firstGid: number, where: string): Tileset {
  const animations = new Map<number, readonly AnimationFrame[]>();
  const tileProperties = new Map<number, Properties>();
  for (const entry of Array.isArray(source['tiles']) ? (source['tiles'] as unknown[]) : []) {
    const tile = record(entry, `${where}.tiles[]`);
    const id = int(tile, 'id', `${where}.tiles[]`);
    if (Array.isArray(tile['animation'])) {
      const frames: AnimationFrame[] = [];
      for (const frame of tile['animation'] as unknown[]) {
        const given = record(frame, `${where}.animation[]`);
        frames.push({
          tileId: int(given, 'tileid', `${where}.animation[]`),
          durationMs: int(given, 'duration', `${where}.animation[]`),
        });
      }
      animations.set(id, frames);
    }
    const custom = properties(tile['properties']);
    if (Object.keys(custom).length > 0) tileProperties.set(id, custom);
  }
  if (typeof source['image'] !== 'string') {
    throw new RangeError(
      `tiled: ${where} has no image; tilesets made of separate images are not supported`,
    );
  }
  const tileWidth = int(source, 'tilewidth', where);
  const columns = int(source, 'columns', where);
  if (columns < 1 || tileWidth < 1)
    throw new RangeError(`tiled: ${where} has an invalid tile grid`);
  return {
    name: text(source, 'name'),
    firstGid,
    tileWidth,
    tileHeight: int(source, 'tileheight', where),
    columns,
    tileCount: int(source, 'tilecount', where),
    image: source['image'],
    imageWidth: int(source, 'imagewidth', where),
    imageHeight: int(source, 'imageheight', where),
    margin: int(source, 'margin', where, 0),
    spacing: int(source, 'spacing', where, 0),
    animations,
    tileProperties,
  };
}

function parseTileLayer(source: Json, where: string): TileLayer {
  const data = source['data'];
  if (!Array.isArray(data)) {
    throw new RangeError(
      `tiled: ${where} stores its tiles as ${typeof data}; save the map with the CSV tile layer format`,
    );
  }
  if (source['chunks'] !== undefined) {
    throw new RangeError(`tiled: ${where} is an infinite map layer, which is not supported`);
  }
  const width = int(source, 'width', where);
  const height = int(source, 'height', where);
  if (data.length !== width * height) {
    throw new RangeError(`tiled: ${where} has ${data.length} tiles, expected ${width * height}`);
  }
  const ids = new Uint32Array(data.length);
  for (const [index, value] of (data as unknown[]).entries()) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new RangeError(`tiled: ${where}.data[${index}] is not a tile id`);
    }
    ids[index] = value;
  }
  return {
    kind: 'tiles',
    name: text(source, 'name'),
    width,
    height,
    data: ids,
    visible: flag(source, 'visible', true),
    opacity: int(source, 'opacity', where, 1),
    offsetX: int(source, 'offsetx', where, 0),
    offsetY: int(source, 'offsety', where, 0),
    properties: properties(source['properties']),
  };
}

function parseObjectLayer(source: Json, where: string): ObjectLayer {
  const objects: MapObject[] = [];
  for (const entry of list(source['objects'], `${where}.objects`)) {
    const object = record(entry, `${where}.objects[]`);
    objects.push({
      id: int(object, 'id', `${where}.objects[]`),
      name: text(object, 'name'),
      type: text(object, 'type', text(object, 'class')),
      x: int(object, 'x', `${where}.objects[]`),
      y: int(object, 'y', `${where}.objects[]`),
      width: int(object, 'width', `${where}.objects[]`, 0),
      height: int(object, 'height', `${where}.objects[]`, 0),
      rotation: int(object, 'rotation', `${where}.objects[]`, 0),
      visible: flag(object, 'visible', true),
      properties: properties(object['properties']),
    });
  }
  return {
    kind: 'objects',
    name: text(source, 'name'),
    objects,
    visible: flag(source, 'visible', true),
    properties: properties(source['properties']),
  };
}

/**
 * Reads a map saved by the Tiled editor as JSON (`.tmj`, or `.json`): orthogonal, finite maps
 * with tile layers (CSV or plain array data), object layers and image-based tilesets, embedded
 * or given in `options.tilesets`. Group layers are flattened in order.
 *
 * @throws {RangeError} if the map is malformed or uses something unsupported (infinite maps,
 * base64 or compressed tile data, other orientations, image-collection tilesets).
 */
export function parseTiledMap(json: unknown, options: ParseOptions = {}): TiledMap {
  const map = record(json, 'the map');
  const orientation = text(map, 'orientation', 'orthogonal');
  if (orientation !== 'orthogonal') {
    throw new RangeError(`tiled: ${orientation} maps are not supported, only orthogonal`);
  }
  if (map['infinite'] === true) throw new RangeError('tiled: infinite maps are not supported');
  const tilesets: Tileset[] = [];
  for (const [index, entry] of list(map['tilesets'], 'tilesets').entries()) {
    const given = record(entry, `tilesets[${index}]`);
    const firstGid = int(given, 'firstgid', `tilesets[${index}]`);
    const source = given['source'];
    if (typeof source === 'string') {
      const external = options.tilesets?.[source];
      if (external === undefined) {
        throw new RangeError(`tiled: tileset "${source}" is external; pass it in options.tilesets`);
      }
      tilesets.push(parseTileset(record(external, source), firstGid, source));
    } else {
      tilesets.push(parseTileset(given, firstGid, `tilesets[${index}]`));
    }
  }
  tilesets.sort(byFirstGid);
  const layers: (TileLayer | ObjectLayer)[] = [];
  collectLayers(list(map['layers'], 'layers'), layers, 'layers');
  return {
    width: int(map, 'width', 'the map'),
    height: int(map, 'height', 'the map'),
    tileWidth: int(map, 'tilewidth', 'the map'),
    tileHeight: int(map, 'tileheight', 'the map'),
    tilesets,
    layers,
    properties: properties(map['properties']),
  };
}

function collectLayers(
  source: readonly unknown[],
  into: (TileLayer | ObjectLayer)[],
  where: string,
): void {
  for (const [index, entry] of source.entries()) {
    const layer = record(entry, `${where}[${index}]`);
    const here = `${where}[${index}] "${text(layer, 'name')}"`;
    const type = layer['type'];
    if (type === 'tilelayer') into.push(parseTileLayer(layer, here));
    else if (type === 'objectgroup') into.push(parseObjectLayer(layer, here));
    else if (type === 'group') collectLayers(list(layer['layers'], `${here}.layers`), into, here);
  }
}

function byFirstGid(a: Tileset, b: Tileset): number {
  return a.firstGid - b.firstGid;
}
