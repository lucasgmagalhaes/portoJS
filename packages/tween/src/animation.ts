import { WaitUntil } from '@portojs/runtime';

/**
 * Base of everything a {@link Tweens} manager can play: a tween, a timeline or a callback.
 * It is a function of elapsed time, so it can be played with `update`, jumped with `seek`,
 * paused and killed.
 */
export abstract class Animation {
  /**
   * Called every time the animation changed, with progress from `0` to `1` of the whole run.
   */
  onUpdate: ((progress: number) => void) | undefined;
  /**
   * Called once when the animation reaches its end. Not called when it is killed.
   */
  onComplete: (() => void) | undefined;

  protected elapsedSeconds = 0;
  private pausedFlag = false;
  private completedFlag = false;
  private killedFlag = false;
  private promise: Promise<boolean> | undefined;
  private resolvePromise: ((completed: boolean) => void) | undefined;

  private readonly captureResolver = (resolve: (completed: boolean) => void): void => {
    this.resolvePromise = resolve;
  };

  private readonly doneCheck = (): boolean => this.completedFlag || this.killedFlag;

  /**
   * Total length in seconds including delay and repeats. `Infinity` for an endless loop.
   */
  abstract get duration(): number;

  /**
   * Applies the state for the current {@link Animation.elapsed} time.
   */
  protected abstract apply(): void;

  /**
   * Seconds played so far.
   */
  get elapsed(): number {
    return this.elapsedSeconds;
  }

  /**
   * `true` while paused.
   */
  get isPaused(): boolean {
    return this.pausedFlag;
  }

  /**
   * `true` once it reached its end.
   */
  get isComplete(): boolean {
    return this.completedFlag;
  }

  /**
   * `true` once it was killed.
   */
  get isKilled(): boolean {
    return this.killedFlag;
  }

  /**
   * `true` once it completed or was killed: nothing more will happen.
   */
  get isFinished(): boolean {
    return this.completedFlag || this.killedFlag;
  }

  /**
   * A promise that resolves with `true` when the animation completes, or `false` when it is
   * killed.
   */
  get finished(): Promise<boolean> {
    if (this.promise === undefined) {
      if (this.completedFlag) this.promise = Promise.resolve(true);
      else if (this.killedFlag) this.promise = Promise.resolve(false);
      else this.promise = new Promise(this.captureResolver);
    }
    return this.promise;
  }

  /**
   * An instruction a coroutine can `yield` to wait for this animation to finish.
   *
   * @example
   * yield tweens.to(door, { y: 0 }, { duration: 1 }).untilFinished();
   */
  untilFinished(): WaitUntil {
    return new WaitUntil(this.doneCheck);
  }

  /**
   * Plays `deltaSeconds` forward. Does nothing while paused or finished.
   */
  update(deltaSeconds: number): void {
    if (this.pausedFlag || this.isFinished) return;
    this.elapsedSeconds += deltaSeconds;
    this.step();
  }

  /**
   * Jumps to `seconds` from the start and applies the state there. Callbacks of a completed run
   * fire only once.
   *
   * @throws {RangeError} if `seconds` is negative or not a number.
   */
  seek(seconds: number): void {
    if (!(seconds >= 0)) throw new RangeError('seek: seconds must be >= 0');
    if (this.isFinished) return;
    this.elapsedSeconds = seconds;
    this.step();
  }

  /**
   * Jumps to the end, applying the final state.
   *
   * @throws {RangeError} when the animation never ends.
   */
  complete(): void {
    if (!Number.isFinite(this.duration)) {
      throw new RangeError('complete: an endless animation has no end to jump to');
    }
    this.seek(this.duration);
  }

  pause(): void {
    this.pausedFlag = true;
  }

  resume(): void {
    this.pausedFlag = false;
  }

  /**
   * Stops it where it is, without applying a final state or calling `onComplete`.
   */
  kill(): void {
    if (this.isFinished) return;
    this.killedFlag = true;
    this.resolvePromise?.(false);
  }

  private step(): void {
    this.apply();
    const total = this.duration;
    this.onUpdate?.(total === 0 ? 1 : Math.min(1, this.elapsedSeconds / total));
    if (this.elapsedSeconds >= total) {
      this.completedFlag = true;
      this.onComplete?.();
      this.resolvePromise?.(true);
    }
  }
}
