import type { Camera2D, Point } from './camera.ts';

/**
 * A rectangle in world units, by its top-left corner.
 */
export interface WorldRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Options of {@link CameraController.follow}.
 */
export interface FollowOptions {
  /**
   * Where to look. Read on every update, so it can follow a moving object.
   */
  readonly target: () => Point;
  /**
   * Seconds the camera takes to close most of the gap. `0` snaps to the target. Default `0.15`.
   */
  readonly smoothTime?: number;
  /**
   * A box around the camera centre, in world units, inside which the target can move without the
   * camera following. Default none.
   */
  readonly deadZone?: { readonly width: number; readonly height: number };
  /**
   * Shifts the look-at point, for example to show more of what is ahead.
   */
  readonly offset?: Point;
}

/**
 * Options of a {@link CameraController}.
 */
export interface CameraControllerOptions {
  /**
   * Returns a number from `0` to below `1`, for the shake. Default `Math.random`.
   */
  readonly random?: () => number;
}

interface Shake {
  intensity: number;
  duration: number;
  elapsed: number;
}

interface ZoomAnimation {
  readonly from: number;
  readonly to: number;
  readonly duration: number;
  readonly ease: (t: number) => number;
  elapsed: number;
}

function linear(t: number): number {
  return t;
}

/**
 * Drives a {@link Camera2D} over time: follows a target with smoothing and a dead zone, shakes,
 * zooms smoothly and stays inside world bounds. Call {@link CameraController.update} once per
 * frame (or per step) with the elapsed seconds; it writes the result into the camera.
 *
 * @example
 * const controller = new CameraController(camera);
 * controller.setBounds({ x: 0, y: 0, width: 2000, height: 1000 });
 * controller.follow({ target: () => player, smoothTime: 0.2 });
 * controller.shake(6, 0.3); // on a hit
 * controller.update(dt);
 */
export class CameraController {
  /**
   * The camera centre before shake is added.
   */
  x: number;
  y: number;

  private following: FollowOptions | undefined;
  private bounds: WorldRect | undefined;
  private shakes: Shake[] = [];
  private zoomAnimation: ZoomAnimation | undefined;
  private shakeX = 0;
  private shakeY = 0;
  private shakeClock = 0;
  private readonly random: () => number;

  constructor(
    readonly camera: Camera2D,
    options: CameraControllerOptions = {},
  ) {
    this.x = camera.x;
    this.y = camera.y;
    this.random = options.random ?? Math.random;
  }

  /**
   * Starts following a target. Replaces any earlier follow.
   *
   * @throws {RangeError} for a negative `smoothTime` or dead zone.
   */
  follow(options: FollowOptions): void {
    if ((options.smoothTime ?? 0) < 0) throw new RangeError('follow: smoothTime must be >= 0');
    if (
      options.deadZone !== undefined &&
      (options.deadZone.width < 0 || options.deadZone.height < 0)
    ) {
      throw new RangeError('follow: the dead zone cannot be negative');
    }
    this.following = options;
  }

  /**
   * Stops following; the camera stays where it is.
   */
  stopFollowing(): void {
    this.following = undefined;
  }

  /**
   * Keeps the visible area inside `bounds`. If the world is smaller than the view on an axis, the
   * camera centres on it. Pass `undefined` to remove the limit.
   */
  setBounds(bounds: WorldRect | undefined): void {
    this.bounds = bounds;
  }

  /**
   * Adds a shake of up to `intensity` world units that fades out over `duration` seconds.
   * Shakes add up.
   *
   * @throws {RangeError} if `intensity` is negative or `duration` is not above zero.
   */
  shake(intensity: number, duration: number): void {
    if (!(intensity >= 0) || !(duration > 0)) {
      throw new RangeError('shake: intensity must be >= 0 and duration > 0');
    }
    this.shakes.push({ intensity, duration, elapsed: 0 });
  }

  /**
   * Changes the zoom to `zoom` over `duration` seconds. `0` jumps. A new call replaces a zoom in
   * progress, starting from the current value.
   *
   * @throws {RangeError} if `zoom` is not positive or `duration` is negative.
   */
  zoomTo(zoom: number, duration = 0, ease: (t: number) => number = linear): void {
    if (!(zoom > 0) || !(duration >= 0)) {
      throw new RangeError('zoomTo: zoom must be > 0 and duration >= 0');
    }
    if (duration === 0) {
      this.zoomAnimation = undefined;
      this.camera.zoom = zoom;
      return;
    }
    this.zoomAnimation = { from: this.camera.zoom, to: zoom, duration, ease, elapsed: 0 };
  }

  /**
   * Jumps to a position, without smoothing.
   */
  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.apply();
  }

  /**
   * Advances follow, zoom and shake by `deltaSeconds` and writes the camera.
   */
  update(deltaSeconds: number): void {
    this.updateZoom(deltaSeconds);
    this.updateFollow(deltaSeconds);
    this.clampToBounds();
    this.updateShake(deltaSeconds);
    this.apply();
  }

  private updateZoom(dt: number): void {
    const animation = this.zoomAnimation;
    if (animation === undefined) return;
    animation.elapsed += dt;
    const t = Math.min(1, animation.elapsed / animation.duration);
    this.camera.zoom =
      t >= 1 ? animation.to : animation.from + (animation.to - animation.from) * animation.ease(t);
    if (t >= 1) this.zoomAnimation = undefined;
  }

  private updateFollow(dt: number): void {
    const follow = this.following;
    if (follow === undefined) return;
    const target = follow.target();
    const wantedX = target.x + (follow.offset?.x ?? 0);
    const wantedY = target.y + (follow.offset?.y ?? 0);
    const halfWidth = (follow.deadZone?.width ?? 0) / 2;
    const halfHeight = (follow.deadZone?.height ?? 0) / 2;
    const goalX =
      Math.abs(wantedX - this.x) <= halfWidth
        ? this.x
        : wantedX - Math.sign(wantedX - this.x) * halfWidth;
    const goalY =
      Math.abs(wantedY - this.y) <= halfHeight
        ? this.y
        : wantedY - Math.sign(wantedY - this.y) * halfHeight;
    const smooth = follow.smoothTime ?? 0.15;
    const amount = smooth <= 0 ? 1 : 1 - Math.exp(-dt / smooth);
    this.x += (goalX - this.x) * amount;
    this.y += (goalY - this.y) * amount;
  }

  private clampToBounds(): void {
    const bounds = this.bounds;
    if (bounds === undefined) return;
    const halfWidth = this.camera.width / this.camera.zoom / 2;
    const halfHeight = this.camera.height / this.camera.zoom / 2;
    this.x = clampAxis(this.x, bounds.x, bounds.x + bounds.width, halfWidth);
    this.y = clampAxis(this.y, bounds.y, bounds.y + bounds.height, halfHeight);
  }

  private updateShake(dt: number): void {
    let strength = 0;
    for (const shake of this.shakes) {
      shake.elapsed += dt;
      strength += shake.intensity * Math.max(0, 1 - shake.elapsed / shake.duration);
    }
    this.shakes = this.shakes.filter(isActive);
    if (strength === 0) {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeClock = 0;
      return;
    }
    this.shakeClock -= dt;
    if (this.shakeClock <= 0) {
      this.shakeClock = 1 / SHAKE_HZ;
      this.shakeX = (this.random() * 2 - 1) * strength;
      this.shakeY = (this.random() * 2 - 1) * strength;
    }
  }

  private apply(): void {
    this.camera.x = this.x + this.shakeX;
    this.camera.y = this.y + this.shakeY;
  }
}

const SHAKE_HZ = 30;

function isActive(shake: Shake): boolean {
  return shake.elapsed < shake.duration;
}

function clampAxis(value: number, min: number, max: number, half: number): number {
  if (max - min <= half * 2) return (min + max) / 2;
  return Math.min(max - half, Math.max(min + half, value));
}
