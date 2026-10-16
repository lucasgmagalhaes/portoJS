/**
 * Limits `value` to the range `min` to `max`.
 */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Linear interpolation: `a` at `t = 0`, `b` at `t = 1`. `t` is not clamped.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * The `t` for which `lerp(a, b, t) === value`. Returns `0` when `a === b`.
 */
export function inverseLerp(a: number, b: number, value: number): number {
  return a === b ? 0 : (value - a) / (b - a);
}

/**
 * Maps `value` from the range `[inMin, inMax]` to `[outMin, outMax]`.
 */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  return lerp(outMin, outMax, inverseLerp(inMin, inMax, value));
}

/**
 * Wraps `value` into `[min, max)`, also for negative values.
 *
 * @throws {RangeError} if `max <= min`.
 */
export function wrap(value: number, min: number, max: number): number {
  if (!(max > min)) throw new RangeError('wrap: max must be greater than min');
  const size = max - min;
  return ((((value - min) % size) + size) % size) + min;
}
