import { Vec2 } from './vec2.ts';

/**
 * A 2D affine transform, the top two rows of a 3x3 matrix: `x' = a·x + c·y + tx` and
 * `y' = b·x + d·y + ty`.
 */
export class Mat3 {
  constructor(
    public a = 1,
    public b = 0,
    public c = 0,
    public d = 1,
    public tx = 0,
    public ty = 0,
  ) {}

  /**
   * Resets to the identity transform and returns `this`.
   */
  identity(): this {
    return this.set(1, 0, 0, 1, 0, 0);
  }

  /**
   * Sets every element and returns `this`.
   */
  set(a: number, b: number, c: number, d: number, tx: number, ty: number): this {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.tx = tx;
    this.ty = ty;
    return this;
  }

  clone(): Mat3 {
    return new Mat3(this.a, this.b, this.c, this.d, this.tx, this.ty);
  }

  /**
   * The nine elements of the full 3x3 matrix, column-major, ready for a GPU uniform.
   */
  toArray(): number[] {
    return [this.a, this.b, 0, this.c, this.d, 0, this.tx, this.ty, 1];
  }

  /**
   * Builds a transform that scales, then rotates (radians), then translates.
   */
  static compose(x: number, y: number, rotation = 0, scaleX = 1, scaleY = scaleX): Mat3 {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return new Mat3(cos * scaleX, sin * scaleX, -sin * scaleY, cos * scaleY, x, y);
  }

  /**
   * `this × other`: `other` is applied first, then `this`.
   */
  multiply(other: Mat3, out: Mat3 = new Mat3()): Mat3 {
    return out.set(
      this.a * other.a + this.c * other.b,
      this.b * other.a + this.d * other.b,
      this.a * other.c + this.c * other.d,
      this.b * other.c + this.d * other.d,
      this.a * other.tx + this.c * other.ty + this.tx,
      this.b * other.tx + this.d * other.ty + this.ty,
    );
  }

  /**
   * Transforms a point (translation included).
   */
  transformPoint(point: Vec2, out: Vec2 = new Vec2()): Vec2 {
    return out.set(
      this.a * point.x + this.c * point.y + this.tx,
      this.b * point.x + this.d * point.y + this.ty,
    );
  }

  /**
   * The inverse, or `null` when the transform is singular.
   */
  invert(out: Mat3 = new Mat3()): Mat3 | null {
    const det = this.a * this.d - this.c * this.b;
    if (det === 0) return null;
    const a = this.d / det;
    const b = -this.b / det;
    const c = -this.c / det;
    const d = this.a / det;
    return out.set(a, b, c, d, -(a * this.tx + c * this.ty), -(b * this.tx + d * this.ty));
  }
}
