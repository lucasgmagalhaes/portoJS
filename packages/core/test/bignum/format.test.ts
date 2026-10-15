import { describe, expect, it } from 'vitest';
import { format } from '../../src/index.js';
import type { BigNum } from '../../src/index.js';

describe('format', () => {
  it('prints small numbers plainly', () => {
    expect(format(0)).toBe('0');
    expect(format(7)).toBe('7');
    expect(format(123.456)).toBe('123.46');
    expect(format(0.5)).toBe('0.5');
    expect(format(-42)).toBe('-42');
  });

  it('uses scientific notation by default', () => {
    expect(format('1.5e12')).toBe('1.5e12');
    expect(format(1234)).toBe('1.23e3');
    expect(format('-1.5e12')).toBe('-1.5e12');
    expect(format('1e-9')).toBe('1e-9');
  });

  it('carries when rounding the mantissa up', () => {
    expect(format('9.999e12')).toBe('1e13');
    expect(format('9.996e12', { precision: 2 })).toBe('1e13');
  });

  it('respects precision', () => {
    expect(format('1.23456e9', { precision: 4 })).toBe('1.2346e9');
    expect(format('1.5e9', { precision: 0 })).toBe('2e9');
    expect(() => format(1, { precision: -1 })).toThrow(RangeError);
    expect(() => format(1, { precision: 1.5 })).toThrow(RangeError);
    expect(() => format(1, { precision: 16 })).toThrow(RangeError);
  });

  it('formats engineering notation', () => {
    expect(format('1.5e12', { notation: 'engineering' })).toBe('1.5e12');
    expect(format('1.5e13', { notation: 'engineering' })).toBe('15e12');
    expect(format('1.5e14', { notation: 'engineering' })).toBe('150e12');
    expect(format('9.99999e14', { notation: 'engineering' })).toBe('1e15');
  });

  it('formats suffix notation', () => {
    const f = (v: string): string => format(v, { notation: 'suffix' });
    expect(f('1.5e3')).toBe('1.5K');
    expect(f('1.5e6')).toBe('1.5M');
    expect(f('1.5e12')).toBe('1.5T');
    expect(f('1.5e13')).toBe('15T');
    expect(f('9.99999e5')).toBe('1M');
    expect(f('-2.5e9')).toBe('-2.5B');
    expect(f('123')).toBe('123');
  });

  it('falls back to scientific when suffixes run out', () => {
    expect(format('1.5e300', { notation: 'suffix' })).toBe('1.5e300');
    expect(format('1.5e9', { notation: 'suffix', suffixes: ['k', 'm'] })).toBe('1.5e9');
    expect(format('1.5e6', { notation: 'suffix', suffixes: ['k', 'm'] })).toBe('1.5m');
  });

  it('honours plainBelow', () => {
    expect(format(12345, { plainBelow: 6 })).toBe('12345');
    expect(format(12345, { plainBelow: 0 })).toBe('1.23e4');
  });

  it('delegates to a custom formatter for every value', () => {
    const custom = (n: BigNum, p: number): string => `<${n.toString()}|${p}>`;
    expect(format('1.5e12', { notation: custom })).toBe('<1.5e12|2>');
    expect(format(0, { notation: custom, precision: 5 })).toBe('<0|5>');
  });
});
