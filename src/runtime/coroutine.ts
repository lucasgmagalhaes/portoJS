import type { Component } from './component.js';

/**
 * Something a coroutine can `yield` to wait. Subclass it for custom waits.
 */
export abstract class YieldInstruction {
  /**
   * Called once per fixed step while a coroutine waits on this instruction.
   *
   * @param deltaTime step length in seconds.
   * @returns `true` when the coroutine may continue.
   */
  abstract isDone(deltaTime: number): boolean;
}

/**
 * Waits for an amount of game time, in seconds (the fixed step is the resolution).
 *
 * @example
 * yield new WaitForSeconds(2);
 */
export class WaitForSeconds extends YieldInstruction {
  private remaining: number;

  /**
   * @param seconds time to wait, in game seconds.
   * @throws {RangeError} if `seconds` is negative or not a number.
   */
  constructor(seconds: number) {
    super();
    if (!(seconds >= 0)) throw new RangeError('WaitForSeconds: seconds must be >= 0');
    this.remaining = seconds;
  }

  override isDone(deltaTime: number): boolean {
    this.remaining -= deltaTime;
    return this.remaining <= 1e-9;
  }
}

/**
 * Waits until `condition` returns `true`. It is checked once per step.
 */
export class WaitUntil extends YieldInstruction {
  /**
   * @param condition predicate checked every step.
   */
  constructor(private readonly condition: () => boolean) {
    super();
  }

  override isDone(): boolean {
    return this.condition();
  }
}

/**
 * Waits while `condition` returns `true`. It is checked once per step.
 */
export class WaitWhile extends YieldInstruction {
  /**
   * @param condition predicate checked every step.
   */
  constructor(private readonly condition: () => boolean) {
    super();
  }

  override isDone(): boolean {
    return !this.condition();
  }
}

/**
 * The value a coroutine generator yields: an instruction, another {@link Coroutine} to wait for,
 * or `undefined` to continue on the next step.
 */
export type CoroutineYield = YieldInstruction | undefined;

/**
 * A running coroutine: a generator resumed by the game, like Unity's coroutines. Start one with
 * {@link Component.startCoroutine}. It runs in game time (fixed steps), pauses while its
 * component is inactive, and ends when the component is destroyed. Coroutines are not saved and
 * do not advance during offline progress.
 *
 * It is also a {@link YieldInstruction}: yielding a coroutine waits until it finishes.
 */
export class Coroutine extends YieldInstruction {
  private waiting: YieldInstruction | undefined;
  private runningFlag = true;

  /**
   * @internal Use {@link Component.startCoroutine}.
   * @param owner component that owns the coroutine.
   * @param routine the generator to run.
   */
  constructor(
    readonly owner: Component,
    private readonly routine: Iterator<CoroutineYield>,
  ) {
    super();
    this.resume();
  }

  /**
   * `true` until the generator finishes or the coroutine is stopped.
   */
  get isRunning(): boolean {
    return this.runningFlag;
  }

  /**
   * Stops the coroutine. No-op when already finished.
   */
  stop(): void {
    if (!this.runningFlag) return;
    this.runningFlag = false;
    this.waiting = undefined;
    this.routine.return?.();
  }

  override isDone(): boolean {
    return !this.runningFlag;
  }

  /**
   * @internal Advances the coroutine by one fixed step.
   * @param deltaTime step length in seconds.
   */
  step(deltaTime: number): void {
    if (!this.runningFlag) return;
    if (this.owner.isDestroyed) {
      this.stop();
      return;
    }
    if (!this.owner.isActive) return;
    if (this.waiting !== undefined && !this.waiting.isDone(deltaTime)) return;
    this.resume();
  }

  private resume(): void {
    this.waiting = undefined;
    try {
      const result = this.routine.next();
      if (result.done === true) this.runningFlag = false;
      else this.waiting = result.value;
    } catch (error) {
      this.runningFlag = false;
      throw error;
    }
  }
}
