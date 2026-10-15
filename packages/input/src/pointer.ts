import { ButtonState } from './button-state.js';

/**
 * A position in the target's drawing space.
 */
export interface PointerPosition {
  readonly x: number;
  readonly y: number;
}

/**
 * The element pointer events come from. A canvas works: its drawing-buffer size is used to
 * convert CSS pixels to canvas pixels.
 */
export type PointerTarget = EventTarget & {
  readonly width?: number;
  readonly height?: number;
  getBoundingClientRect?(): {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
};

interface PointerEventLike {
  readonly pointerId: number;
  readonly button: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly deltaY?: number;
}

/**
 * Mouse, touch and pen input through Pointer Events. Positions are in the target's drawing
 * space (canvas pixels for a canvas, CSS pixels otherwise), so they can go straight into
 * `Camera2D.screenToWorld`.
 *
 * Button ids are `Button0` (left, touch contact or pen tip), `Button1` (middle) and `Button2`
 * (right).
 *
 * @example
 * const pointer = new Pointer(canvas);
 * if (pointer.wasPressed('Button0')) shoot(pointer.x, pointer.y);
 */
export class Pointer {
  /**
   * The underlying button state.
   */
  readonly state = new ButtonState();
  /**
   * Last known x position.
   */
  x = 0;
  /**
   * Last known y position.
   */
  y = 0;
  /**
   * Wheel movement since the last step (positive scrolls down).
   */
  wheel = 0;

  private readonly active = new Map<number, PointerPosition>();

  private readonly onDown = (event: Event): void => {
    const pointer = event as unknown as PointerEventLike;
    const at = this.locate(pointer);
    this.active.set(pointer.pointerId, at);
    this.x = at.x;
    this.y = at.y;
    this.state.press(`Button${pointer.button}`);
  };

  private readonly onUp = (event: Event): void => {
    const pointer = event as unknown as PointerEventLike;
    const at = this.locate(pointer);
    this.active.delete(pointer.pointerId);
    this.x = at.x;
    this.y = at.y;
    this.state.release(`Button${pointer.button}`);
  };

  private readonly onCancel = (event: Event): void => {
    const pointer = event as unknown as PointerEventLike;
    this.active.delete(pointer.pointerId);
    this.state.releaseAll();
  };

  private readonly onMove = (event: Event): void => {
    const pointer = event as unknown as PointerEventLike;
    const at = this.locate(pointer);
    this.x = at.x;
    this.y = at.y;
    if (this.active.has(pointer.pointerId)) this.active.set(pointer.pointerId, at);
  };

  private readonly onWheel = (event: Event): void => {
    this.wheel += (event as unknown as PointerEventLike).deltaY ?? 0;
  };

  /**
   * @param target the element to listen on.
   */
  constructor(private readonly target: PointerTarget) {
    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointerup', this.onUp);
    target.addEventListener('pointercancel', this.onCancel);
    target.addEventListener('pointermove', this.onMove);
    target.addEventListener('wheel', this.onWheel);
  }

  /**
   * Whether the button is held.
   */
  isDown(button: string): boolean {
    return this.state.isDown(button);
  }

  /**
   * Whether the button went down since the last step.
   */
  wasPressed(button: string): boolean {
    return this.state.wasPressed(button);
  }

  /**
   * Whether the button went up since the last step.
   */
  wasReleased(button: string): boolean {
    return this.state.wasReleased(button);
  }

  /**
   * Pointers currently in contact (several fingers, for example), by pointer id.
   */
  get touches(): ReadonlyMap<number, PointerPosition> {
    return this.active;
  }

  /**
   * Forgets the per-step edges and the wheel delta.
   */
  endFrame(): void {
    this.state.endFrame();
    this.wheel = 0;
  }

  /**
   * Stops listening.
   */
  dispose(): void {
    this.target.removeEventListener('pointerdown', this.onDown);
    this.target.removeEventListener('pointerup', this.onUp);
    this.target.removeEventListener('pointercancel', this.onCancel);
    this.target.removeEventListener('pointermove', this.onMove);
    this.target.removeEventListener('wheel', this.onWheel);
    this.state.releaseAll();
    this.active.clear();
  }

  private locate(event: PointerEventLike): PointerPosition {
    const rect = this.target.getBoundingClientRect?.();
    if (rect === undefined) return { x: event.clientX, y: event.clientY };
    const scaleX =
      this.target.width !== undefined && rect.width > 0 ? this.target.width / rect.width : 1;
    const scaleY =
      this.target.height !== undefined && rect.height > 0 ? this.target.height / rect.height : 1;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }
}
