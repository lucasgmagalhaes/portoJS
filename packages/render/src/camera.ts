/**
 * A 2D point.
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * An orthographic 2D camera. The world uses screen-like axes (x to the right, y down). The camera
 * looks at `(x, y)`, shown in the middle of the viewport.
 *
 * @example
 * const camera = new Camera2D(800, 600);
 * camera.x = player.x;
 * camera.zoom = 2;
 */
export class Camera2D {
  /**
   * World x at the middle of the viewport.
   */
  x = 0;
  /**
   * World y at the middle of the viewport.
   */
  y = 0;
  /**
   * Scale: `2` shows half as much world in each direction. Must be positive.
   */
  zoom = 1;
  /**
   * Rotation in radians (counter-clockwise on screen).
   */
  rotation = 0;

  /**
   * @param width viewport width in pixels.
   * @param height viewport height in pixels.
   * @throws {RangeError} if a size is not positive.
   */
  constructor(
    public width = 800,
    public height = 600,
  ) {
    assertSize(width, height);
  }

  /**
   * Sets the viewport size in pixels.
   *
   * @throws {RangeError} if a size is not positive.
   */
  setViewport(width: number, height: number): void {
    assertSize(width, height);
    this.width = width;
    this.height = height;
  }

  /**
   * Writes the column-major 4x4 view-projection matrix (world to clip space) into `out`.
   */
  viewProjection(out: Float32Array = new Float32Array(16)): Float32Array {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const a = (2 * this.zoom * cos) / this.width;
    const b = (2 * this.zoom * sin) / this.width;
    const c = (2 * this.zoom * sin) / this.height;
    const d = (-2 * this.zoom * cos) / this.height;
    out.fill(0);
    out[0] = a;
    out[1] = c;
    out[4] = b;
    out[5] = d;
    out[10] = 1;
    out[12] = -(a * this.x + b * this.y);
    out[13] = -(c * this.x + d * this.y);
    out[15] = 1;
    return out;
  }

  /**
   * Converts a point in viewport pixels (origin at the top left) to world coordinates.
   */
  screenToWorld(screenX: number, screenY: number): Point {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const vx = screenX - this.width / 2;
    const vy = screenY - this.height / 2;
    return {
      x: this.x + (vx * cos - vy * sin) / this.zoom,
      y: this.y + (vx * sin + vy * cos) / this.zoom,
    };
  }

  /**
   * Converts a world point to viewport pixels (origin at the top left).
   */
  worldToScreen(worldX: number, worldY: number): Point {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const dx = worldX - this.x;
    const dy = worldY - this.y;
    return {
      x: this.width / 2 + this.zoom * (dx * cos + dy * sin),
      y: this.height / 2 + this.zoom * (-dx * sin + dy * cos),
    };
  }
}

function assertSize(width: number, height: number): void {
  if (!(width > 0) || !(height > 0)) throw new RangeError('Camera2D: size must be positive');
}
