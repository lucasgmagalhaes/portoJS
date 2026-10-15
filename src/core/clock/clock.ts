/**
 * Injectable time source. `now()` returns milliseconds since an arbitrary epoch
 * (the Unix epoch for {@link systemClock}). Inject a {@link ManualClock} in tests
 * to make time fully deterministic.
 */
export interface Clock {
  /** Current time in milliseconds. */
  now(): number;
}

/** Clock backed by `Date.now()`. Wall-clock time, so it survives page reloads. */
export const systemClock: Clock = { now: () => Date.now() };

/**
 * Clock that only moves when told to. Intended for tests and replays.
 *
 * @example
 * const clock = new ManualClock(1000);
 * clock.advance(500);
 * clock.now(); // 1500
 */
export class ManualClock implements Clock {
  private time: number;

  /** @param start initial time in ms (default `0`). */
  constructor(start = 0) {
    this.time = start;
  }

  /** Current manual time. */
  now(): number {
    return this.time;
  }

  /** Moves time forward (or backward when negative) by `ms`. */
  advance(ms: number): void {
    this.time += ms;
  }

  /** Sets time to an absolute value. */
  set(ms: number): void {
    this.time = ms;
  }
}

/** Classification of a time sample taken by {@link TimeGuard}. */
export type TimeStatus = 'ok' | 'backward' | 'jump';

/** Result of {@link TimeGuard.sample}. */
export interface TimeSample {
  /** Milliseconds since the previous sample; never negative. */
  readonly delta: number;
  /**
   * `'ok'` normal progress, `'backward'` the clock went back (delta is `0`),
   * `'jump'` the clock leapt forward by more than `maxJumpMs` (delta is the raw gap).
   */
  readonly status: TimeStatus;
}

/** Options for {@link TimeGuard}. */
export interface TimeGuardOptions {
  /** A forward gap larger than this is reported as `'jump'`. Default `Infinity` (never). */
  readonly maxJumpMs?: number;
}

/**
 * Wraps a {@link Clock} and turns raw readings into safe deltas.
 *
 * A system clock can move backwards (NTP sync, manual change) or leap forward (sleep,
 * manual change). The guard never returns a negative delta and flags suspicious leaps
 * so callers can decide whether to trust them.
 */
export class TimeGuard {
  private last: number;
  private readonly maxJumpMs: number;

  /** @param clock time source to read from. */
  constructor(
    private readonly clock: Clock,
    options: TimeGuardOptions = {},
  ) {
    this.maxJumpMs = options.maxJumpMs ?? Infinity;
    this.last = clock.now();
  }

  /** Reads the clock and returns the sanitized time elapsed since the last sample. */
  sample(): TimeSample {
    const now = this.clock.now();
    const raw = now - this.last;
    this.last = now;
    if (raw < 0) return { delta: 0, status: 'backward' };
    if (raw > this.maxJumpMs) return { delta: raw, status: 'jump' };
    return { delta: raw, status: 'ok' };
  }

  /** Forgets history so the next sample measures from "now". */
  reset(): void {
    this.last = this.clock.now();
  }
}
