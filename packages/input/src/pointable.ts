import { Component, GameEvent } from '@portojs/runtime';
import type { GameObject } from '@portojs/runtime';
import type { Pointer, PointerStreamEvent } from './pointer.ts';

/**
 * What a {@link Pointable} reports to its listeners.
 */
export interface PointerHit {
  readonly pointerId: number;
  /**
   * Which button: `0` left or touch, `1` middle, `2` right.
   */
  readonly button: number;
  /**
   * Position in the pointer's drawing space.
   */
  readonly x: number;
  readonly y: number;
  /**
   * The same position in world coordinates.
   */
  readonly worldX: number;
  readonly worldY: number;
  /**
   * Movement since the previous drag event, in world coordinates. `0` outside drags.
   */
  readonly dx: number;
  readonly dy: number;
}

/**
 * Decides whether a world point is on an object.
 */
export type HitTest = (worldX: number, worldY: number) => boolean;

/**
 * Options of a {@link Pointable}.
 */
export interface PointableOptions {
  /**
   * Whether a world point is on this object. See {@link rectHitTest} and {@link circleHitTest}.
   */
  readonly hitTest: HitTest;
  /**
   * Higher values are tested first; the first hit gets the event. Default `0`. Objects with the
   * same order are tested newest first.
   */
  readonly order?: number;
}

/**
 * Makes an object react to the pointer: add it with a hit test and listen to its events.
 * Needs a {@link PointerSystem} in the game. Only the top-most object under the pointer gets
 * an event, and a disabled object or one with an inactive game object is ignored.
 *
 * @example
 * const button = game.createObject('Button').addComponent(Pointable, {
 *   hitTest: rectHitTest(() => ({ x: 10, y: 10, width: 100, height: 40 })),
 * });
 * button.click.addListener(() => startGame());
 */
export class Pointable extends Component {
  static override typeId = 'Pointable';

  /**
   * A button went down on this object.
   */
  readonly pointerDown = new GameEvent<PointerHit>();
  /**
   * A button that went down on this object came up, wherever the pointer is.
   */
  readonly pointerUp = new GameEvent<PointerHit>();
  /**
   * The press and the release were both on this object, without a drag.
   */
  readonly click = new GameEvent<PointerHit>();
  /**
   * The pointer moved onto this object.
   */
  readonly pointerEnter = new GameEvent<PointerHit>();
  /**
   * The pointer left this object.
   */
  readonly pointerExit = new GameEvent<PointerHit>();
  /**
   * A press on this object started moving.
   */
  readonly dragStart = new GameEvent<PointerHit>();
  /**
   * A drag that started on this object moved.
   */
  readonly drag = new GameEvent<PointerHit>();
  /**
   * A drag ended.
   */
  readonly dragEnd = new GameEvent<PointerHit>();

  /**
   * Higher values are tested first.
   */
  order: number;

  private readonly test: HitTest;

  constructor(gameObject: GameObject, options: PointableOptions) {
    super(gameObject);
    this.test = options.hitTest;
    this.order = options.order ?? 0;
  }

  /**
   * Whether the world point is on this object.
   */
  contains(worldX: number, worldY: number): boolean {
    return this.test(worldX, worldY);
  }
}

/**
 * A hit test for an axis-aligned rectangle given by its top-left corner. The rectangle is read on
 * every test, so it can follow a moving object.
 */
export function rectHitTest(
  rect: () => {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
): HitTest {
  return (worldX, worldY) => {
    const r = rect();
    return worldX >= r.x && worldX < r.x + r.width && worldY >= r.y && worldY < r.y + r.height;
  };
}

/**
 * A hit test for a circle given by its centre and radius, read on every test.
 */
export function circleHitTest(
  circle: () => { readonly x: number; readonly y: number; readonly radius: number },
): HitTest {
  return (worldX, worldY) => {
    const c = circle();
    return (worldX - c.x) ** 2 + (worldY - c.y) ** 2 <= c.radius ** 2;
  };
}

/**
 * Options of a {@link PointerSystem}.
 */
export interface PointerSystemOptions {
  /**
   * The pointer to listen to.
   */
  readonly pointer: Pointer;
  /**
   * Converts a point in the pointer's drawing space to world coordinates, usually
   * `(x, y) => camera.screenToWorld(x, y)`. Default: the point itself.
   */
  readonly toWorld?: (x: number, y: number) => { readonly x: number; readonly y: number };
  /**
   * How far a press must move before it becomes a drag, in drawing-space units. Default `4`.
   */
  readonly dragThreshold?: number;
}

interface Press {
  readonly target: Pointable;
  readonly startX: number;
  readonly startY: number;
  lastWorldX: number;
  lastWorldY: number;
  dragging: boolean;
}

function identity(x: number, y: number): { x: number; y: number } {
  return { x, y };
}

/**
 * Routes pointer events to {@link Pointable} objects: finds the top-most one under the pointer
 * and raises down, up, click, enter, exit and drag events on it.
 *
 * @example
 * game.createObject('Pointer').addComponent(PointerSystem, {
 *   pointer,
 *   toWorld: (x, y) => camera.screenToWorld(x, y),
 * });
 */
export class PointerSystem extends Component {
  static override typeId = 'PointerSystem';

  private readonly pointer: Pointer;
  private readonly toWorld: (x: number, y: number) => { readonly x: number; readonly y: number };
  private readonly dragThreshold: number;
  private readonly presses = new Map<number, Press>();
  private readonly hovered = new Map<number, Pointable>();
  private stop: (() => void) | undefined;

  constructor(gameObject: GameObject, options: PointerSystemOptions) {
    super(gameObject);
    this.pointer = options.pointer;
    this.toWorld = options.toWorld ?? identity;
    this.dragThreshold = options.dragThreshold ?? 4;
  }

  /**
   * The top-most active {@link Pointable} at a point in the pointer's drawing space.
   */
  pick(x: number, y: number): Pointable | undefined {
    const world = this.toWorld(x, y);
    return this.pickWorld(world.x, world.y);
  }

  override awake(): void {
    this.stop = this.pointer.events.addListener(this.handle);
  }

  override onDestroy(): void {
    this.stop?.();
    this.stop = undefined;
    this.presses.clear();
    this.hovered.clear();
  }

  private pickWorld(worldX: number, worldY: number): Pointable | undefined {
    const candidates = this.game.findObjectsOfType(Pointable);
    let best: Pointable | undefined;
    for (const candidate of candidates) {
      if (!candidate.isActive || !candidate.contains(worldX, worldY)) continue;
      if (best === undefined || candidate.order >= best.order) best = candidate;
    }
    return best;
  }

  private hit(event: PointerStreamEvent, dx = 0, dy = 0): PointerHit {
    const world = this.toWorld(event.x, event.y);
    return {
      pointerId: event.pointerId,
      button: event.button,
      x: event.x,
      y: event.y,
      worldX: world.x,
      worldY: world.y,
      dx,
      dy,
    };
  }

  private readonly handle = (event: PointerStreamEvent): void => {
    if (event.type === 'down') this.onDown(event);
    else if (event.type === 'move') this.onMove(event);
    else if (event.type === 'up') this.onUp(event);
    else this.onCancel(event);
  };

  private onDown(event: PointerStreamEvent): void {
    const hit = this.hit(event);
    this.updateHover(event, hit);
    const target = this.pickWorld(hit.worldX, hit.worldY);
    if (target === undefined) return;
    this.presses.set(event.pointerId, {
      target,
      startX: event.x,
      startY: event.y,
      lastWorldX: hit.worldX,
      lastWorldY: hit.worldY,
      dragging: false,
    });
    target.pointerDown.invoke(hit);
  }

  private onMove(event: PointerStreamEvent): void {
    const hit = this.hit(event);
    this.updateHover(event, hit);
    const press = this.presses.get(event.pointerId);
    if (press === undefined) return;
    if (!press.dragging) {
      if (Math.hypot(event.x - press.startX, event.y - press.startY) < this.dragThreshold) return;
      press.dragging = true;
      press.target.dragStart.invoke(hit);
    }
    const moved = this.hit(event, hit.worldX - press.lastWorldX, hit.worldY - press.lastWorldY);
    press.lastWorldX = hit.worldX;
    press.lastWorldY = hit.worldY;
    press.target.drag.invoke(moved);
  }

  private onUp(event: PointerStreamEvent): void {
    const press = this.presses.get(event.pointerId);
    if (press === undefined) return;
    this.presses.delete(event.pointerId);
    const hit = this.hit(event);
    press.target.pointerUp.invoke(hit);
    if (press.dragging) {
      press.target.dragEnd.invoke(hit);
    } else if (this.pickWorld(hit.worldX, hit.worldY) === press.target) {
      press.target.click.invoke(hit);
    }
  }

  private onCancel(event: PointerStreamEvent): void {
    const hit = this.hit(event);
    const press = this.presses.get(event.pointerId);
    this.presses.delete(event.pointerId);
    if (press?.dragging === true) press.target.dragEnd.invoke(hit);
    const over = this.hovered.get(event.pointerId);
    this.hovered.delete(event.pointerId);
    over?.pointerExit.invoke(hit);
  }

  private updateHover(event: PointerStreamEvent, hit: PointerHit): void {
    const now = this.pickWorld(hit.worldX, hit.worldY);
    const before = this.hovered.get(event.pointerId);
    if (now === before) return;
    if (now === undefined) this.hovered.delete(event.pointerId);
    else this.hovered.set(event.pointerId, now);
    before?.pointerExit.invoke(hit);
    now?.pointerEnter.invoke(hit);
  }
}
