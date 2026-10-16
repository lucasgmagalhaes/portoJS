/**
 * Handle of a timer created with {@link Game.setTimeout} or {@link Game.setInterval}.
 */
export class Timer {
  private cancelled = false;

  /**
   * @internal
   */
  constructor(
    readonly callback: () => void,
    /**
     * @internal
     */
    public dueMs: number,
    /**
     * @internal
     */
    readonly intervalMs: number | undefined,
    /**
     * @internal
     */
    readonly sequence: number,
  ) {}

  /**
   * `true` once the timer was cancelled or, for a timeout, has fired.
   */
  get isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Stops the timer. Safe to call more than once, also from inside its own callback.
   */
  cancel(): void {
    this.cancelled = true;
  }
}

function byDue(a: Timer, b: Timer): number {
  return a.dueMs - b.dueMs || a.sequence - b.sequence;
}

function isActive(timer: Timer): boolean {
  return !timer.isCancelled;
}

/**
 * Timers measured in game time: they stop while the game is paused and follow `timeScale`.
 *
 * @internal
 */
export class Timers {
  private timers: Timer[] = [];
  private elapsedMs = 0;
  private sequence = 0;

  /**
   * Number of timers still waiting.
   */
  get size(): number {
    return this.timers.length;
  }

  add(callback: () => void, delayMs: number, repeat: boolean): Timer {
    if (!Number.isFinite(delayMs) || delayMs < 0 || (repeat && delayMs === 0)) {
      throw new RangeError(
        repeat
          ? 'Timers: an interval must be a finite number of ms > 0'
          : 'Timers: a delay must be a finite number of ms >= 0',
      );
    }
    const timer = new Timer(
      callback,
      this.elapsedMs + delayMs,
      repeat ? delayMs : undefined,
      this.sequence++,
    );
    this.timers.push(timer);
    return timer;
  }

  /**
   * Advances game time by `dtMs` and runs every timer that became due, in due-time order.
   */
  step(dtMs: number): void {
    this.elapsedMs += dtMs;
    for (;;) {
      this.timers = this.timers.filter(isActive);
      const next = this.earliestDue();
      if (next === undefined) return;
      if (next.intervalMs === undefined) next.cancel();
      else next.dueMs += next.intervalMs;
      next.callback();
    }
  }

  clear(): void {
    for (const timer of this.timers) timer.cancel();
    this.timers = [];
  }

  private earliestDue(): Timer | undefined {
    let earliest: Timer | undefined;
    for (const timer of this.timers) {
      if (timer.dueMs > this.elapsedMs) continue;
      if (earliest === undefined || byDue(timer, earliest) < 0) earliest = timer;
    }
    return earliest;
  }
}
