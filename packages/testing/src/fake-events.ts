/**
 * An event target to give to `Keyboard`, `Pointer` and friends in tests, with helpers that fire
 * the events those classes listen to.
 *
 * @example
 * const target = new FakeEventTarget();
 * const pointer = new Pointer(target);
 * target.pointerDown({ x: 10, y: 20 });
 * expect(pointer.wasPressed('Button0')).toBe(true);
 */
export class FakeEventTarget extends EventTarget {
  /**
   * Drawing-buffer size, so a `Pointer` converts client coordinates like it does on a canvas.
   * Left undefined, client coordinates are used as they are.
   */
  width?: number;
  height?: number;

  /**
   * Fires any event with the given fields.
   */
  fire(type: string, fields: Record<string, unknown> = {}): void {
    this.dispatchEvent(Object.assign(new Event(type), fields));
  }

  /**
   * A key goes down. `code` is the physical key, such as `KeyA` or `Space`.
   */
  keyDown(code: string): void {
    this.fire('keydown', { code, preventDefault: noop });
  }

  /**
   * A key comes up.
   */
  keyUp(code: string): void {
    this.fire('keyup', { code, preventDefault: noop });
  }

  /**
   * A pointer goes down at `(x, y)`.
   */
  pointerDown(at: { x: number; y: number; id?: number; button?: number }): void {
    this.pointer('pointerdown', at);
  }

  /**
   * A pointer moves to `(x, y)`.
   */
  pointerMove(at: { x: number; y: number; id?: number }): void {
    this.pointer('pointermove', at);
  }

  /**
   * A pointer comes up at `(x, y)`.
   */
  pointerUp(at: { x: number; y: number; id?: number; button?: number }): void {
    this.pointer('pointerup', at);
  }

  /**
   * A pointer press and release at the same place: a click or a tap.
   */
  click(at: { x: number; y: number; id?: number }): void {
    this.pointerDown(at);
    this.pointerUp(at);
  }

  /**
   * The mouse wheel turns; positive scrolls down.
   */
  wheel(deltaY: number): void {
    this.fire('wheel', { deltaY });
  }

  private pointer(type: string, at: { x: number; y: number; id?: number; button?: number }): void {
    this.fire(type, {
      pointerId: at.id ?? 1,
      button: at.button ?? 0,
      clientX: at.x,
      clientY: at.y,
    });
  }
}

function noop(): void {
  return;
}
