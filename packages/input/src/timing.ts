/**
 * Remembers a button press for a short while, so a jump pressed just before landing still
 * happens. Times are in seconds of game time; use the same clock for every call.
 *
 * @example
 * const jump = new InputBuffer(0.15);
 * if (input.wasPressed('jump')) jump.press(time);
 * if (onGround && jump.consume(time)) player.jump();
 */
export class InputBuffer {
  private pressedAt = -Infinity;

  /**
   * @param windowSeconds how long a press stays valid.
   * @throws {RangeError} if the window is negative or not a number.
   */
  constructor(readonly windowSeconds: number) {
    if (!(windowSeconds >= 0)) throw new RangeError('InputBuffer: the window must be >= 0');
  }

  /**
   * Records a press at `time`.
   */
  press(time: number): void {
    this.pressedAt = time;
  }

  /**
   * Whether a press is still valid at `time`, without using it up.
   */
  has(time: number): boolean {
    return time - this.pressedAt <= this.windowSeconds;
  }

  /**
   * Uses up a valid press.
   *
   * @returns `true` if there was one.
   */
  consume(time: number): boolean {
    if (!this.has(time)) return false;
    this.pressedAt = -Infinity;
    return true;
  }

  /**
   * Forgets the press.
   */
  clear(): void {
    this.pressedAt = -Infinity;
  }
}

/**
 * Lets the player still jump for a short while after walking off a ledge ("coyote time"). Call
 * {@link CoyoteTime.touch} every step the player is on the ground.
 *
 * @example
 * const coyote = new CoyoteTime(0.1);
 * if (onGround) coyote.touch(time);
 * if (input.wasPressed('jump') && coyote.allows(time)) player.jump();
 */
export class CoyoteTime {
  private lastGrounded = -Infinity;

  /**
   * @param windowSeconds how long after leaving the ground jumping is still allowed.
   * @throws {RangeError} if the window is negative or not a number.
   */
  constructor(readonly windowSeconds: number) {
    if (!(windowSeconds >= 0)) throw new RangeError('CoyoteTime: the window must be >= 0');
  }

  /**
   * Records that the player is on the ground at `time`.
   */
  touch(time: number): void {
    this.lastGrounded = time;
  }

  /**
   * Whether the player may still jump at `time`.
   */
  allows(time: number): boolean {
    return time - this.lastGrounded <= this.windowSeconds;
  }

  /**
   * Ends the grace period, for example right after a jump so it cannot be repeated in the air.
   */
  spend(): void {
    this.lastGrounded = -Infinity;
  }
}
