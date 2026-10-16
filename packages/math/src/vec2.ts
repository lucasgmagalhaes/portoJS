/**
 * A 2D vector. Methods return a new vector, or write into `out` to avoid allocating.
 *
 * @example
 * const velocity = new Vec2(3, 4);
 * velocity.length(); // 5
 * velocity.add(new Vec2(1, 1), velocity); // in place
 */
export class Vec2 {
  constructor(
    public x = 0,
    public y = 0,
  ) {}

  /**
   * A copy of this vector.
   */
  clone(): Vec2 {
    return new Vec2(this.x, this.y);
  }

  /**
   * Sets both components and returns `this`.
   */
  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * Whether both components are equal.
   */
  equals(other: Vec2): boolean {
    return this.x === other.x && this.y === other.y;
  }

  add(other: Vec2, out: Vec2 = new Vec2()): Vec2 {
    return out.set(this.x + other.x, this.y + other.y);
  }

  sub(other: Vec2, out: Vec2 = new Vec2()): Vec2 {
    return out.set(this.x - other.x, this.y - other.y);
  }

  scale(factor: number, out: Vec2 = new Vec2()): Vec2 {
    return out.set(this.x * factor, this.y * factor);
  }

  dot(other: Vec2): number {
    return this.x * other.x + this.y * other.y;
  }

  /**
   * The z component of the 3D cross product. Positive when `other` is counter-clockwise from this.
   */
  cross(other: Vec2): number {
    return this.x * other.y - this.y * other.x;
  }

  lengthSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  length(): number {
    return Math.hypot(this.x, this.y);
  }

  distanceTo(other: Vec2): number {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }

  /**
   * A unit-length copy. The zero vector stays zero.
   */
  normalize(out: Vec2 = new Vec2()): Vec2 {
    const length = this.length();
    return length === 0 ? out.set(0, 0) : out.set(this.x / length, this.y / length);
  }

  /**
   * Rotates counter-clockwise by `radians`.
   */
  rotate(radians: number, out: Vec2 = new Vec2()): Vec2 {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return out.set(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
  }

  /**
   * The angle of this vector in radians, from `-PI` to `PI`.
   */
  angle(): number {
    return Math.atan2(this.y, this.x);
  }

  /**
   * Linear interpolation towards `other`.
   */
  lerp(other: Vec2, t: number, out: Vec2 = new Vec2()): Vec2 {
    return out.set(this.x + (other.x - this.x) * t, this.y + (other.y - this.y) * t);
  }

  /**
   * A copy whose length is at most `max`.
   */
  clampLength(max: number, out: Vec2 = new Vec2()): Vec2 {
    const length = this.length();
    return length > max && length > 0
      ? out.set((this.x / length) * max, (this.y / length) * max)
      : out.set(this.x, this.y);
  }

  /**
   * The unit vector pointing at `radians`.
   */
  static fromAngle(radians: number, length = 1): Vec2 {
    return new Vec2(Math.cos(radians) * length, Math.sin(radians) * length);
  }
}
