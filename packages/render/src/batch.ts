/**
 * Floats per sprite instance: x, y, width, height, rotation, originX, originY, u, v, uWidth,
 * vHeight and the packed RGBA colour (stored as the bits of a float).
 */
export const INSTANCE_FLOATS = 12;

/**
 * A GPU texture handle. Create them with the renderer.
 */
export interface Texture {
  /**
   * Unique id, used to group sprites into batches.
   */
  readonly id: number;
  /**
   * Width in pixels.
   */
  readonly width: number;
  /**
   * Height in pixels.
   */
  readonly height: number;
}

/**
 * One sprite to draw.
 */
export interface SpriteDraw {
  /**
   * World position of the pivot.
   */
  readonly x: number;
  /**
   * World position of the pivot.
   */
  readonly y: number;
  /**
   * Size in world units.
   */
  readonly width: number;
  /**
   * Size in world units.
   */
  readonly height: number;
  /**
   * Rotation in radians around the pivot. Default `0`.
   */
  readonly rotation?: number;
  /**
   * Pivot inside the sprite, `0` to `1`. Default `0.5` (the centre).
   */
  readonly originX?: number;
  /**
   * Pivot inside the sprite, `0` to `1`. Default `0.5` (the centre).
   */
  readonly originY?: number;
  /**
   * Texture region, `0` to `1`. Default is the whole texture.
   */
  readonly u?: number;
  /**
   * Texture region, `0` to `1`.
   */
  readonly v?: number;
  /**
   * Texture region width, `0` to `1`.
   */
  readonly uWidth?: number;
  /**
   * Texture region height, `0` to `1`.
   */
  readonly vHeight?: number;
  /**
   * Tint as `0xRRGGBBAA`. Default `0xffffffff`.
   */
  readonly color?: number;
  /**
   * Draw order: higher layers draw on top. Default `0`.
   */
  readonly layer?: number;
}

/**
 * A run of consecutive instances drawn with one texture, so one draw call.
 */
export interface DrawGroup {
  /**
   * The texture to bind.
   */
  readonly texture: Texture;
  /**
   * Index of the first instance.
   */
  readonly start: number;
  /**
   * Number of instances.
   */
  readonly count: number;
}

/**
 * The finished batch: all instances in draw order, plus the draw calls they need.
 */
export interface BatchResult {
  /**
   * Instance data, {@link INSTANCE_FLOATS} floats per instance. Valid until the next `build`.
   */
  readonly data: Float32Array;
  /**
   * Draw calls in order.
   */
  readonly groups: readonly DrawGroup[];
  /**
   * Number of instances.
   */
  readonly count: number;
}

interface Bucket {
  readonly texture: Texture;
  floats: Float32Array;
  bits: Uint32Array;
  count: number;
}

const WHITE = 0xffffffff;

function grow(bucket: Bucket): void {
  const floats = new Float32Array(bucket.floats.length * 2);
  floats.set(bucket.floats);
  bucket.floats = floats;
  bucket.bits = new Uint32Array(floats.buffer);
}

function byNumber(a: number, b: number): number {
  return a - b;
}

/**
 * Collects sprites and groups them by layer and texture, so each texture within a layer is one
 * draw call (instanced rendering). Reuse one batch every frame: `clear()`, `add()` many times,
 * then `build()`.
 *
 * @example
 * const batch = new SpriteBatch();
 * batch.add(texture, { x: 10, y: 20, width: 32, height: 32 });
 * const { data, groups } = batch.build();
 */
export class SpriteBatch {
  private readonly layers = new Map<number, Map<number, Bucket>>();
  private out: Float32Array;
  private total = 0;

  /**
   * @param initialCapacity instances to allocate room for in the output. It grows as needed.
   */
  constructor(private readonly initialCapacity = 1024) {
    this.out = new Float32Array(Math.max(1, initialCapacity) * INSTANCE_FLOATS);
  }

  /**
   * Number of sprites added since the last `clear`.
   */
  get count(): number {
    return this.total;
  }

  /**
   * Forgets every sprite but keeps the allocated memory.
   */
  clear(): void {
    for (const textures of this.layers.values()) {
      for (const bucket of textures.values()) bucket.count = 0;
    }
    this.total = 0;
  }

  /**
   * Adds a sprite.
   */
  add(texture: Texture, draw: SpriteDraw): void {
    this.addRaw(
      texture,
      draw.layer ?? 0,
      draw.x,
      draw.y,
      draw.width,
      draw.height,
      draw.rotation ?? 0,
      draw.originX ?? 0.5,
      draw.originY ?? 0.5,
      draw.u ?? 0,
      draw.v ?? 0,
      draw.uWidth ?? 1,
      draw.vHeight ?? 1,
      draw.color ?? WHITE,
    );
  }

  /**
   * Adds a sprite from plain numbers, without allocating. Use it in hot loops.
   */
  addRaw(
    texture: Texture,
    layer: number,
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number,
    originX: number,
    originY: number,
    u: number,
    v: number,
    uWidth: number,
    vHeight: number,
    color: number,
  ): void {
    const bucket = this.bucketFor(texture, layer);
    if ((bucket.count + 1) * INSTANCE_FLOATS > bucket.floats.length) grow(bucket);
    const at = bucket.count * INSTANCE_FLOATS;
    const f = bucket.floats;
    f[at] = x;
    f[at + 1] = y;
    f[at + 2] = width;
    f[at + 3] = height;
    f[at + 4] = rotation;
    f[at + 5] = originX;
    f[at + 6] = originY;
    f[at + 7] = u;
    f[at + 8] = v;
    f[at + 9] = uWidth;
    f[at + 10] = vHeight;
    bucket.bits[at + 11] = color >>> 0;
    bucket.count += 1;
    this.total += 1;
  }

  /**
   * Orders the sprites (layer ascending, then first-added texture first) and returns the packed
   * instances with the draw calls. Consecutive groups with the same texture are merged.
   */
  build(): BatchResult {
    if (this.total * INSTANCE_FLOATS > this.out.length) {
      this.out = new Float32Array(Math.max(this.total, this.initialCapacity) * 2 * INSTANCE_FLOATS);
    }
    const groups: DrawGroup[] = [];
    let cursor = 0;
    const order = [...this.layers.keys()].sort(byNumber);
    for (const layer of order) {
      const textures = this.layers.get(layer);
      if (textures === undefined) continue;
      for (const bucket of textures.values()) {
        if (bucket.count === 0) continue;
        const used = bucket.count * INSTANCE_FLOATS;
        this.out.set(bucket.floats.subarray(0, used), cursor * INSTANCE_FLOATS);
        const last = groups[groups.length - 1];
        if (last?.texture.id === bucket.texture.id) {
          groups[groups.length - 1] = {
            texture: last.texture,
            start: last.start,
            count: last.count + bucket.count,
          };
        } else {
          groups.push({ texture: bucket.texture, start: cursor, count: bucket.count });
        }
        cursor += bucket.count;
      }
    }
    return { data: this.out.subarray(0, cursor * INSTANCE_FLOATS), groups, count: cursor };
  }

  private bucketFor(texture: Texture, layer: number): Bucket {
    let textures = this.layers.get(layer);
    if (textures === undefined) {
      textures = new Map();
      this.layers.set(layer, textures);
    }
    let bucket = textures.get(texture.id);
    if (bucket === undefined) {
      const floats = new Float32Array(64 * INSTANCE_FLOATS);
      bucket = { texture, floats, bits: new Uint32Array(floats.buffer), count: 0 };
      textures.set(texture.id, bucket);
    }
    return bucket;
  }
}
