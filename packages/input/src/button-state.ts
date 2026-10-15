/**
 * Tracks which buttons or keys are held and which changed since the last {@link ButtonState.endFrame}.
 * Ids are plain strings, so the same class backs keyboards, pointers and gamepads.
 */
export class ButtonState {
  private readonly held = new Set<string>();
  private readonly pressedNow = new Set<string>();
  private readonly releasedNow = new Set<string>();

  /**
   * Marks `id` as pressed. Does nothing when it is already held, so key repeat is ignored.
   */
  press(id: string): void {
    if (this.held.has(id)) return;
    this.held.add(id);
    this.pressedNow.add(id);
  }

  /**
   * Marks `id` as released. Does nothing when it was not held.
   */
  release(id: string): void {
    if (!this.held.delete(id)) return;
    this.releasedNow.add(id);
  }

  /**
   * Releases everything, for example when the window loses focus.
   */
  releaseAll(): void {
    for (const id of [...this.held]) this.release(id);
  }

  /**
   * Whether `id` is held right now.
   */
  isDown(id: string): boolean {
    return this.held.has(id);
  }

  /**
   * Whether `id` went down since the last {@link ButtonState.endFrame}.
   */
  wasPressed(id: string): boolean {
    return this.pressedNow.has(id);
  }

  /**
   * Whether `id` went up since the last {@link ButtonState.endFrame}.
   */
  wasReleased(id: string): boolean {
    return this.releasedNow.has(id);
  }

  /**
   * Ids held right now.
   */
  get down(): readonly string[] {
    return [...this.held];
  }

  /**
   * Forgets the pressed and released edges. Held buttons stay held.
   */
  endFrame(): void {
    this.pressedNow.clear();
    this.releasedNow.clear();
  }
}
