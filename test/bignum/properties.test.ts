import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BigNum } from '../../src/core/bignum/index.js';

/** Non-zero doubles with magnitude in [1e-50, 1e50], either sign. */
const num = fc
  .tuple(fc.double({ min: 1e-50, max: 1e50, noNaN: true }), fc.boolean())
  .map(([x, negative]) => (negative ? -x : x));

/** Arbitrary BigNum well beyond double range. */
const huge = fc
  .tuple(
    fc.double({ min: 1, max: 9.999999, noNaN: true }),
    fc.integer({ min: -100000, max: 100000 }),
    fc.boolean(),
  )
  .map(([m, e, negative]) => BigNum.fromParts(negative ? -m : m, e));

const relClose = (actual: number, expected: number, tolerance = 1e-12): boolean =>
  Math.abs(actual - expected) <= tolerance * Math.max(Math.abs(expected), Number.MIN_VALUE);

describe('BigNum properties', () => {
  it('matches double arithmetic for add/sub within tolerance of the larger operand', () => {
    fc.assert(
      fc.property(num, num, (a, b) => {
        const scale = Math.max(Math.abs(a), Math.abs(b));
        const sum = BigNum.from(a).add(b).toNumber();
        const diff = BigNum.from(a).sub(b).toNumber();
        expect(Math.abs(sum - (a + b))).toBeLessThanOrEqual(1e-12 * scale);
        expect(Math.abs(diff - (a - b))).toBeLessThanOrEqual(1e-12 * scale);
      }),
    );
  });

  it('matches double arithmetic for mul/div', () => {
    fc.assert(
      fc.property(num, num, (a, b) => {
        expect(relClose(BigNum.from(a).mul(b).toNumber(), a * b)).toBe(true);
        expect(relClose(BigNum.from(a).div(b).toNumber(), a / b)).toBe(true);
      }),
    );
  });

  it('add is commutative and zero is its identity', () => {
    fc.assert(
      fc.property(huge, huge, (a, b) => {
        expect(a.add(b).eq(b.add(a))).toBe(true);
        expect(a.add(0).eq(a)).toBe(true);
      }),
    );
  });

  it('mul is commutative and one is its identity', () => {
    fc.assert(
      fc.property(huge, huge, (a, b) => {
        expect(a.mul(b).eq(b.mul(a))).toBe(true);
        expect(a.mul(1).eq(a)).toBe(true);
      }),
    );
  });

  it('negation is an involution and x - x is zero', () => {
    fc.assert(
      fc.property(huge, (a) => {
        expect(a.neg().neg().eq(a)).toBe(true);
        expect(a.sub(a).isZero()).toBe(true);
      }),
    );
  });

  it('(a * b) / b recovers a within relative 1e-14', () => {
    fc.assert(
      fc.property(huge, huge, (a, b) => {
        fc.pre(!b.isZero());
        const back = a.mul(b).div(b);
        const error = back.sub(a).abs().div(a.abs());
        expect(error.lt(1e-14)).toBe(true);
      }),
    );
  });

  it('cmp agrees with number ordering and is antisymmetric', () => {
    fc.assert(
      fc.property(num, num, (a, b) => {
        fc.pre(!relClose(a, b, 1e-15) || a === b);
        const expected = a < b ? -1 : a > b ? 1 : 0;
        expect(BigNum.from(a).cmp(b)).toBe(expected);
        expect(BigNum.from(b).cmp(a)).toBe(expected === 0 ? 0 : -expected);
      }),
    );
  });

  it('cmp is transitive on huge values', () => {
    fc.assert(
      fc.property(huge, huge, huge, (a, b, c) => {
        if (a.lte(b) && b.lte(c)) expect(a.lte(c)).toBe(true);
      }),
    );
  });

  it('JSON round-trips exactly', () => {
    fc.assert(
      fc.property(huge, (a) => {
        const restored = BigNum.fromJSON(JSON.parse(JSON.stringify(a)));
        expect(restored.m).toBe(a.m);
        expect(restored.e).toBe(a.e);
      }),
    );
  });

  it('number -> BigNum -> number loses at most one ulp', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (x) => {
        fc.pre(Math.abs(x) > 1e-300 || x === 0);
        expect(relClose(BigNum.from(x).toNumber(), x, 5e-16)).toBe(true);
      }),
    );
  });

  it('keeps mantissa normalized after any operation', () => {
    fc.assert(
      fc.property(huge, huge, (a, b) => {
        for (const r of [a.add(b), a.sub(b), a.mul(b)]) {
          if (r.isZero()) continue;
          expect(Math.abs(r.m)).toBeGreaterThanOrEqual(1);
          expect(Math.abs(r.m)).toBeLessThan(10);
          expect(Number.isInteger(r.e)).toBe(true);
        }
      }),
    );
  });

  it('pow agrees with Math.pow for small integer exponents', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 20, noNaN: true }),
        fc.integer({ min: -20, max: 20 }),
        (base, exponent) => {
          expect(
            relClose(BigNum.from(base).pow(exponent).toNumber(), base ** exponent, 1e-11),
          ).toBe(true);
        },
      ),
    );
  });

  it('floor/ceil bracket the value for moderate numbers', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), (x) => {
        const n = BigNum.from(x);
        expect(n.floor().toNumber()).toBe(Math.floor(x) === 0 ? 0 : Math.floor(x));
        expect(n.ceil().toNumber()).toBe(Math.ceil(x) === 0 ? 0 : Math.ceil(x));
      }),
    );
  });

  it('sqrt squared recovers the value', () => {
    fc.assert(
      fc.property(huge, (a) => {
        const x = a.abs();
        const back = x.sqrt().pow(2);
        expect(back.sub(x).abs().div(x).lt(1e-14)).toBe(true);
      }),
    );
  });
});
