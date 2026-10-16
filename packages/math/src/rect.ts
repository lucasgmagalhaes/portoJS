import type { Vec2 } from './vec2.ts';

/**
 * An axis-aligned rectangle: top-left corner `(x, y)` and a non-negative size.
 */
export class Rect {
  constructor(
    public x = 0,
    public y = 0,
    public width = 0,
    public height = 0,
  ) {}

  get right(): number {
    return this.x + this.width;
  }

  get bottom(): number {
    return this.y + this.height;
  }

  get centerX(): number {
    return this.x + this.width / 2;
  }

  get centerY(): number {
    return this.y + this.height / 2;
  }

  clone(): Rect {
    return new Rect(this.x, this.y, this.width, this.height);
  }

  /**
   * Whether the point is inside. The left and top edges count, the right and bottom do not.
   */
  contains(x: number, y: number): boolean {
    return x >= this.x && x < this.right && y >= this.y && y < this.bottom;
  }

  containsPoint(point: Vec2): boolean {
    return this.contains(point.x, point.y);
  }

  /**
   * Whether the rectangles overlap. Touching edges do not count.
   */
  intersects(other: Rect): boolean {
    return (
      this.x < other.right && this.right > other.x && this.y < other.bottom && this.bottom > other.y
    );
  }

  /**
   * The overlap, or `null` when there is none.
   */
  intersection(other: Rect): Rect | null {
    const x = Math.max(this.x, other.x);
    const y = Math.max(this.y, other.y);
    const right = Math.min(this.right, other.right);
    const bottom = Math.min(this.bottom, other.bottom);
    return right > x && bottom > y ? new Rect(x, y, right - x, bottom - y) : null;
  }

  /**
   * The smallest rectangle holding both.
   */
  union(other: Rect): Rect {
    const x = Math.min(this.x, other.x);
    const y = Math.min(this.y, other.y);
    return new Rect(
      x,
      y,
      Math.max(this.right, other.right) - x,
      Math.max(this.bottom, other.bottom) - y,
    );
  }

  /**
   * A copy grown by `amount` on every side (shrunk when negative, never below zero size).
   */
  inflate(amount: number): Rect {
    return new Rect(
      this.x - amount,
      this.y - amount,
      Math.max(0, this.width + amount * 2),
      Math.max(0, this.height + amount * 2),
    );
  }
}
