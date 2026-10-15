import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BigNum } from '@portojs/core';
import { solveFlows } from '../src/flows.ts';
import type { FlowSource } from '../src/flows.ts';

const n = (v: number | string): BigNum => BigNum.from(v);
const toResource = (initial: number, coefficient: number, index = 0): FlowSource => ({
  initial: n(initial),
  coefficient: n(coefficient),
  target: { kind: 'resource', index },
});
const toGenerator = (initial: number, coefficient: number, index: number): FlowSource => ({
  initial: n(initial),
  coefficient: n(coefficient),
  target: { kind: 'generator', index },
});

describe('solveFlows', () => {
  it('is linear for a generator feeding a resource', () => {
    const result = solveFlows([toResource(10, 2)], 1, 5);
    expect(result?.gains[0]?.toNumber()).toBeCloseTo(100, 9);
    expect(result?.counts[0]?.toNumber()).toBe(10);
  });

  it('is quadratic for a two-tier chain', () => {
    const result = solveFlows([toGenerator(1, 3, 1), toResource(2, 4)], 1, 10);
    expect(result?.counts[1]?.toNumber()).toBeCloseTo(32, 9);
    expect(result?.gains[0]?.toNumber()).toBeCloseTo(4 * (20 + 150), 9);
  });

  it('supports several sources and resources', () => {
    const result = solveFlows(
      [toResource(1, 1, 0), toResource(2, 1, 1), toResource(3, 1, 0)],
      2,
      2,
    );
    expect(result?.gains[0]?.toNumber()).toBeCloseTo(8, 9);
    expect(result?.gains[1]?.toNumber()).toBeCloseTo(4, 9);
  });

  it('returns zero gains for zero time and for no sources', () => {
    expect(solveFlows([toResource(5, 5)], 1, 0)?.gains[0]?.isZero()).toBe(true);
    expect(solveFlows([], 2, 100)?.gains.map((g) => g.isZero())).toEqual([true, true]);
  });

  it('reports no closed form for feedback cycles', () => {
    expect(solveFlows([toGenerator(1, 1, 1), toGenerator(1, 1, 0)], 1, 10)).toBeUndefined();
    expect(solveFlows([toGenerator(1, 1, 0)], 1, 10)).toBeUndefined();
  });

  it('reports no closed form for chains longer than the limit', () => {
    const chain: FlowSource[] = Array.from({ length: 10 }, (_, i) =>
      i < 9 ? toGenerator(1, 1, i + 1) : toResource(1, 1),
    );
    expect(solveFlows(chain, 1, 1, 5)).toBeUndefined();
    expect(solveFlows(chain, 1, 1, 64)).toBeDefined();
  });

  it('stays exact for astronomically long spans', () => {
    const result = solveFlows([toResource(1, 1)], 1, 1e15);
    expect(result?.gains[0]?.toNumber()).toBeCloseTo(1e15, 0);
  });

  it('rejects invalid input', () => {
    expect(() => solveFlows([], 0, -1)).toThrow(RangeError);
    expect(() => solveFlows([], 0, Infinity)).toThrow(RangeError);
    expect(() => solveFlows([toResource(1, 1, 3)], 1, 1)).toThrow(RangeError);
    expect(() => solveFlows([toGenerator(1, 1, 5)], 1, 1)).toThrow(RangeError);
  });

  it('matches a fine-grained numeric simulation on random chains (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.double({ min: 0, max: 20, noNaN: true }),
            fc.double({ min: 0, max: 2, noNaN: true }),
          ),
          { minLength: 1, maxLength: 4 },
        ),
        fc.double({ min: 0.1, max: 5, noNaN: true }),
        (tiers, seconds) => {
          const sources = tiers.map(([initial, rate], i) =>
            i < tiers.length - 1 ? toGenerator(initial, rate, i + 1) : toResource(initial, rate),
          );
          const exact = solveFlows(sources, 1, seconds);
          expect(exact).toBeDefined();
          const steps = 20_000;
          const dt = seconds / steps;
          const c = tiers.map(([initial]) => initial);
          let gain = 0;
          for (let s = 0; s < steps; s++) {
            const rates = tiers.map(([, rate], i) => rate * (c[i] as number));
            const mid = c.map((v, i) => (i > 0 ? v + (rates[i - 1] as number) * dt * 0.5 : v));
            const midRates = tiers.map(([, rate], i) => rate * (mid[i] as number));
            for (let i = 1; i < c.length; i++) {
              c[i] = (c[i] as number) + (midRates[i - 1] as number) * dt;
            }
            gain += (midRates[midRates.length - 1] as number) * dt;
          }
          const got = exact?.gains[0]?.toNumber() ?? NaN;
          expect(Math.abs(got - gain)).toBeLessThanOrEqual(1e-4 * Math.max(1, Math.abs(got)));
        },
      ),
      { numRuns: 50 },
    );
  });
});
