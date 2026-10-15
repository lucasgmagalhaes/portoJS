/** Default cap on credited offline time: 24 hours. */
export const DEFAULT_MAX_OFFLINE_MS = 24 * 60 * 60 * 1000;

/** Settings that decide how much away-time is credited. */
export interface OfflineOptions {
  /** Longest away-time credited, in ms. Default 24 hours. Use `Infinity` for no cap. */
  readonly maxMs?: number;
  /** Fraction of the away-time credited, `0..1`. Default `1`. `0.5` means "50% efficiency". */
  readonly efficiency?: number;
}

/**
 * How an away-time span was treated:
 * - `'none'` nothing to credit (zero time, or nothing elapsed)
 * - `'applied'` the whole span was credited (subject to efficiency)
 * - `'capped'` the span exceeded `maxMs` and was truncated
 * - `'backward'` the clock went back, so nothing is credited
 */
export type OfflineStatus = 'none' | 'applied' | 'capped' | 'backward';

/** Result of resolving an away-time span. */
export interface OfflineReport {
  /** Real time that passed, never negative (`0` when the clock went backwards). */
  readonly elapsedMs: number;
  /** Time actually credited after the cap and efficiency are applied. */
  readonly appliedMs: number;
  /** How the span was treated. */
  readonly status: OfflineStatus;
}

function validate(options: OfflineOptions): Required<OfflineOptions> {
  const maxMs = options.maxMs ?? DEFAULT_MAX_OFFLINE_MS;
  const efficiency = options.efficiency ?? 1;
  if (Number.isNaN(maxMs) || maxMs < 0) {
    throw new RangeError('offline: maxMs must be a number >= 0 (Infinity allowed)');
  }
  if (!Number.isFinite(efficiency) || efficiency < 0 || efficiency > 1) {
    throw new RangeError('offline: efficiency must be between 0 and 1');
  }
  return { maxMs, efficiency };
}

/**
 * Turns a raw elapsed span into the amount of time to credit.
 *
 * Edge cases: zero or non-finite spans credit nothing (`'none'`); a negative span
 * (the clock went back) credits nothing (`'backward'`); a span above `maxMs` is
 * truncated (`'capped'`); efficiency scales whatever remains.
 *
 * @throws {RangeError} if `options` are out of range.
 */
export function resolveElapsed(rawMs: number, options: OfflineOptions = {}): OfflineReport {
  const { maxMs, efficiency } = validate(options);
  if (Number.isNaN(rawMs)) return { elapsedMs: 0, appliedMs: 0, status: 'none' };
  if (rawMs < 0) return { elapsedMs: 0, appliedMs: 0, status: 'backward' };
  if (rawMs === 0) return { elapsedMs: 0, appliedMs: 0, status: 'none' };
  const capped = Math.min(rawMs, maxMs);
  return {
    elapsedMs: rawMs,
    appliedMs: capped * efficiency,
    status: rawMs > maxMs ? 'capped' : 'applied',
  };
}

/**
 * Credits the time between two clock readings, e.g. the last save and now.
 *
 * @example
 * resolveOffline(saveTime, clock.now(), { maxMs: 8 * 3600_000, efficiency: 0.5 });
 */
export function resolveOffline(
  from: number,
  to: number,
  options: OfflineOptions = {},
): OfflineReport {
  return resolveElapsed(to - from, options);
}

/** Options for {@link forEachOfflineStep}. */
export interface StepPlanOptions {
  /** Smallest step used, in ms. Default `1000`. */
  readonly minStepMs?: number;
  /** Upper bound on the number of steps. Default `1000`. */
  readonly maxSteps?: number;
}

/**
 * Splits `totalMs` into equal large steps and calls `step` for each, for systems that
 * cannot use a closed form. The step length is `max(minStepMs, totalMs / maxSteps)`,
 * so work stays bounded however long the player was away. The final step takes the
 * remainder, so the lengths always sum to exactly `totalMs`.
 *
 * @returns the number of steps taken.
 * @throws {RangeError} if `totalMs` is negative / not finite, or options are not positive.
 */
export function forEachOfflineStep(
  totalMs: number,
  step: (stepMs: number) => void,
  options: StepPlanOptions = {},
): number {
  const minStepMs = options.minStepMs ?? 1000;
  const maxSteps = options.maxSteps ?? 1000;
  if (!Number.isFinite(totalMs) || totalMs < 0) {
    throw new RangeError('forEachOfflineStep: totalMs must be a finite number >= 0');
  }
  if (!(minStepMs > 0) || !(maxSteps >= 1)) {
    throw new RangeError('forEachOfflineStep: minStepMs and maxSteps must be positive');
  }
  if (totalMs === 0) return 0;
  const size = Math.max(minStepMs, totalMs / Math.floor(maxSteps));
  const full = Math.floor(totalMs / size);
  let count = 0;
  let consumed = 0;
  for (; count < full; count++) {
    step(size);
    consumed += size;
  }
  const rest = totalMs - consumed;
  if (rest > 1e-9 * totalMs) {
    step(rest);
    count++;
  }
  return count;
}
