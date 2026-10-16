import type { SpriteBatch, Texture } from './batch.ts';

/**
 * A number, or a `[min, max]` range a value is picked from for each particle.
 */
export type Range = number | readonly [number, number];

/**
 * A value that changes over a particle's life, from `start` to `end`.
 */
export interface OverLife {
  readonly start: number;
  readonly end: number;
}

/**
 * Colours over a particle's life, each as `0xRRGGBBAA`.
 */
export interface ColorOverLife {
  readonly start: number;
  readonly end: number;
}

/**
 * Where new particles appear around the emitter position.
 */
export type SpawnArea =
  | { readonly kind: 'point' }
  | { readonly kind: 'rect'; readonly width: number; readonly height: number }
  | { readonly kind: 'circle'; readonly radius: number };

/**
 * Options of a {@link ParticleEmitter}.
 */
export interface ParticleOptions {
  /**
   * The texture every particle uses.
   */
  readonly texture: Texture;
  /**
   * Most particles alive at once; further ones are dropped. Default `1000`.
   */
  readonly max?: number;
  /**
   * Seconds a particle lives. Default `1`.
   */
  readonly lifetime?: Range;
  /**
   * Particles emitted per second while {@link ParticleEmitter.emitting}. Default `0` (use
   * {@link ParticleEmitter.burst}).
   */
  readonly rate?: number;
  /**
   * Initial speed in world units per second. Default `0`.
   */
  readonly speed?: Range;
  /**
   * Direction of the initial velocity in radians; `0` is right and `Math.PI / 2` is down (the
   * world's y axis points down). Default: any direction.
   */
  readonly angle?: Range;
  /**
   * Acceleration in world units per second squared. Default none.
   */
  readonly gravity?: { readonly x: number; readonly y: number };
  /**
   * Fraction of the velocity lost each second, `0` to `1`. Default `0`.
   */
  readonly drag?: number;
  /**
   * Size in world units over life. Default `8` throughout.
   */
  readonly size?: OverLife | number;
  /**
   * Colour over life. Default opaque white throughout.
   */
  readonly color?: ColorOverLife | number;
  /**
   * Initial rotation in radians. Default `0`.
   */
  readonly rotation?: Range;
  /**
   * Spin in radians per second. Default `0`.
   */
  readonly spin?: Range;
  /**
   * Where particles start. Default a point.
   */
  readonly area?: SpawnArea;
  /**
   * Draw order, as for sprites. Default `0`.
   */
  readonly layer?: number;
  /**
   * Returns a number from `0` to below `1`. Default `Math.random`; pass a seeded generator for
   * reproducible effects.
   */
  readonly random?: () => number;
  /**
   * Shapes the change over life, from `t` to eased `t`. Default linear.
   */
  readonly ease?: (t: number) => number;
}

function between(random: () => number, range: Range): number {
  if (typeof range === 'number') return range;
  return range[0] + (range[1] - range[0]) * random();
}

function channel(color: number, shift: number): number {
  return (color >>> shift) & 0xff;
}

function mix(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * t);
}

function linear(t: number): number {
  return t;
}

/**
 * Emits and animates particles: sparks, smoke, coins. Particles live in typed arrays and are
 * drawn into a {@link SpriteBatch}, so thousands cost a single draw call. Call
 * {@link ParticleEmitter.update} every frame and {@link ParticleEmitter.draw} before building the
 * batch.
 *
 * @example
 * const sparks = new ParticleEmitter({
 *   texture: dot,
 *   lifetime: [0.4, 0.8],
 *   speed: [60, 140],
 *   gravity: { x: 0, y: 200 },
 *   size: { start: 6, end: 0 },
 *   color: { start: 0xffd800ff, end: 0xff300000 },
 * });
 * sparks.x = hit.x;
 * sparks.y = hit.y;
 * sparks.burst(24);
 * sparks.update(dt);
 * sparks.draw(batch);
 */
export class ParticleEmitter {
  /**
   * Where new particles appear.
   */
  x = 0;
  y = 0;
  /**
   * Whether the continuous `rate` is running. Bursts work either way.
   */
  emitting = true;

  private readonly capacity: number;
  private readonly random: () => number;
  private readonly ease: (t: number) => number;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly rot: Float32Array;
  private readonly spinRate: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private alive = 0;
  private owed = 0;

  /**
   * @throws {RangeError} if `max` is not a positive integer or `rate` is negative.
   */
  constructor(private readonly options: ParticleOptions) {
    this.capacity = options.max ?? 1000;
    if (!Number.isInteger(this.capacity) || this.capacity < 1) {
      throw new RangeError('ParticleEmitter: max must be a positive integer');
    }
    if ((options.rate ?? 0) < 0) throw new RangeError('ParticleEmitter: rate cannot be negative');
    this.random = options.random ?? Math.random;
    this.ease = options.ease ?? linear;
    this.px = new Float32Array(this.capacity);
    this.py = new Float32Array(this.capacity);
    this.vx = new Float32Array(this.capacity);
    this.vy = new Float32Array(this.capacity);
    this.rot = new Float32Array(this.capacity);
    this.spinRate = new Float32Array(this.capacity);
    this.age = new Float32Array(this.capacity);
    this.life = new Float32Array(this.capacity);
  }

  /**
   * Particles alive now.
   */
  get count(): number {
    return this.alive;
  }

  /**
   * Emits `count` particles at once.
   */
  burst(count: number): void {
    for (let index = 0; index < count; index++) this.spawn();
  }

  /**
   * Removes every particle.
   */
  clear(): void {
    this.alive = 0;
    this.owed = 0;
  }

  /**
   * Emits at the continuous rate, then moves, ages and retires particles.
   */
  update(deltaSeconds: number): void {
    if (this.emitting && (this.options.rate ?? 0) > 0) {
      this.owed += (this.options.rate ?? 0) * deltaSeconds;
      const whole = Math.floor(this.owed);
      this.owed -= whole;
      this.burst(whole);
    }
    const gravity = this.options.gravity;
    const keep = Math.max(0, 1 - (this.options.drag ?? 0)) ** deltaSeconds;
    let index = 0;
    while (index < this.alive) {
      const age = (this.age[index] ?? 0) + deltaSeconds;
      if (age >= (this.life[index] ?? 0)) {
        this.remove(index);
        continue;
      }
      this.age[index] = age;
      const vx = ((this.vx[index] ?? 0) + (gravity?.x ?? 0) * deltaSeconds) * keep;
      const vy = ((this.vy[index] ?? 0) + (gravity?.y ?? 0) * deltaSeconds) * keep;
      this.vx[index] = vx;
      this.vy[index] = vy;
      this.px[index] = (this.px[index] ?? 0) + vx * deltaSeconds;
      this.py[index] = (this.py[index] ?? 0) + vy * deltaSeconds;
      this.rot[index] = (this.rot[index] ?? 0) + (this.spinRate[index] ?? 0) * deltaSeconds;
      index += 1;
    }
  }

  /**
   * Adds every live particle to the batch.
   */
  draw(batch: SpriteBatch): void {
    const { texture, layer = 0 } = this.options;
    const size = this.options.size ?? 8;
    const startSize = typeof size === 'number' ? size : size.start;
    const endSize = typeof size === 'number' ? size : size.end;
    const color = this.options.color ?? 0xffffffff;
    const startColor = typeof color === 'number' ? color : color.start;
    const endColor = typeof color === 'number' ? color : color.end;
    for (let index = 0; index < this.alive; index++) {
      const t = this.ease((this.age[index] ?? 0) / (this.life[index] ?? 1));
      const side = startSize + (endSize - startSize) * t;
      const packed =
        ((mix(channel(startColor, 24), channel(endColor, 24), t) << 24) |
          (mix(channel(startColor, 16), channel(endColor, 16), t) << 16) |
          (mix(channel(startColor, 8), channel(endColor, 8), t) << 8) |
          mix(channel(startColor, 0), channel(endColor, 0), t)) >>>
        0;
      batch.addRaw(
        texture,
        layer,
        this.px[index] ?? 0,
        this.py[index] ?? 0,
        side,
        side,
        this.rot[index] ?? 0,
        0.5,
        0.5,
        0,
        0,
        1,
        1,
        packed,
      );
    }
  }

  private spawn(): void {
    if (this.alive >= this.capacity) return;
    const index = this.alive;
    this.alive += 1;
    const {
      lifetime = 1,
      speed = 0,
      angle = [0, Math.PI * 2],
      rotation = 0,
      spin = 0,
    } = this.options;
    const direction = between(this.random, angle);
    const velocity = between(this.random, speed);
    const area = this.options.area ?? { kind: 'point' };
    let offsetX = 0;
    let offsetY = 0;
    if (area.kind === 'rect') {
      offsetX = (this.random() - 0.5) * area.width;
      offsetY = (this.random() - 0.5) * area.height;
    } else if (area.kind === 'circle') {
      const radius = Math.sqrt(this.random()) * area.radius;
      const around = this.random() * Math.PI * 2;
      offsetX = Math.cos(around) * radius;
      offsetY = Math.sin(around) * radius;
    }
    this.px[index] = this.x + offsetX;
    this.py[index] = this.y + offsetY;
    this.vx[index] = Math.cos(direction) * velocity;
    this.vy[index] = Math.sin(direction) * velocity;
    this.rot[index] = between(this.random, rotation);
    this.spinRate[index] = between(this.random, spin);
    this.age[index] = 0;
    this.life[index] = Math.max(1e-6, between(this.random, lifetime));
  }

  private remove(index: number): void {
    const last = this.alive - 1;
    if (index !== last) {
      this.px[index] = this.px[last] ?? 0;
      this.py[index] = this.py[last] ?? 0;
      this.vx[index] = this.vx[last] ?? 0;
      this.vy[index] = this.vy[last] ?? 0;
      this.rot[index] = this.rot[last] ?? 0;
      this.spinRate[index] = this.spinRate[last] ?? 0;
      this.age[index] = this.age[last] ?? 0;
      this.life[index] = this.life[last] ?? 0;
    }
    this.alive = last;
  }
}
