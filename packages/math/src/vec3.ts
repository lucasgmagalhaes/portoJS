/**
 * A 3D vector. Methods return a new vector, or write into `out` to avoid allocating.
 */
export class Vec3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}

  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  equals(other: Vec3): boolean {
    return this.x === other.x && this.y === other.y && this.z === other.z;
  }

  add(other: Vec3, out: Vec3 = new Vec3()): Vec3 {
    return out.set(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  sub(other: Vec3, out: Vec3 = new Vec3()): Vec3 {
    return out.set(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  scale(factor: number, out: Vec3 = new Vec3()): Vec3 {
    return out.set(this.x * factor, this.y * factor, this.z * factor);
  }

  dot(other: Vec3): number {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }

  cross(other: Vec3, out: Vec3 = new Vec3()): Vec3 {
    return out.set(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x,
    );
  }

  lengthSquared(): number {
    return this.dot(this);
  }

  length(): number {
    return Math.hypot(this.x, this.y, this.z);
  }

  /**
   * A unit-length copy. The zero vector stays zero.
   */
  normalize(out: Vec3 = new Vec3()): Vec3 {
    const length = this.length();
    return length === 0
      ? out.set(0, 0, 0)
      : out.set(this.x / length, this.y / length, this.z / length);
  }

  lerp(other: Vec3, t: number, out: Vec3 = new Vec3()): Vec3 {
    return out.set(
      this.x + (other.x - this.x) * t,
      this.y + (other.y - this.y) * t,
      this.z + (other.z - this.z) * t,
    );
  }
}
