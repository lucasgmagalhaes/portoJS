import { describe, expect, it } from 'vitest';
import { BigNum } from '../../src/core/bignum/index.js';

const big = (v: string | number): BigNum => BigNum.from(v);

describe('BigNum creation', () => {
  it('normalizes mantissa into [1, 10)', () => {
    const n = BigNum.fromParts(15, 3);
    expect(n.m).toBe(1.5);
    expect(n.e).toBe(4);
    expect(BigNum.fromParts(0.05, 0).toString()).toBe('5e-2');
  });

  it('parses decimal and scientific strings exactly', () => {
    expect(big('0.3').toString()).toBe('3e-1');
    expect(big('1500').toString()).toBe('1.5e3');
    expect(big('1.5e12').toString()).toBe('1.5e12');
    expect(big('-2.5E-3').toString()).toBe('-2.5e-3');
    expect(big('.5').toString()).toBe('5e-1');
    expect(big('000123').toString()).toBe('1.23e2');
    expect(big('1e1000').e).toBe(1000);
  });

  it('treats every zero spelling as the same zero', () => {
    expect(big('0').toString()).toBe('0');
    expect(big(-0).isZero()).toBe(true);
    expect(big('0e50')).toBe(BigNum.ZERO);
    expect(big(0.0)).toBe(BigNum.ZERO);
  });

  it('rejects invalid input', () => {
    expect(() => big(NaN)).toThrow(RangeError);
    expect(() => big(Infinity)).toThrow(RangeError);
    expect(() => big('abc')).toThrow(SyntaxError);
    expect(() => big('')).toThrow(SyntaxError);
    expect(() => big('1e')).toThrow(SyntaxError);
    expect(() => big('1e99999999999999999999')).toThrow(RangeError);
  });

  it('keeps tiny doubles exact', () => {
    expect(big(5e-324).toString()).toBe('5e-324');
    expect(big(1.7976931348623157e308).e).toBe(308);
  });
});

describe('BigNum arithmetic', () => {
  it('adds without double rounding artefacts', () => {
    expect(big('0.1').add('0.2').eq('0.3')).toBe(true);
    expect(big(1).add(2).toString()).toBe('3e0');
  });

  it('adds across wildly different magnitudes', () => {
    const huge = big('1e1000');
    expect(huge.add(1)).toBe(huge);
    expect(big(1).add(huge)).toBe(huge);
    expect(big('1e20').add('1e3').toString()).toBe('1e20');
  });

  it('handles signs in add and sub', () => {
    expect(big(5).sub(8).toString()).toBe('-3e0');
    expect(big(-5).add(5).isZero()).toBe(true);
    expect(big('1e30').sub('1e30').isZero()).toBe(true);
    expect(big('1.5e30').sub('5e29').toString()).toBe('1e30');
  });

  it('multiplies and divides', () => {
    expect(big('2e100').mul('3e200').toString()).toBe('6e300');
    expect(big('5e100').mul('4e-50').toString()).toBe('2e51');
    expect(big('6e300').div('3e200').toString()).toBe('2e100');
    expect(big(-6).div(3).toString()).toBe('-2e0');
    expect(big(0).mul('1e500').isZero()).toBe(true);
  });

  it('throws on division by zero', () => {
    expect(() => big(1).div(0)).toThrow(RangeError);
    expect(() => BigNum.ZERO.recip()).toThrow(RangeError);
  });

  it('computes powers exactly for small integer exponents', () => {
    expect(big(2).pow(10).toNumber()).toBeCloseTo(1024, 10);
    expect(big(10).pow(100).toString()).toBe('1e100');
    expect(big(2).pow(-2).toNumber()).toBeCloseTo(0.25, 14);
    expect(big(-2).pow(3).toNumber()).toBeCloseTo(-8, 12);
    expect(big(-2).pow(2).toNumber()).toBeCloseTo(4, 12);
    expect(big(7).pow(0)).toBe(BigNum.ONE);
    expect(BigNum.ZERO.pow(5).isZero()).toBe(true);
  });

  it('computes large and fractional powers through logarithms', () => {
    const r = big(10).pow(5000);
    expect(r.e).toBe(5000);
    expect(r.m).toBeCloseTo(1, 9);
    expect(big(4).pow(0.5).toNumber()).toBeCloseTo(2, 12);
    expect(big(-3).pow(1025).isNegative()).toBe(true);
  });

  it('rejects invalid powers', () => {
    expect(() => BigNum.ZERO.pow(-1)).toThrow(RangeError);
    expect(() => big(-4).pow(0.5)).toThrow(RangeError);
    expect(() => big(2).pow('1e400')).toThrow(RangeError);
  });

  it('computes square roots', () => {
    expect(big(16).sqrt().toNumber()).toBe(4);
    expect(big('1e100').sqrt().toString()).toBe('1e50');
    expect(big('1e101').sqrt().toNumber()).toBeCloseTo(Math.sqrt(1e101), -40);
    expect(() => big(-1).sqrt()).toThrow(RangeError);
  });

  it('computes logarithms', () => {
    expect(big('1e50').log10()).toBe(50);
    expect(big(100).log10()).toBe(2);
    expect(big(Math.E).ln()).toBeCloseTo(1, 12);
    expect(() => BigNum.ZERO.log10()).toThrow(RangeError);
  });

  it('neg and abs', () => {
    expect(big(3).neg().toString()).toBe('-3e0');
    expect(big(-3).abs().toString()).toBe('3e0');
    expect(BigNum.ZERO.neg()).toBe(BigNum.ZERO);
  });

  it('sums iterables', () => {
    expect(BigNum.sum([1, 2, '3e0']).toNumber()).toBe(6);
    expect(BigNum.sum([])).toBe(BigNum.ZERO);
  });
});

describe('BigNum comparison', () => {
  it('orders positives, negatives and zero', () => {
    expect(big(1).cmp(2)).toBe(-1);
    expect(big(2).cmp(1)).toBe(1);
    expect(big(2).cmp(2)).toBe(0);
    expect(big(-1).cmp(1)).toBe(-1);
    expect(big(-2).cmp(-1)).toBe(-1);
    expect(big(-1).cmp(-2)).toBe(1);
    expect(big(0).cmp(-1)).toBe(1);
    expect(big(0).cmp(1)).toBe(-1);
    expect(big(0).cmp(0)).toBe(0);
    expect(big('1e100').gt('9e99')).toBe(true);
    expect(big('-1e100').lt('-9e99')).toBe(true);
  });

  it('exposes convenience comparators', () => {
    expect(big(1).lte(1)).toBe(true);
    expect(big(1).gte(1)).toBe(true);
    expect(big(1).lt(1)).toBe(false);
    expect(BigNum.min(3, 2).toNumber()).toBe(2);
    expect(BigNum.max(3, 2).toNumber()).toBe(3);
  });
});

describe('BigNum rounding', () => {
  it('floors, ceils, rounds and truncates', () => {
    expect(big(2.7).floor().toNumber()).toBe(2);
    expect(big(-2.7).floor().toNumber()).toBe(-3);
    expect(big(2.1).ceil().toNumber()).toBe(3);
    expect(big(-2.1).ceil().toNumber()).toBe(-2);
    expect(big(2.5).round().toNumber()).toBe(3);
    expect(big(-2.7).trunc().toNumber()).toBe(-2);
  });

  it('handles values below 1 and tiny values', () => {
    expect(big(0.4).floor().isZero()).toBe(true);
    expect(big(0.4).ceil().toNumber()).toBe(1);
    expect(big('-1e-400').floor().toNumber()).toBe(-1);
    expect(big('1e-400').floor().isZero()).toBe(true);
    expect(big('1e-400').ceil().toNumber()).toBe(1);
    expect(big(-0.4).round().isZero()).toBe(true);
  });

  it('leaves large values untouched', () => {
    const n = big('1.23456789e30');
    expect(n.floor()).toBe(n);
    expect(n.ceil()).toBe(n);
  });
});

describe('BigNum conversion and JSON', () => {
  it('converts to numbers with overflow and underflow', () => {
    expect(big('1.5e300').toNumber()).toBe(1.5e300);
    expect(big('1e400').toNumber()).toBe(Infinity);
    expect(big('-1e400').toNumber()).toBe(-Infinity);
    expect(big('1e-400').toNumber()).toBe(0);
    expect(big(123.456).toNumber()).toBe(123.456);
    expect(big(1e-10).toNumber()).toBe(1e-10);
  });

  it('round-trips through JSON', () => {
    const values = ['0', '1.5e12', '-7.77e-200', '1e100000', '9.999999999999998e5'];
    for (const v of values) {
      const original = big(v);
      const restored = BigNum.fromJSON(
        (JSON.parse(JSON.stringify({ n: original })) as { n: string }).n,
      );
      expect(restored.eq(original)).toBe(true);
      expect(restored.toString()).toBe(original.toString());
    }
  });

  it('rejects non-numeric JSON', () => {
    expect(() => BigNum.fromJSON(null)).toThrow(TypeError);
    expect(() => BigNum.fromJSON({})).toThrow(TypeError);
    expect(() => BigNum.fromJSON('nope')).toThrow(SyntaxError);
  });
});

describe('BigNum implicit conversion guard', () => {
  it('allows string conversion', () => {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    expect(`${big('1.5e12')}`).toBe('1.5e12');
    expect(String(big(7))).toBe('7e0');
  });

  it('refuses silent numeric use', () => {
    const a = big(1);
    const b = big(2);
    expect(() => a < b).toThrow(TypeError);
    // @ts-expect-error arithmetic on objects is intentionally rejected at runtime
    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands, @typescript-eslint/no-unsafe-return
    expect(() => a + 1).toThrow(TypeError);
    expect(() => Number(a)).toThrow(TypeError);
  });
});
