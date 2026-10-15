import type { BigNum } from '../core/bignum/index.js';

/** Orders `[id, time]` pairs by time, earliest first. */
export function compareTimes(a: readonly [unknown, number], b: readonly [unknown, number]): number {
  return a[1] - b[1];
}

/** Ids of a time map in the order they were recorded (earliest first). */
export function idsByTime<K>(times: ReadonlyMap<K, number>): K[] {
  const entries = [...times.entries()].sort(compareTimes);
  const ids: K[] = [];
  for (const [id] of entries) ids.push(id);
  return ids;
}

/** Maps each id to its position in the list. */
export function indexOfIds<K extends string>(ids: readonly K[]): Map<string, number> {
  const index = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) index.set(ids[i] as K, i);
  return index;
}

/** A list of `length` copies of the same (immutable) value. */
export function filled(length: number, value: BigNum): BigNum[] {
  return new Array<BigNum>(length).fill(value);
}
