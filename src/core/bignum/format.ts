import { BigNum } from './BigNum.js';
import type { BigNumLike } from './BigNum.js';

/** Built-in notations. */
export type Notation = 'scientific' | 'engineering' | 'suffix';

/**
 * Custom formatter. It receives every value (including small and negative ones)
 * and the requested precision, and fully controls the output.
 */
export type Formatter = (value: BigNum, precision: number) => string;

/** Options accepted by {@link format}. */
export interface FormatOptions {
  /** Built-in notation name or a custom {@link Formatter}. Default `'scientific'`. */
  readonly notation?: Notation | Formatter;
  /** Maximum decimals shown (trailing zeros are trimmed). Integer 0-15, default `2`. */
  readonly precision?: number;
  /** Values with exponent below this are printed as plain numbers. Default `3` (below 1000). */
  readonly plainBelow?: number;
  /** Suffix list for the `'suffix'` notation, starting at 10^3. Defaults to {@link DEFAULT_SUFFIXES}. */
  readonly suffixes?: readonly string[];
}

/** Short-scale suffixes from 10^3 (`K`) up to 10^63 (`Vg`). */
export const DEFAULT_SUFFIXES: readonly string[] = [
  'K',
  'M',
  'B',
  'T',
  'Qa',
  'Qi',
  'Sx',
  'Sp',
  'Oc',
  'No',
  'Dc',
  'Ud',
  'Dd',
  'Td',
  'Qad',
  'Qid',
  'Sxd',
  'Spd',
  'Ocd',
  'Nod',
  'Vg',
];

/** Smallest exponent that still prints as a plain decimal (`0.001`). */
const MIN_PLAIN_EXPONENT = -3;

function trim(text: string): string {
  if (!text.includes('.')) return text;
  return text.replace(/0+$/, '').replace(/\.$/, '');
}

function roundTo(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function formatPlain(n: BigNum, precision: number): string {
  return trim(n.toNumber().toFixed(precision));
}

function formatScientific(n: BigNum, precision: number): string {
  let mantissa = roundTo(Math.abs(n.m), precision);
  let exponent = n.e;
  if (mantissa >= 10) {
    mantissa /= 10;
    exponent += 1;
  }
  return `${n.m < 0 ? '-' : ''}${trim(mantissa.toFixed(precision))}e${exponent}`;
}

function formatEngineering(n: BigNum, precision: number): string {
  const shift = ((n.e % 3) + 3) % 3;
  let exponent = n.e - shift;
  let mantissa = roundTo(Math.abs(n.m) * 10 ** shift, precision);
  if (mantissa >= 1000) {
    mantissa /= 1000;
    exponent += 3;
  }
  return `${n.m < 0 ? '-' : ''}${trim(mantissa.toFixed(precision))}e${exponent}`;
}

function formatSuffix(n: BigNum, precision: number, suffixes: readonly string[]): string {
  let group = Math.floor(n.e / 3);
  let mantissa = roundTo(Math.abs(n.m) * 10 ** (n.e - group * 3), precision);
  if (mantissa >= 1000) {
    mantissa /= 1000;
    group += 1;
  }
  const suffix = suffixes[group - 1];
  if (suffix === undefined) return formatScientific(n, precision);
  return `${n.m < 0 ? '-' : ''}${trim(mantissa.toFixed(precision))}${suffix}`;
}

/**
 * Formats a number for display.
 *
 * @example
 * format('1.5e12');                          // "1.5e12"
 * format('1.5e12', { notation: 'suffix' });  // "1.5T"
 * format(1234.5, { notation: 'engineering', plainBelow: 0 }); // "1.23e3"
 *
 * @throws {RangeError} if `precision` is not an integer between 0 and 15.
 */
export function format(value: BigNumLike, options: FormatOptions = {}): string {
  const n = BigNum.from(value);
  const precision = options.precision ?? 2;
  if (!Number.isInteger(precision) || precision < 0 || precision > 15) {
    throw new RangeError('format: precision must be an integer between 0 and 15');
  }
  const notation = options.notation ?? 'scientific';
  if (typeof notation === 'function') return notation(n, precision);
  if (n.isZero()) return '0';
  const plainBelow = options.plainBelow ?? 3;
  if (n.e < plainBelow && n.e >= MIN_PLAIN_EXPONENT) return formatPlain(n, precision);
  switch (notation) {
    case 'engineering':
      return formatEngineering(n, precision);
    case 'suffix':
      return n.e < 3
        ? formatScientific(n, precision)
        : formatSuffix(n, precision, options.suffixes ?? DEFAULT_SUFFIXES);
    case 'scientific':
      return formatScientific(n, precision);
  }
}
