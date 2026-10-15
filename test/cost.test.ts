import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BigNum } from '../src/core/bignum/index.js';
import { compileCost } from '../src/mechanics/resources/cost.js';

const n = (v: number | string): BigNum => BigNum.from(v);

/**
 * Reference: add up unit prices one by one.
 */
function brute(unit: (owned: BigNum) => BigNum, owned: number, count: number): BigNum {
  let sum: BigNum = BigNum.ZERO;
  for (let i = 0; i < count; i++) sum = sum.add(unit(n(owned + i)));
  return sum;
}

const close = (a: BigNum, b: BigNum, tolerance = 1e-9): boolean => {
  if (a.eq(b)) return true;
  return a.sub(b).abs().div(BigNum.max(a.abs(), b.abs())).lt(tolerance);
};

describe('exponential cost', () => {
  const cost = compileCost({ base: 10, growth: 1.15 });

  it('prices single units as base × growth^owned', () => {
    expect(cost.unit(n(0)).toNumber()).toBeCloseTo(10, 12);
    expect(cost.unit(n(1)).toNumber()).toBeCloseTo(11.5, 12);
    expect(cost.unit(n(10)).toNumber()).toBeCloseTo(10 * 1.15 ** 10, 9);
  });

  it('sums batches in closed form', () => {
    expect(close(cost.total(n(0), n(100)), brute(cost.unit, 0, 100))).toBe(true);
    expect(close(cost.total(n(37), n(10)), brute(cost.unit, 37, 10))).toBe(true);
    expect(cost.total(n(5), n(0)).isZero()).toBe(true);
    expect(cost.total(n(5), n(-3)).isZero()).toBe(true);
  });

  it('finds the max affordable amount', () => {
    expect(cost.max(n(0), n(9.99)).toNumber()).toBe(0);
    expect(cost.max(n(0), n(10)).toNumber()).toBe(1);
    const budget = n(5000);
    const k = cost.max(n(3), budget);
    expect(cost.total(n(3), k).lte(budget)).toBe(true);
    expect(cost.total(n(3), k.add(1)).gt(budget)).toBe(true);
  });

  it('handles enormous budgets without iterating', () => {
    const k = cost.max(n(0), n('1e300'));
    expect(k.gt(1000)).toBe(true);
    expect(cost.total(n(0), k).lte(n('1e300'))).toBe(true);
  });

  it('handles growth of exactly 1 (flat price)', () => {
    const flat = compileCost({ base: 5, growth: 1 });
    expect(flat.total(n(100), n(4)).toNumber()).toBe(20);
    expect(flat.max(n(0), n(24)).toNumber()).toBe(4);
  });

  it('accepts string and BigNum parameters', () => {
    const big = compileCost({ base: '1e50', growth: '2' });
    expect(big.unit(n(3)).toNumber()).toBeCloseTo(8e50, -40);
  });

  it('rejects invalid parameters', () => {
    expect(() => compileCost({ base: 0, growth: 2 })).toThrow(RangeError);
    expect(() => compileCost({ base: -1, growth: 2 })).toThrow(RangeError);
    expect(() => compileCost({ base: 1, growth: 0.9 })).toThrow(RangeError);
  });

  it('max and total agree with brute force (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 1000, noNaN: true }),
        fc.double({ min: 1.001, max: 3, noNaN: true }),
        fc.integer({ min: 0, max: 60 }),
        fc.double({ min: 1, max: 1e9, noNaN: true }),
        (base, growth, owned, budgetValue) => {
          const c = compileCost({ base, growth });
          const budget = n(budgetValue);
          const k = c.max(n(owned), budget).toNumber();
          let affordable = 0;
          let spent: BigNum = BigNum.ZERO;
          while (affordable < 5000) {
            const next = spent.add(c.unit(n(owned + affordable)));
            if (next.gt(budget)) break;
            spent = next;
            affordable++;
          }
          if (affordable < 5000) expect(k).toBe(affordable);
          else expect(k).toBeGreaterThanOrEqual(5000);
        },
      ),
    );
  });
});

describe('linear cost', () => {
  const cost = compileCost({ type: 'linear', base: 10, increment: 5 });

  it('prices units as base + increment × owned', () => {
    expect(cost.unit(n(0)).toNumber()).toBe(10);
    expect(cost.unit(n(4)).toNumber()).toBe(30);
  });

  it('sums arithmetic series', () => {
    expect(cost.total(n(0), n(4)).toNumber()).toBeCloseTo(70, 12);
    expect(close(cost.total(n(7), n(50)), brute(cost.unit, 7, 50))).toBe(true);
  });

  it('finds the max affordable amount', () => {
    expect(cost.max(n(0), n(70)).toNumber()).toBe(4);
    expect(cost.max(n(0), n(69.9)).toNumber()).toBe(3);
    expect(cost.max(n(0), n(9)).toNumber()).toBe(0);
  });

  it('works with a zero increment', () => {
    const flat = compileCost({ type: 'linear', base: 4, increment: 0 });
    expect(flat.max(n(10), n(17)).toNumber()).toBe(4);
    expect(flat.total(n(10), n(3)).toNumber()).toBe(12);
  });

  it('copes with very large budgets (limited to double precision)', () => {
    const budget = n('1e40');
    const k = cost.max(n(0), budget);
    expect(k.gt('1e19')).toBe(true);
    expect(close(cost.total(n(0), k), budget, 1e-9)).toBe(true);
  });

  it('rejects invalid parameters', () => {
    expect(() => compileCost({ type: 'linear', base: 0, increment: 1 })).toThrow(RangeError);
    expect(() => compileCost({ type: 'linear', base: 1, increment: -1 })).toThrow(RangeError);
  });

  it('max is the exact boundary (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 50, noNaN: true }),
        fc.integer({ min: 0, max: 500 }),
        fc.double({ min: 1, max: 1e8, noNaN: true }),
        (base, increment, owned, budgetValue) => {
          const c = compileCost({ type: 'linear', base, increment });
          const budget = n(budgetValue);
          const k = c.max(n(owned), budget);
          expect(c.total(n(owned), k).lte(budget)).toBe(true);
          expect(c.total(n(owned), k.add(1)).gt(budget)).toBe(true);
        },
      ),
    );
  });
});

describe('custom cost', () => {
  it('iterates when no closed form is given', () => {
    const cost = compileCost({ type: 'custom', cost: (owned) => owned.add(1).pow(2) });
    expect(cost.total(n(0), n(3)).toNumber()).toBe(14);
    expect(cost.max(n(0), n(14)).toNumber()).toBe(3);
    expect(cost.max(n(0), n(13)).toNumber()).toBe(2);
    expect(cost.unit(n(2)).toNumber()).toBe(9);
  });

  it('uses supplied closed forms and still verifies the boundary', () => {
    const cost = compileCost({
      type: 'custom',
      cost: () => 3,
      sum: (_owned, count) => count.mul(3),
      max: (_owned, budget) => budget.div(3).add(2),
    });
    expect(cost.max(n(0), n(10)).toNumber()).toBe(3);
    expect(cost.total(n(0), n(4)).toNumber()).toBe(12);
  });

  it('refuses to brute-force enormous batches', () => {
    const cost = compileCost({ type: 'custom', cost: () => 1 });
    expect(() => cost.total(n(0), n(5_000_000))).toThrow(RangeError);
  });

  it('caps iteration for max without a closed form', () => {
    const cost = compileCost({ type: 'custom', cost: () => 1 });
    expect(cost.max(n(0), n('1e12')).toNumber()).toBe(100_000);
  });
});
