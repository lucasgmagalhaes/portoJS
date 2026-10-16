import type { SpriteBatch, SpriteDraw, Texture } from './batch.ts';

/**
 * One named region of an atlas texture, in pixels.
 */
export interface AtlasFrame {
  /**
   * Name of the frame, usually the original file name.
   */
  readonly name: string;
  /**
   * Left edge of the region in the texture.
   */
  readonly x: number;
  /**
   * Top edge of the region in the texture.
   */
  readonly y: number;
  /**
   * Width of the region.
   */
  readonly width: number;
  /**
   * Height of the region.
   */
  readonly height: number;
  /**
   * Pivot inside the untrimmed image, `0` to `1`. Default centre.
   */
  readonly pivotX: number;
  /**
   * Pivot inside the untrimmed image, `0` to `1`. Default centre.
   */
  readonly pivotY: number;
  /**
   * Where the trimmed region sits inside the original image, in pixels.
   */
  readonly offsetX: number;
  /**
   * Where the trimmed region sits inside the original image, in pixels.
   */
  readonly offsetY: number;
  /**
   * Width of the original image before trimming.
   */
  readonly sourceWidth: number;
  /**
   * Height of the original image before trimming.
   */
  readonly sourceHeight: number;
  /**
   * How long an animation shows this frame, in ms, when the file says so.
   */
  readonly durationMs: number | undefined;
}

/**
 * A named animation found in an atlas file (an Aseprite tag).
 */
export interface AtlasTag {
  readonly name: string;
  /**
   * Names of the frames in play order.
   */
  readonly frames: readonly string[];
  /**
   * Duration of each frame in ms, in the same order.
   */
  readonly durationsMs: readonly number[];
  readonly direction: 'forward' | 'reverse' | 'pingpong';
}

/**
 * The result of reading an atlas description file.
 */
export interface AtlasData {
  /**
   * Texture width in pixels.
   */
  readonly width: number;
  /**
   * Texture height in pixels.
   */
  readonly height: number;
  /**
   * Every frame, in file order.
   */
  readonly frames: readonly AtlasFrame[];
  /**
   * Animations declared by the file, if any.
   */
  readonly tags: readonly AtlasTag[];
}

/**
 * UV rectangle of a frame, `0` to `1`.
 */
export interface FrameUv {
  readonly u: number;
  readonly v: number;
  readonly uWidth: number;
  readonly vHeight: number;
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`atlas: ${path} must be a number`);
  }
  return value;
}

function rect(value: unknown, path: string): { x: number; y: number; w: number; h: number } {
  if (!isRecord(value)) throw new RangeError(`atlas: ${path} must be an object`);
  return {
    x: num(value['x'], `${path}.x`),
    y: num(value['y'], `${path}.y`),
    w: num(value['w'], `${path}.w`),
    h: num(value['h'], `${path}.h`),
  };
}

function parseFrame(name: string, value: unknown): AtlasFrame {
  if (!isRecord(value)) throw new RangeError(`atlas: frame "${name}" must be an object`);
  if (value['rotated'] === true) {
    throw new RangeError(
      `atlas: frame "${name}" is rotated; turn off rotation in the packer, it is not supported`,
    );
  }
  const region = rect(value['frame'], `frame "${name}".frame`);
  const source = isRecord(value['sourceSize'])
    ? {
        w: num(value['sourceSize']['w'], 'sourceSize.w'),
        h: num(value['sourceSize']['h'], 'sourceSize.h'),
      }
    : { w: region.w, h: region.h };
  const trim =
    value['spriteSourceSize'] === undefined
      ? { x: 0, y: 0 }
      : rect(value['spriteSourceSize'], `frame "${name}".spriteSourceSize`);
  const pivot = isRecord(value['pivot'])
    ? { x: num(value['pivot']['x'], 'pivot.x'), y: num(value['pivot']['y'], 'pivot.y') }
    : { x: 0.5, y: 0.5 };
  const duration = value['duration'];
  return {
    name,
    x: region.x,
    y: region.y,
    width: region.w,
    height: region.h,
    pivotX: pivot.x,
    pivotY: pivot.y,
    offsetX: trim.x,
    offsetY: trim.y,
    sourceWidth: source.w,
    sourceHeight: source.h,
    durationMs: typeof duration === 'number' ? duration : undefined,
  };
}

function parseTags(meta: Json, frames: readonly AtlasFrame[]): AtlasTag[] {
  const raw = meta['frameTags'];
  if (!Array.isArray(raw)) return [];
  const tags: AtlasTag[] = [];
  for (const entry of raw as unknown[]) {
    if (!isRecord(entry)) continue;
    const name = entry['name'];
    const from = num(entry['from'], 'frameTags.from');
    const to = num(entry['to'], 'frameTags.to');
    if (typeof name !== 'string') throw new RangeError('atlas: a frame tag needs a name');
    const slice = frames.slice(from, to + 1);
    if (slice.length === 0) throw new RangeError(`atlas: tag "${name}" selects no frames`);
    const direction = entry['direction'];
    tags.push({
      name,
      frames: slice.map(frameName),
      durationsMs: slice.map(frameDuration),
      direction: direction === 'reverse' || direction === 'pingpong' ? direction : 'forward',
    });
  }
  return tags;
}

function frameName(frame: AtlasFrame): string {
  return frame.name;
}

function frameDuration(frame: AtlasFrame): number {
  return frame.durationMs ?? 100;
}

/**
 * Reads the JSON that TexturePacker (hash or array format) and Aseprite export. Rotated frames
 * are rejected, and Aseprite tags become {@link AtlasTag}s.
 *
 * @throws {RangeError} if the file is malformed or uses rotated frames.
 */
export function parseAtlasJson(json: unknown): AtlasData {
  if (!isRecord(json)) throw new RangeError('atlas: the file must be an object');
  const source = json['frames'];
  const frames: AtlasFrame[] = [];
  if (Array.isArray(source)) {
    for (const [index, entry] of (source as unknown[]).entries()) {
      const filename = isRecord(entry) ? entry['filename'] : undefined;
      frames.push(parseFrame(typeof filename === 'string' ? filename : String(index), entry));
    }
  } else if (isRecord(source)) {
    for (const [name, entry] of Object.entries(source)) frames.push(parseFrame(name, entry));
  } else {
    throw new RangeError('atlas: "frames" must be an object or an array');
  }
  const meta = isRecord(json['meta']) ? json['meta'] : {};
  const size = isRecord(meta['size']) ? meta['size'] : {};
  const width = num(size['w'], 'meta.size.w');
  const height = num(size['h'], 'meta.size.h');
  return { width, height, frames, tags: parseTags(meta, frames) };
}

/**
 * A texture plus named frames inside it. Sprites that use frames of one atlas share one
 * texture and so one draw call.
 *
 * @example
 * const atlas = new Atlas(texture, parseAtlasJson(json));
 * atlas.draw(batch, 'hero_idle', { x: 100, y: 50 });
 */
export class Atlas {
  private readonly byName = new Map<string, AtlasFrame>();

  /**
   * @param texture the atlas image on the GPU.
   * @param data the parsed description; its size must match the texture.
   * @throws {RangeError} if the sizes differ or two frames share a name.
   */
  constructor(
    readonly texture: Texture,
    readonly data: AtlasData,
  ) {
    if (texture.width !== data.width || texture.height !== data.height) {
      throw new RangeError(
        `Atlas: description is ${data.width}x${data.height} but the texture is ${texture.width}x${texture.height}`,
      );
    }
    for (const frame of data.frames) {
      if (this.byName.has(frame.name)) {
        throw new RangeError(`Atlas: duplicate frame "${frame.name}"`);
      }
      this.byName.set(frame.name, frame);
    }
  }

  /**
   * Names of every frame.
   */
  get names(): readonly string[] {
    return this.data.frames.map(frameName);
  }

  /**
   * Whether a frame exists.
   */
  has(name: string): boolean {
    return this.byName.has(name);
  }

  /**
   * Looks a frame up.
   *
   * @throws {RangeError} if there is no such frame.
   */
  frame(name: string): AtlasFrame {
    const frame = this.byName.get(name);
    if (frame === undefined) throw new RangeError(`Atlas: no frame "${name}"`);
    return frame;
  }

  /**
   * The UV rectangle of a frame.
   */
  uv(name: string): FrameUv {
    const frame = this.frame(name);
    return {
      u: frame.x / this.texture.width,
      v: frame.y / this.texture.height,
      uWidth: frame.width / this.texture.width,
      vHeight: frame.height / this.texture.height,
    };
  }

  /**
   * Adds a frame to a batch. `width` and `height` default to the frame's original size, scaled by
   * `scale`. A trimmed frame is drawn so its visible part stays where it was in the source image,
   * and the pivot refers to the untrimmed image.
   */
  draw(
    batch: SpriteBatch,
    name: string,
    options: Omit<SpriteDraw, 'width' | 'height' | 'u' | 'v' | 'uWidth' | 'vHeight'> & {
      readonly scale?: number;
    },
  ): void {
    const frame = this.frame(name);
    const uv = this.uv(name);
    const scale = options.scale ?? 1;
    const originX = options.originX ?? frame.pivotX;
    const originY = options.originY ?? frame.pivotY;
    const sourceOriginX = frame.sourceWidth * originX;
    const sourceOriginY = frame.sourceHeight * originY;
    batch.add(this.texture, {
      ...options,
      width: frame.width * scale,
      height: frame.height * scale,
      originX: (sourceOriginX - frame.offsetX) / frame.width,
      originY: (sourceOriginY - frame.offsetY) / frame.height,
      ...uv,
    });
  }
}
