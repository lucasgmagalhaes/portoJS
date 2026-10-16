/**
 * The internal state of an {@link Rng}: four unsigned 32-bit integers. JSON-safe.
 */
export type RngState = readonly [number, number, number, number];

function isUint32(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
}

function isZero(n: number): boolean {
  return n === 0;
}

function splitMix32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let z = state ^ (state >>> 16);
    z = Math.imul(z, 0x21f0aaad);
    z ^= z >>> 15;
    z = Math.imul(z, 0x735a2d97);
    z ^= z >>> 15;
    return z >>> 0;
  };
}

/**
 * A fast seeded random number generator (xoshiro128**). The same seed always gives the same
 * sequence, on every platform, and the state can be saved with the game and restored later.
 *
 * @example
 * const rng = new Rng(42);
 * rng.int(1, 6); // always the same first roll for seed 42
 * const saved = rng.state(); // put this in the save
 * const restored = Rng.fromState(saved);
 */
export class Rng {
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;

  /**
   * @param seed any number; it is converted to a 32-bit integer and expanded with SplitMix32.
   */
  constructor(seed = 0) {
    const next = splitMix32(seed);
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /**
   * Restores a generator from {@link Rng.state}.
   *
   * @throws {RangeError} if the state is not four 32-bit integers, or is all zero.
   */
  static fromState(state: readonly number[]): Rng {
    if (state.length !== 4 || !state.every(isUint32)) {
      throw new RangeError('Rng.fromState: state must be four unsigned 32-bit integers');
    }
    if (state.every(isZero)) throw new RangeError('Rng.fromState: state cannot be all zero');
    const rng = new Rng(0);
    rng.s0 = state[0] ?? 1;
    rng.s1 = state[1] ?? 1;
    rng.s2 = state[2] ?? 1;
    rng.s3 = state[3] ?? 1;
    return rng;
  }

  /**
   * The current state, to store in a save.
   */
  state(): RngState {
    return [this.s0 >>> 0, this.s1 >>> 0, this.s2 >>> 0, this.s3 >>> 0];
  }

  /**
   * The next unsigned 32-bit integer.
   */
  nextUint32(): number {
    const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k));
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /**
   * A float in `[0, 1)`.
   */
  next(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  /**
   * A float in `[min, max)`.
   */
  float(min = 0, max = 1): number {
    return min + this.next() * (max - min);
  }

  /**
   * An integer from `min` to `max`, both included, without modulo bias.
   */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError('Rng.int: min and max must be integers with max >= min');
    }
    const span = max - min + 1;
    if (span > 0x1_0000_0000) throw new RangeError('Rng.int: range is too large');
    const limit = 0x1_0000_0000 - (0x1_0000_0000 % span);
    let value = this.nextUint32();
    while (value >= limit) value = this.nextUint32();
    return min + (value % span);
  }

  /**
   * `true` with the given probability (default one half).
   */
  chance(probability = 0.5): boolean {
    return this.next() < probability;
  }

  /**
   * A random element. @throws {RangeError} on an empty array.
   */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick: array is empty');
    return items[this.int(0, items.length - 1)] as T;
  }

  /**
   * A shuffled copy (Fisher-Yates).
   */
  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const swap = copy[i] as T;
      copy[i] = copy[j] as T;
      copy[j] = swap;
    }
    return copy;
  }

  /**
   * Picks an element with probability proportional to its weight.
   *
   * @throws {RangeError} if no weight is positive, or a weight is negative or not finite.
   */
  weighted<T>(entries: readonly { readonly value: T; readonly weight: number }[]): T {
    let total = 0;
    for (const { weight } of entries) {
      if (!Number.isFinite(weight) || weight < 0) {
        throw new RangeError('Rng.weighted: weights must be finite and not negative');
      }
      total += weight;
    }
    if (total <= 0) throw new RangeError('Rng.weighted: at least one weight must be positive');
    let roll = this.next() * total;
    let last: T | undefined;
    for (const entry of entries) {
      if (entry.weight === 0) continue;
      last = entry.value;
      roll -= entry.weight;
      if (roll < 0) return entry.value;
    }
    return last as T;
  }

  /**
   * An independent generator seeded from this one, so subsystems do not disturb each other.
   */
  fork(): Rng {
    return new Rng(this.nextUint32());
  }
}
