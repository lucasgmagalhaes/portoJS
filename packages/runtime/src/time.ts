/**
 * Game time, like Unity's `Time`. Everything is measured in the fixed steps the game runs.
 *
 * Seconds are used for durations (`fixedDeltaTime`, `time`), matching how rates are written.
 */
export class Time {
  private elapsedSteps = 0;

  /**
   * @param fixedDeltaTime length of one fixed step, in seconds.
   */
  constructor(readonly fixedDeltaTime: number) {}

  /**
   * Alias of {@link Time.fixedDeltaTime}: the length of the step being simulated.
   */
  get deltaTime(): number {
    return this.fixedDeltaTime;
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
   * Records one more fixed step. Called by the game; not meant for user code.
   */
  advance(): void {
    this.elapsedSteps += 1;
  }
}
