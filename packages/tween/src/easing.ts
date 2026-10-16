/**
 * Maps progress `t` from `0` to `1` to eased progress, which is `0` at `0` and `1` at `1`.
 */
export type Ease = (t: number) => number;

const HALF_PI = Math.PI / 2;
const BACK = 1.70158;
const BACK_IN_OUT = BACK * 1.525;
const ELASTIC = (2 * Math.PI) / 3;
const ELASTIC_IN_OUT = (2 * Math.PI) / 4.5;

function linear(t: number): number {
  return t;
}

function quadIn(t: number): number {
  return t * t;
}

function cubicIn(t: number): number {
  return t * t * t;
}

function quartIn(t: number): number {
  return t * t * t * t;
}

function quintIn(t: number): number {
  return t * t * t * t * t;
}

function sineIn(t: number): number {
  return 1 - Math.cos(t * HALF_PI);
}

function expoIn(t: number): number {
  return t === 0 ? 0 : 2 ** (10 * t - 10);
}

function circIn(t: number): number {
  return 1 - Math.sqrt(1 - t * t);
}

function backIn(t: number): number {
  return (BACK + 1) * t * t * t - BACK * t * t;
}

function elasticIn(t: number): number {
  if (t === 0 || t === 1) return t;
  return -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * ELASTIC);
}

function bounceOut(t: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) {
    const u = t - 1.5 / d;
    return n * u * u + 0.75;
  }
  if (t < 2.5 / d) {
    const u = t - 2.25 / d;
    return n * u * u + 0.9375;
  }
  const u = t - 2.625 / d;
  return n * u * u + 0.984375;
}

function bounceIn(t: number): number {
  return 1 - bounceOut(1 - t);
}

/**
 * Turns an "in" curve into its "out" form: the same curve run backwards.
 */
export function reverseEase(ease: Ease): Ease {
  return (t) => 1 - ease(1 - t);
}

/**
 * Turns an "in" curve into an "in-out" form: the first half eases in, the second half eases out.
 */
export function mirrorEase(ease: Ease): Ease {
  return (t) => (t < 0.5 ? ease(t * 2) / 2 : 1 - ease((1 - t) * 2) / 2);
}

function backInOut(t: number): number {
  return t < 0.5
    ? ((t * 2) ** 2 * ((BACK_IN_OUT + 1) * 2 * t - BACK_IN_OUT)) / 2
    : ((t * 2 - 2) ** 2 * ((BACK_IN_OUT + 1) * (t * 2 - 2) + BACK_IN_OUT) + 2) / 2;
}

function elasticInOut(t: number): number {
  if (t === 0 || t === 1) return t;
  return t < 0.5
    ? -(2 ** (20 * t - 10) * Math.sin((20 * t - 11.125) * ELASTIC_IN_OUT)) / 2
    : (2 ** (-20 * t + 10) * Math.sin((20 * t - 11.125) * ELASTIC_IN_OUT)) / 2 + 1;
}

function expoInOut(t: number): number {
  if (t === 0 || t === 1) return t;
  return t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
}

/**
 * Every built-in curve, by name: `linear` and, for each family (`quad`, `cubic`, `quart`,
 * `quint`, `sine`, `expo`, `circ`, `back`, `elastic`, `bounce`), the `In`, `Out` and `InOut`
 * variants such as `cubicOut`.
 */
export const easings = {
  linear,
  quadIn,
  quadOut: reverseEase(quadIn),
  quadInOut: mirrorEase(quadIn),
  cubicIn,
  cubicOut: reverseEase(cubicIn),
  cubicInOut: mirrorEase(cubicIn),
  quartIn,
  quartOut: reverseEase(quartIn),
  quartInOut: mirrorEase(quartIn),
  quintIn,
  quintOut: reverseEase(quintIn),
  quintInOut: mirrorEase(quintIn),
  sineIn,
  sineOut: reverseEase(sineIn),
  sineInOut: mirrorEase(sineIn),
  expoIn,
  expoOut: reverseEase(expoIn),
  expoInOut,
  circIn,
  circOut: reverseEase(circIn),
  circInOut: mirrorEase(circIn),
  backIn,
  backOut: reverseEase(backIn),
  backInOut,
  elasticIn,
  elasticOut: reverseEase(elasticIn),
  elasticInOut,
  bounceIn,
  bounceOut,
  bounceInOut: mirrorEase(bounceIn),
} as const satisfies Record<string, Ease>;

/**
 * Name of a built-in curve.
 */
export type EaseName = keyof typeof easings;

/**
 * A curve, or the name of a built-in one.
 */
export type EaseLike = Ease | EaseName;

/**
 * Looks up a built-in curve by name, or returns a function unchanged.
 *
 * @throws {RangeError} for an unknown name.
 */
export function resolveEase(ease: EaseLike): Ease {
  if (typeof ease === 'function') return ease;
  const found: Ease | undefined = (easings as Record<string, Ease | undefined>)[ease];
  if (found === undefined) throw new RangeError(`Unknown easing "${ease}"`);
  return found;
}

const NEWTON_STEPS = 8;
const BISECT_STEPS = 24;

/**
 * Builds a curve like CSS `cubic-bezier(x1, y1, x2, y2)`.
 *
 * @throws {RangeError} if `x1` or `x2` is outside `0` to `1`.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  if (!(x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1)) {
    throw new RangeError('cubicBezier: x1 and x2 must be between 0 and 1');
  }
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (u: number): number => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u: number): number => ((ay * u + by) * u + cy) * u;
  const slopeX = (u: number): number => (3 * ax * u + 2 * bx) * u + cx;

  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < NEWTON_STEPS; i++) {
      const error = sampleX(u) - t;
      if (Math.abs(error) < 1e-7) return sampleY(u);
      const slope = slopeX(u);
      if (Math.abs(slope) < 1e-6) break;
      u -= error / slope;
    }
    let low = 0;
    let high = 1;
    u = t;
    for (let i = 0; i < BISECT_STEPS; i++) {
      const x = sampleX(u);
      if (Math.abs(x - t) < 1e-7) break;
      if (x < t) low = u;
      else high = u;
      u = (low + high) / 2;
    }
    return sampleY(u);
  };
}

/**
 * Builds a staircase curve with `count` equal jumps.
 *
 * @throws {RangeError} if `count` is not a positive integer.
 */
export function steps(count: number): Ease {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('steps: count must be a positive integer');
  }
  return (t) => (t >= 1 ? 1 : Math.floor(t * count) / count);
}
