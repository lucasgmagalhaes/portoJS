/**
 * Game time, like Unity's `Time`. Everything is measured in the fixed steps the game runs.
 *
 * Seconds are used for durations (`fixedDeltaTime`, `time`), matching how rates are written.
 */
export class Time {
  private elapsedSteps = 0;
  private scale = 1;
  private scaledSeconds = 0;

  /**
   * @param fixedDeltaTime length of one fixed step, in seconds.
   */
  constructor(readonly fixedDeltaTime: number) {}

  /**
   * How fast game time runs: `1` is normal, `0.5` is slow motion, `0` stops it. Never negative.
   *
   * @throws {RangeError} when set to a negative or non-finite number.
   */
  get timeScale(): number {
    return this.scale;
  }

  set timeScale(value: number) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError('Time: timeScale must be a finite number >= 0');
    }
    this.scale = value;
  }

  /**
   * The length of the step being simulated, scaled by {@link Time.timeScale}. This is what
   * `fixedUpdate` receives.
   */
  get deltaTime(): number {
    return this.fixedDeltaTime * this.scale;
  }

  /**
   * The length of one step in seconds, ignoring {@link Time.timeScale}.
   */
  get unscaledDeltaTime(): number {
    return this.fixedDeltaTime;
  }

  /**
   * Seconds of game time that flowed, which stops while paused and follows {@link Time.timeScale}.
   */
  get scaledTime(): number {
    return this.scaledSeconds;
  }

  /**
   * Fixed steps simulated so far.
   */
  get tickCount(): number {
    return this.elapsedSteps;
  }

  /**
   * Seconds of game time simulated through fixed steps (away-time is not included).
   */
  get time(): number {
    return this.elapsedSteps * this.fixedDeltaTime;
  }

  /**
   * Alias of {@link Time.time}.
   */
  get fixedTime(): number {
    return this.time;
  }

  /**
   * Seconds of real time the last frame took, scaled by {@link Time.timeScale} and `0` while the
   * game is paused. This is what `update` and `lateUpdate` receive.
   */
  frameDeltaTime = 0;

  /**
   * Seconds of real time the last frame took, ignoring {@link Time.timeScale} and pause.
   */
  unscaledFrameDeltaTime = 0;

  /**
   * Records one more fixed step. Called by the game; not meant for user code.
   */
  advance(): void {
    this.elapsedSteps += 1;
    this.scaledSeconds += this.deltaTime;
  }
}
