import { GameEvent } from '@portojs/runtime';
import type { Pointer, PointerStreamEvent } from './pointer.ts';

/**
 * Thresholds of a {@link GestureRecognizer}. Distances are in the pointer's drawing space and
 * times in ms.
 */
export interface GestureOptions {
  /**
   * Longest press that still counts as a tap. Default `250`.
   */
  readonly tapMaxMs?: number;
  /**
   * How far a finger may move and still count as a tap or a long press. Default `10`.
   */
  readonly tapMaxDistance?: number;
  /**
   * Longest gap between two taps of a double tap. Default `300`.
   */
  readonly doubleTapMs?: number;
  /**
   * How close two taps must be to form a double tap. Default `30`.
   */
  readonly doubleTapDistance?: number;
  /**
   * How long a still press must last to become a long press. Default `500`.
   */
  readonly longPressMs?: number;
  /**
   * Shortest travel of a swipe. Default `40`.
   */
  readonly swipeMinDistance?: number;
  /**
   * Longest time a swipe may take. Default `500`.
   */
  readonly swipeMaxMs?: number;
  /**
   * Movement after which a drag becomes a pan. Default `10`.
   */
  readonly panThreshold?: number;
}

/**
 * A point where something happened.
 */
export interface GesturePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Direction of a swipe.
 */
export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Payload of {@link GestureRecognizer.swipe}.
 */
export interface SwipeGesture extends GesturePoint {
  readonly direction: SwipeDirection;
  readonly dx: number;
  readonly dy: number;
  readonly distance: number;
  /**
   * Speed in drawing-space units per second.
   */
  readonly velocity: number;
}

/**
 * Payload of {@link GestureRecognizer.pan}.
 */
export interface PanGesture extends GesturePoint {
  /**
   * Movement since the previous pan event.
   */
  readonly dx: number;
  readonly dy: number;
  /**
   * Movement since the touch began.
   */
  readonly totalDx: number;
  readonly totalDy: number;
}

/**
 * Payload of {@link GestureRecognizer.pinch}.
 */
export interface PinchGesture extends GesturePoint {
  /**
   * Distance between the fingers relative to when the pinch began: above `1` spreads.
   */
  readonly scale: number;
  /**
   * Change of `scale` since the previous pinch event, as a factor.
   */
  readonly delta: number;
}

interface Track {
  readonly startX: number;
  readonly startY: number;
  readonly startTime: number;
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  panning: boolean;
  longPressed: boolean;
  consumed: boolean;
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Turns the stream of a {@link Pointer} into taps, double taps, long presses, swipes, pans and
 * pinches. Only the primary button counts. Feed it events with {@link GestureRecognizer.attach}
 * and call {@link GestureRecognizer.update} every step, with the same clock the events use, so
 * long presses fire without another event.
 *
 * @example
 * const gestures = new GestureRecognizer();
 * gestures.attach(pointer);
 * gestures.tap.addListener(({ x, y }) => select(camera.screenToWorld(x, y)));
 * gestures.pinch.addListener(({ delta }) => (camera.zoom *= delta));
 */
export class GestureRecognizer {
  /**
   * A quick press and release in place.
   */
  readonly tap = new GameEvent<GesturePoint>();
  /**
   * The second tap of two close ones (the first still raises `tap`).
   */
  readonly doubleTap = new GameEvent<GesturePoint>();
  /**
   * A press held still.
   */
  readonly longPress = new GameEvent<GesturePoint>();
  /**
   * A fast stroke that ended.
   */
  readonly swipe = new GameEvent<SwipeGesture>();
  /**
   * A drag began.
   */
  readonly panStart = new GameEvent<GesturePoint>();
  /**
   * A drag moved.
   */
  readonly pan = new GameEvent<PanGesture>();
  /**
   * A drag ended.
   */
  readonly panEnd = new GameEvent<GesturePoint>();
  /**
   * Two fingers moved towards or away from each other.
   */
  readonly pinch = new GameEvent<PinchGesture>();

  private readonly tracks = new Map<number, Track>();
  private readonly tapMaxMs: number;
  private readonly tapMaxDistance: number;
  private readonly doubleTapMs: number;
  private readonly doubleTapDistance: number;
  private readonly longPressMs: number;
  private readonly swipeMinDistance: number;
  private readonly swipeMaxMs: number;
  private readonly panThreshold: number;
  private lastTap: { x: number; y: number; time: number } | undefined;
  private pinchStart = 0;
  private pinchLast = 0;
  private pinching = false;

  constructor(options: GestureOptions = {}) {
    this.tapMaxMs = options.tapMaxMs ?? 250;
    this.tapMaxDistance = options.tapMaxDistance ?? 10;
    this.doubleTapMs = options.doubleTapMs ?? 300;
    this.doubleTapDistance = options.doubleTapDistance ?? 30;
    this.longPressMs = options.longPressMs ?? 500;
    this.swipeMinDistance = options.swipeMinDistance ?? 40;
    this.swipeMaxMs = options.swipeMaxMs ?? 500;
    this.panThreshold = options.panThreshold ?? 10;
  }

  /**
   * Listens to a pointer. Returns a function that stops.
   */
  attach(pointer: Pointer): () => void {
    return pointer.events.addListener(this.feed);
  }

  /**
   * Handles one pointer event. {@link GestureRecognizer.attach} calls this for you.
   */
  readonly feed = (event: PointerStreamEvent): void => {
    if (event.type === 'down') this.onDown(event);
    else if (event.type === 'move') this.onMove(event);
    else this.onEnd(event);
  };

  /**
   * Checks timers: raises `longPress` for presses held long enough. Call it every step with the
   * current time in the same clock as the events (`performance.now()` for browser events).
   */
  update(now: number): void {
    if (this.tracks.size !== 1) return;
    for (const track of this.tracks.values()) {
      if (track.consumed || track.panning || track.longPressed) continue;
      if (now - track.startTime < this.longPressMs) continue;
      if (distance(track.x, track.y, track.startX, track.startY) > this.tapMaxDistance) continue;
      track.longPressed = true;
      this.longPress.invoke({ x: track.x, y: track.y });
    }
  }

  /**
   * Forgets every touch in progress.
   */
  reset(): void {
    this.tracks.clear();
    this.pinching = false;
  }

  private onDown(event: PointerStreamEvent): void {
    if (event.button !== 0) return;
    this.tracks.set(event.pointerId, {
      startX: event.x,
      startY: event.y,
      startTime: event.time,
      x: event.x,
      y: event.y,
      lastX: event.x,
      lastY: event.y,
      panning: false,
      longPressed: false,
      consumed: false,
    });
    if (this.tracks.size === 2) this.beginPinch();
  }

  private beginPinch(): void {
    for (const track of this.tracks.values()) {
      if (track.panning) this.panEnd.invoke({ x: track.x, y: track.y });
      track.consumed = true;
      track.panning = false;
    }
    const [a, b] = [...this.tracks.values()];
    if (a === undefined || b === undefined) return;
    this.pinchStart = Math.max(1e-6, distance(a.x, a.y, b.x, b.y));
    this.pinchLast = this.pinchStart;
    this.pinching = true;
  }

  private onMove(event: PointerStreamEvent): void {
    const track = this.tracks.get(event.pointerId);
    if (track === undefined) return;
    track.x = event.x;
    track.y = event.y;
    if (this.pinching) {
      this.movePinch();
      return;
    }
    if (track.consumed) return;
    const travelled = distance(track.x, track.y, track.startX, track.startY);
    if (!track.panning && travelled >= this.panThreshold) {
      track.panning = true;
      this.panStart.invoke({ x: track.startX, y: track.startY });
    }
    if (track.panning) {
      this.pan.invoke({
        x: track.x,
        y: track.y,
        dx: track.x - track.lastX,
        dy: track.y - track.lastY,
        totalDx: track.x - track.startX,
        totalDy: track.y - track.startY,
      });
      track.lastX = track.x;
      track.lastY = track.y;
    }
  }

  private movePinch(): void {
    const [a, b] = [...this.tracks.values()];
    if (a === undefined || b === undefined) return;
    const current = Math.max(1e-6, distance(a.x, a.y, b.x, b.y));
    this.pinch.invoke({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      scale: current / this.pinchStart,
      delta: current / this.pinchLast,
    });
    this.pinchLast = current;
  }

  private onEnd(event: PointerStreamEvent): void {
    const track = this.tracks.get(event.pointerId);
    if (track === undefined) return;
    this.tracks.delete(event.pointerId);
    track.x = event.x;
    track.y = event.y;
    if (this.pinching) {
      if (this.tracks.size < 2) this.pinching = false;
      return;
    }
    if (track.consumed) return;
    if (event.type === 'cancel') {
      if (track.panning) this.panEnd.invoke({ x: track.x, y: track.y });
      return;
    }
    this.finish(track, event.time);
  }

  private finish(track: Track, time: number): void {
    const duration = time - track.startTime;
    const dx = track.x - track.startX;
    const dy = track.y - track.startY;
    const travelled = Math.hypot(dx, dy);
    if (track.panning) this.panEnd.invoke({ x: track.x, y: track.y });
    if (travelled >= this.swipeMinDistance && duration <= this.swipeMaxMs) {
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const direction: SwipeDirection = horizontal
        ? dx > 0
          ? 'right'
          : 'left'
        : dy > 0
          ? 'down'
          : 'up';
      this.swipe.invoke({
        x: track.x,
        y: track.y,
        direction,
        dx,
        dy,
        distance: travelled,
        velocity: duration > 0 ? (travelled * 1000) / duration : Infinity,
      });
      return;
    }
    if (track.longPressed || travelled > this.tapMaxDistance || duration > this.tapMaxMs) return;
    const point = { x: track.x, y: track.y };
    this.tap.invoke(point);
    const previous = this.lastTap;
    if (
      previous !== undefined &&
      time - previous.time <= this.doubleTapMs &&
      distance(previous.x, previous.y, point.x, point.y) <= this.doubleTapDistance
    ) {
      this.lastTap = undefined;
      this.doubleTap.invoke(point);
    } else {
      this.lastTap = { ...point, time };
    }
  }
}
