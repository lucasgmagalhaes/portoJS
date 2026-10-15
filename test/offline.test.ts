import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_OFFLINE_MS,
  forEachOfflineStep,
  resolveElapsed,
  resolveOffline,
} from '../src/core/offline/index.js';

const HOUR = 3_600_000;

describe('resolveOffline', () => {
  it('credits the whole span at full efficiency', () => {
    expect(resolveOffline(1000, 1000 + HOUR)).toEqual({
      elapsedMs: HOUR,
      appliedMs: HOUR,
      status: 'applied',
    });
  });

  it('credits nothing for zero time', () => {
    expect(resolveOffline(5000, 5000)).toEqual({ elapsedMs: 0, appliedMs: 0, status: 'none' });
  });

  it('credits nothing when the clock went backwards', () => {
    expect(resolveOffline(10_000, 4_000)).toEqual({
      elapsedMs: 0,
      appliedMs: 0,
      status: 'backward',
    });
  });

  it('truncates to maxMs and reports the real elapsed time', () => {
    const report = resolveOffline(0, 100 * HOUR, { maxMs: 8 * HOUR });
    expect(report).toEqual({ elapsedMs: 100 * HOUR, appliedMs: 8 * HOUR, status: 'capped' });
  });

  it('does not report capped when exactly at the limit', () => {
    expect(resolveElapsed(8 * HOUR, { maxMs: 8 * HOUR }).status).toBe('applied');
  });

  it('applies efficiency after the cap', () => {
    const report = resolveElapsed(10 * HOUR, { maxMs: 4 * HOUR, efficiency: 0.5 });
    expect(report.appliedMs).toBe(2 * HOUR);
    expect(report.elapsedMs).toBe(10 * HOUR);
  });

  it('supports zero efficiency and zero cap', () => {
    expect(resolveElapsed(HOUR, { efficiency: 0 }).appliedMs).toBe(0);
    expect(resolveElapsed(HOUR, { maxMs: 0 })).toEqual({
      elapsedMs: HOUR,
      appliedMs: 0,
      status: 'capped',
    });
  });

  it('supports an unlimited cap', () => {
    expect(resolveElapsed(1e12, { maxMs: Infinity }).status).toBe('applied');
  });

  it('defaults to a 24 hour cap', () => {
    const report = resolveElapsed(DEFAULT_MAX_OFFLINE_MS + 1);
    expect(report.status).toBe('capped');
    expect(report.appliedMs).toBe(DEFAULT_MAX_OFFLINE_MS);
  });

  it('treats NaN as nothing to credit', () => {
    expect(resolveElapsed(NaN).status).toBe('none');
    expect(resolveOffline(NaN, 5).appliedMs).toBe(0);
  });

  it('rejects invalid options', () => {
    expect(() => resolveElapsed(1, { efficiency: -0.1 })).toThrow(RangeError);
    expect(() => resolveElapsed(1, { efficiency: 1.1 })).toThrow(RangeError);
    expect(() => resolveElapsed(1, { efficiency: NaN })).toThrow(RangeError);
    expect(() => resolveElapsed(1, { maxMs: -1 })).toThrow(RangeError);
    expect(() => resolveElapsed(1, { maxMs: NaN })).toThrow(RangeError);
  });

  it('never credits more than the cap or more than elapsed (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e9, max: 1e12, noNaN: true }),
        fc.double({ min: 0, max: 1e11, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (raw, maxMs, efficiency) => {
          const r = resolveElapsed(raw, { maxMs, efficiency });
          expect(r.appliedMs).toBeGreaterThanOrEqual(0);
          expect(r.appliedMs).toBeLessThanOrEqual(Math.max(raw, 0));
          expect(r.appliedMs).toBeLessThanOrEqual(maxMs);
          expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });
});

describe('forEachOfflineStep', () => {
  it('covers exactly the requested time', () => {
    const steps: number[] = [];
    const n = forEachOfflineStep(10_500, (ms) => steps.push(ms));
    expect(n).toBe(steps.length);
    expect(steps.reduce((a, b) => a + b, 0)).toBeCloseTo(10_500, 6);
  });

  it('uses minStepMs for short spans', () => {
    const steps: number[] = [];
    forEachOfflineStep(3000, (ms) => steps.push(ms), { minStepMs: 1000 });
    expect(steps).toEqual([1000, 1000, 1000]);
  });

  it('bounds the number of steps for very long spans', () => {
    let count = 0;
    forEachOfflineStep(30 * 24 * HOUR, () => count++, { maxSteps: 500 });
    expect(count).toBeLessThanOrEqual(501);
  });

  it('does nothing for zero time and rejects bad input', () => {
    expect(forEachOfflineStep(0, () => expect.fail('must not run'))).toBe(0);
    expect(() => forEachOfflineStep(-1, () => undefined)).toThrow(RangeError);
    expect(() => forEachOfflineStep(Infinity, () => undefined)).toThrow(RangeError);
    expect(() => forEachOfflineStep(10, () => undefined, { minStepMs: 0 })).toThrow(RangeError);
    expect(() => forEachOfflineStep(10, () => undefined, { maxSteps: 0 })).toThrow(RangeError);
  });

  it('step lengths sum to the total (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 1e10, noNaN: true }), (total) => {
        let sum = 0;
        forEachOfflineStep(total, (ms) => (sum += ms));
        expect(Math.abs(sum - total)).toBeLessThanOrEqual(1e-6 * total);
      }),
    );
  });
});
