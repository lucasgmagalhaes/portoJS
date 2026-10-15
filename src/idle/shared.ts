import { BigNum } from '../core/bignum/index.js';
import type { BigNumLike } from '../core/bignum/index.js';
import { SaveCorruptedError } from '../core/save/index.js';
import type { JsonValue } from '../core/save/index.js';
import type { Generator } from './generator.js';
import type { Resource } from './resource.js';
import type { Upgrade } from './upgrade.js';

/**
 * A purchase is allowed when the price exceeds the balance by less than this fraction. Absorbs
 * the last-digit error that accumulating many small gains leaves behind.
 */
export const AFFORD_TOLERANCE = 1e-12;

/**
 * What a multiplier applies to.
 */
export type EffectTarget =
  { readonly generator: Generator } | { readonly resource: Resource } | { readonly all: true };

/**
 * A multiplier applied to a target.
 */
export type TargetedMultiplier = EffectTarget & { readonly multiplier: BigNumLike };

/**
 * How many units to buy: an exact count or as many as affordable.
 */
export type BulkAmount = number | 'max';

/**
 * Whether `price` can be paid from `balance`, tolerating last-digit error.
 */
export function affordable(price: BigNum, balance: BigNum): boolean {
  if (price.lte(balance)) return true;
  return price.sub(balance).div(price).lt(AFFORD_TOLERANCE);
}

/**
 * A list of `length` copies of the same (immutable) value.
 */
export function filled(length: number, value: BigNum): BigNum[] {
  return new Array<BigNum>(length).fill(value);
}

/**
 * Reads a non-negative BigNum from saved data.
 *
 * @throws {SaveCorruptedError} if the value is missing, malformed or negative.
 */
export function readBig(value: JsonValue | undefined, label: string): BigNum {
  try {
    const parsed = BigNum.fromJSON(value);
    if (parsed.isNegative()) throw new RangeError('negative');
    return parsed;
  } catch {
    throw new SaveCorruptedError(`${label}: invalid number`);
  }
}

/**
 * Validates a bulk amount into a whole, positive BigNum.
 *
 * @throws {RangeError} if `amount` is not a positive integer.
 */
export function wholeCount(amount: number): BigNum {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new RangeError('amount must be a positive integer or "max"');
  }
  return BigNum.from(amount);
}

/**
 * What survives a run reset.
 */
export interface ResetKeep {
  readonly resources?: readonly Resource[];
  readonly generators?: readonly Generator[];
  readonly upgrades?: readonly Upgrade[];
}
