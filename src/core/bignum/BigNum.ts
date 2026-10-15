/**
 * Anything that can be turned into a {@link BigNum}: an existing instance,
 * a finite JS number, or a decimal / scientific string such as `"1.5e12"`.
 */
export type BigNumLike = BigNum | number | string;

/** Exact powers of ten that fit in a double (1e0 .. 1e22). */
function buildPow10(): number[] {
  const powers: number[] = [];
  for (let i = 0; i <= 22; i++) powers.push(Number(`1e${i}`));
  return powers;
}

const POW10: readonly number[] = buildPow10();

/** Beyond this exponent gap the smaller addend cannot change a 53-bit mantissa. */
const ADD_CUTOFF = 16;

/** Largest absolute integer exponent handled by repeated squaring in {@link BigNum.pow}. */
const SQUARING_LIMIT = 1024;

const DECIMAL_PATTERN = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

function pow10(n: number): number {
  return POW10[n] ?? Number(`1e${n}`);
}

/**
 * Immutable arbitrary-magnitude number stored as `mantissa × 10^exponent`.
 *
 * The mantissa is a double with `1 <= |m| < 10` (or exactly `0` for zero) and the
 * exponent is an integer stored as a JS number, so magnitudes up to roughly
 * `10^(9e15)` are representable. Precision is that of a double (~15 significant
 * digits), which is what idle games need while staying fast.
 *
 * Instances are normalized on creation, so two equal values always have identical
 * `m` and `e`. They serialize to JSON as a scientific string (e.g. `"1.5e12"`).
 *
 * @example
 * const a = BigNum.from('1.5e12');
 * a.mul(2).toString(); // "3e12"
 */
export class BigNum {
  /** The number zero. */
  static readonly ZERO: BigNum = new BigNum(0, 0);
  /** The number one. */
  static readonly ONE: BigNum = new BigNum(1, 0);
  /** The number ten. */
  static readonly TEN: BigNum = new BigNum(1, 1);

  /** Signed mantissa, `1 <= |m| < 10`, or `0` for zero. */
  readonly m: number;
  /** Base-10 exponent (integer). */
  readonly e: number;

  private constructor(m: number, e: number) {
    this.m = m;
    this.e = e;
  }

  /**
   * Converts a number, numeric string or existing {@link BigNum} into a BigNum.
   *
   * @throws {RangeError} if a number is `NaN` or infinite, or an exponent is not a safe integer.
   * @throws {SyntaxError} if a string is not a valid decimal / scientific literal.
   */
  static from(value: BigNumLike): BigNum {
    if (value instanceof BigNum) return value;
    if (typeof value === 'number') return BigNum.fromNumber(value);
    return BigNum.fromString(value);
  }

  /**
   * Builds a BigNum from an explicit mantissa and exponent. The mantissa does not
   * need to be normalized: `fromParts(15, 3)` equals `1.5e4`.
   *
   * @throws {RangeError} if either part is not finite.
   */
  static fromParts(mantissa: number, exponent: number): BigNum {
    return BigNum.normExact(mantissa, exponent);
  }

  /**
   * Restores a BigNum from its JSON form (a string, or a plain number).
   *
   * @throws {TypeError} if `value` is neither a string nor a number.
   * @throws {SyntaxError | RangeError} if the content is malformed.
   */
  static fromJSON(value: unknown): BigNum {
    if (typeof value === 'string' || typeof value === 'number') return BigNum.from(value);
    throw new TypeError('BigNum.fromJSON expects a string or number');
  }

  private static fromNumber(n: number): BigNum {
    if (!Number.isFinite(n)) throw new RangeError(`BigNum cannot represent ${String(n)}`);
    return BigNum.normExact(n, 0);
  }

  private static fromString(text: string): BigNum {
    const match = DECIMAL_PATTERN.exec(text.trim());
    if (match === null) throw new SyntaxError(`BigNum: cannot parse "${text}"`);
    const negative = match[1] === '-';
    const integerPart = match[2] ?? '';
    const fractionPart = match[3] ?? match[4] ?? '';
    const exponentPart = match[5] === undefined ? 0 : Number(match[5]);
    if (!Number.isSafeInteger(exponentPart)) {
      throw new RangeError(`BigNum: exponent out of range in "${text}"`);
    }
    const digits = integerPart + fractionPart;
    let lead = 0;
    while (lead < digits.length && digits[lead] === '0') lead++;
    if (lead === digits.length) return BigNum.ZERO;
    const significant = digits.slice(lead);
    const exponent = integerPart.length - lead - 1 + exponentPart;
    const mantissaText =
      significant.length > 1 ? `${significant[0]}.${significant.slice(1)}` : significant;
    return BigNum.normExact(negative ? -Number(mantissaText) : Number(mantissaText), exponent);
  }

  /** Normalizes using the exact (string based) path; correct for any mantissa. */
  private static normExact(m: number, e: number): BigNum {
    if (!Number.isFinite(m) || !Number.isFinite(e)) {
      throw new RangeError('BigNum: mantissa and exponent must be finite');
    }
    if (m === 0) return BigNum.ZERO;
    const [mantissaText, exponentText] = m.toExponential().split('e');
    return new BigNum(Number(mantissaText), e + Number(exponentText));
  }

  /** Fast normalization for results of arithmetic, where `m` is within a factor 100 of range. */
  private static norm(m: number, e: number): BigNum {
    if (m === 0) return BigNum.ZERO;
    const a = Math.abs(m);
    if (a >= 1 && a < 10) return new BigNum(m, e);
    if (a >= 10 && a < 100) {
      const r = m / 10;
      if (Math.abs(r) < 10) return new BigNum(r, e + 1);
    } else if (a >= 0.1 && a < 1) {
      const r = m * 10;
      if (Math.abs(r) < 10) return new BigNum(r, e - 1);
    }
    return BigNum.normExact(m, e);
  }

  /** `true` when the value is exactly zero. */
  isZero(): boolean {
    return this.m === 0;
  }

  /** `true` when the value is strictly less than zero. */
  isNegative(): boolean {
    return this.m < 0;
  }

  /** `-1`, `0` or `1` according to the sign of the value. */
  sign(): -1 | 0 | 1 {
    return this.m < 0 ? -1 : this.m > 0 ? 1 : 0;
  }

  /**
   * Converts to a JS number. Values too large become `±Infinity`, too small become `0`.
   */
  toNumber(): number {
    if (this.m === 0) return 0;
    if (this.e > 308) return this.m > 0 ? Infinity : -Infinity;
    if (this.e < -324) return 0;
    return Number(`${this.m}e${this.e}`);
  }

  /** Scientific string that {@link BigNum.from} parses back to an identical value, e.g. `"1.5e12"`. */
  toString(): string {
    return this.m === 0 ? '0' : `${this.m}e${this.e}`;
  }

  /**
   * Allows `String(n)` and template literals, but refuses implicit numeric conversion so
   * that `a < b` or `a + 1` fail loudly instead of silently comparing strings.
   *
   * @throws {TypeError} for any non-string hint.
   */
  [Symbol.toPrimitive](hint: string): string {
    if (hint === 'string') return this.toString();
    throw new TypeError(
      'BigNum cannot be converted implicitly: use add()/lt()/cmp() or toNumber()',
    );
  }

  /** JSON representation: the same string as {@link BigNum.toString}. */
  toJSON(): string {
    return this.toString();
  }

  /** Returns `-this`. */
  neg(): BigNum {
    return this.m === 0 ? this : new BigNum(-this.m, this.e);
  }

  /** Returns `|this|`. */
  abs(): BigNum {
    return this.m < 0 ? new BigNum(-this.m, this.e) : this;
  }

  /** Returns `this + other`. */
  add(other: BigNumLike): BigNum {
    const b = BigNum.from(other);
    if (this.m === 0) return b;
    if (b.m === 0) return this;
    const gap = this.e - b.e;
    if (gap > ADD_CUTOFF) return this;
    if (gap < -ADD_CUTOFF) return b;
    if (gap >= 0) return BigNum.norm(this.m + b.m / pow10(gap), this.e);
    return BigNum.norm(b.m + this.m / pow10(-gap), b.e);
  }

  /** Returns `this - other`. */
  sub(other: BigNumLike): BigNum {
    return this.add(BigNum.from(other).neg());
  }

  /** Returns `this × other`. */
  mul(other: BigNumLike): BigNum {
    const b = BigNum.from(other);
    return BigNum.norm(this.m * b.m, this.e + b.e);
  }

  /**
   * Returns `this ÷ other`.
   *
   * @throws {RangeError} when dividing by zero.
   */
  div(other: BigNumLike): BigNum {
    const b = BigNum.from(other);
    if (b.m === 0) throw new RangeError('BigNum: division by zero');
    return BigNum.norm(this.m / b.m, this.e - b.e);
  }

  /**
   * Returns `1 / this`.
   *
   * @throws {RangeError} when the value is zero.
   */
  recip(): BigNum {
    return BigNum.ONE.div(this);
  }

  /**
   * Returns `this ^ exponent`. Small integer exponents use repeated squaring (accurate);
   * others go through base-10 logarithms (relative error around `1e-15 × |log10 result|`).
   *
   * @throws {RangeError} for `0^negative`, a negative base with a fractional exponent,
   * or an exponent too large for a JS number.
   */
  pow(exponent: BigNumLike): BigNum {
    const x = BigNum.from(exponent).toNumber();
    if (!Number.isFinite(x)) throw new RangeError('BigNum: exponent too large');
    if (x === 0) return BigNum.ONE;
    if (this.m === 0) {
      if (x < 0) throw new RangeError('BigNum: zero raised to a negative power');
      return BigNum.ZERO;
    }
    const isInteger = Number.isInteger(x);
    if (this.m < 0 && !isInteger) {
      throw new RangeError('BigNum: negative base with a fractional exponent');
    }
    if (isInteger && Math.abs(x) <= SQUARING_LIMIT) {
      const result = BigNum.powInteger(this, Math.abs(x));
      return x < 0 ? result.recip() : result;
    }
    const log = (this.e + Math.log10(Math.abs(this.m))) * x;
    const whole = Math.floor(log);
    const mantissa = 10 ** (log - whole);
    const negative = this.m < 0 && x % 2 !== 0;
    return BigNum.norm(negative ? -mantissa : mantissa, whole);
  }

  /** Exponentiation by squaring for a non-negative integer `n`. */
  private static powInteger(base: BigNum, n: number): BigNum {
    let result: BigNum = BigNum.ONE;
    let factor = base;
    let remaining = n;
    while (remaining > 0) {
      if (remaining % 2 === 1) result = result.mul(factor);
      remaining = Math.floor(remaining / 2);
      if (remaining > 0) factor = factor.mul(factor);
    }
    return result;
  }

  /**
   * Returns the square root.
   *
   * @throws {RangeError} for negative values.
   */
  sqrt(): BigNum {
    if (this.m < 0) throw new RangeError('BigNum: square root of a negative number');
    if (this.m === 0) return this;
    return this.e % 2 === 0
      ? BigNum.norm(Math.sqrt(this.m), this.e / 2)
      : BigNum.norm(Math.sqrt(this.m * 10), (this.e - 1) / 2);
  }

  /**
   * Base-10 logarithm as a JS number.
   *
   * @throws {RangeError} for zero or negative values.
   */
  log10(): number {
    if (this.m <= 0) throw new RangeError('BigNum: logarithm of a non-positive number');
    return this.e + Math.log10(this.m);
  }

  /**
   * Natural logarithm as a JS number.
   *
   * @throws {RangeError} for zero or negative values.
   */
  ln(): number {
    return this.log10() * Math.LN10;
  }

  /** Three-way comparison: `-1` if `this < other`, `0` if equal, `1` if greater. */
  cmp(other: BigNumLike): -1 | 0 | 1 {
    const b = BigNum.from(other);
    const sa = this.sign();
    const sb = b.sign();
    if (sa !== sb) return sa < sb ? -1 : 1;
    if (sa === 0) return 0;
    if (this.e !== b.e) {
      const byExponent = this.e < b.e ? -1 : 1;
      return sa > 0 ? byExponent : byExponent === 1 ? -1 : 1;
    }
    return this.m < b.m ? -1 : this.m > b.m ? 1 : 0;
  }

  /** `this === other` by value. */
  eq(other: BigNumLike): boolean {
    return this.cmp(other) === 0;
  }

  /** `this < other`. */
  lt(other: BigNumLike): boolean {
    return this.cmp(other) < 0;
  }

  /** `this <= other`. */
  lte(other: BigNumLike): boolean {
    return this.cmp(other) <= 0;
  }

  /** `this > other`. */
  gt(other: BigNumLike): boolean {
    return this.cmp(other) > 0;
  }

  /** `this >= other`. */
  gte(other: BigNumLike): boolean {
    return this.cmp(other) >= 0;
  }

  /** The smaller of the two values. */
  static min(a: BigNumLike, b: BigNumLike): BigNum {
    const x = BigNum.from(a);
    const y = BigNum.from(b);
    return x.lte(y) ? x : y;
  }

  /** The larger of the two values. */
  static max(a: BigNumLike, b: BigNumLike): BigNum {
    const x = BigNum.from(a);
    const y = BigNum.from(b);
    return x.gte(y) ? x : y;
  }

  /** Sum of a list of values (`0` when empty). */
  static sum(values: Iterable<BigNumLike>): BigNum {
    let total: BigNum = BigNum.ZERO;
    for (const v of values) total = total.add(v);
    return total;
  }

  /** Largest integer less than or equal to the value. */
  floor(): BigNum {
    return this.roundWith(Math.floor);
  }

  /** Smallest integer greater than or equal to the value. */
  ceil(): BigNum {
    return this.roundWith(Math.ceil);
  }

  /** Nearest integer; halves round toward `+∞` like `Math.round`. */
  round(): BigNum {
    return this.roundWith(Math.round);
  }

  /** Integer part, discarding the fraction (rounds toward zero). */
  trunc(): BigNum {
    return this.roundWith(Math.trunc);
  }

  private roundWith(fn: (x: number) => number): BigNum {
    if (this.m === 0 || this.e >= 15) return this;
    const x = this.e < -300 ? this.m * 1e-300 : this.toNumber();
    return BigNum.fromNumber(fn(x));
  }
}
