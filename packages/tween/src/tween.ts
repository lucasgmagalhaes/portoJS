import type { BigNum } from '@portojs/core';
import { Animation } from './animation.ts';
import { resolveEase } from './easing.ts';
import type { Ease, EaseLike } from './easing.ts';

/**
 * A value a tween can animate: a plain number or a {@link BigNum}.
 */
export type TweenValue = number | BigNum;

/**
 * The properties of `T` that can be tweened, each as an optional end value.
 */
export type TweenProps<T> = {
  [K in keyof T]?: T[K] extends TweenValue ? T[K] : never;
};

/**
 * Options of a tween.
 */
export interface TweenOptions {
  /**
   * Length of one run, in seconds. `0` jumps straight to the end.
   */
  readonly duration: number;
  /**
   * Curve, as a function or the name of a built-in one. Default `linear`.
   */
  readonly ease?: EaseLike;
  /**
   * Seconds to wait before starting. Default `0`.
   */
  readonly delay?: number;
  /**
   * Extra runs after the first: `1` plays twice. `Infinity` loops forever. Default `0`.
   */
  readonly repeat?: number;
  /**
   * Play every second run backwards. Default `false`.
   */
  readonly yoyo?: boolean;
  /**
   * Called when a repeat starts, with the zero-based run index.
   */
  readonly onRepeat?: (iteration: number) => void;
  /**
   * Called after every change with progress from `0` to `1` of the whole run.
   */
  readonly onUpdate?: (progress: number) => void;
  /**
   * Called once when the tween completes.
   */
  readonly onComplete?: () => void;
}

/**
 * Linear interpolation of numbers or big numbers.
 *
 * @throws {TypeError} when the two values are of different kinds.
 */
export function interpolate(from: TweenValue, to: TweenValue, t: number): TweenValue {
  if (typeof from === 'number' && typeof to === 'number') return from + (to - from) * t;
  if (typeof from === 'number' || typeof to === 'number') {
    throw new TypeError('tween: cannot mix numbers and BigNum in one property');
  }
  return from.add(to.sub(from).mul(t));
}

function checkOptions(options: TweenOptions): void {
  if (!Number.isFinite(options.duration) || options.duration < 0) {
    throw new RangeError('Tween: duration must be a finite number >= 0');
  }
  const delay = options.delay ?? 0;
  if (!Number.isFinite(delay) || delay < 0) {
    throw new RangeError('Tween: delay must be a finite number >= 0');
  }
  const repeat = options.repeat ?? 0;
  if (repeat === Infinity && options.duration === 0) {
    throw new RangeError('Tween: an endless tween needs a duration above 0');
  }
  if (repeat !== Infinity && (!Number.isInteger(repeat) || repeat < 0)) {
    throw new RangeError('Tween: repeat must be an integer >= 0 or Infinity');
  }
}

/**
 * Animates numeric (or {@link BigNum}) properties of an object over game time. Create one with
 * {@link Tweens.to} or {@link Tweens.from}.
 */
export class Tween<T extends object = object> extends Animation {
  private readonly keys: (keyof T)[];
  private readonly ease: Ease;
  private readonly delay: number;
  private readonly repeat: number;
  private readonly yoyo: boolean;
  private readonly runSeconds: number;
  private readonly onRepeat: ((iteration: number) => void) | undefined;
  private starts: Map<keyof T, TweenValue> | undefined;
  private ends: Map<keyof T, TweenValue> | undefined;
  private lastIteration = 0;

  /**
   * @param target object whose properties are animated.
   * @param props values to animate towards (`to`) or from (`from`).
   * @param options timing and callbacks.
   * @param reverse `true` for a `from` tween: `props` are the start values.
   * @throws {RangeError} on invalid timing options.
   */
  constructor(
    readonly target: T,
    private readonly props: TweenProps<T>,
    options: TweenOptions,
    private readonly reverse = false,
  ) {
    super();
    checkOptions(options);
    this.keys = Object.keys(props) as (keyof T)[];
    this.ease = resolveEase(options.ease ?? 'linear');
    this.delay = options.delay ?? 0;
    this.repeat = options.repeat ?? 0;
    this.yoyo = options.yoyo ?? false;
    this.runSeconds = options.duration;
    this.onRepeat = options.onRepeat;
    this.onUpdate = options.onUpdate;
    this.onComplete = options.onComplete;
  }

  override get duration(): number {
    return this.delay + this.runSeconds * (this.repeat + 1);
  }

  protected override apply(): void {
    const local = this.elapsedSeconds - this.delay;
    if (local < 0) return;
    this.capture();
    let iteration = this.repeat;
    let progress = 1;
    if (this.runSeconds > 0) {
      const raw = local / this.runSeconds;
      iteration = Math.min(this.repeat, Math.floor(raw));
      progress = Math.min(1, raw - iteration);
    }
    if (this.yoyo && iteration % 2 === 1) progress = 1 - progress;
    this.write(progress === 0 || progress === 1 ? progress : this.ease(progress));
    if (iteration !== this.lastIteration) {
      this.lastIteration = iteration;
      this.onRepeat?.(iteration);
    }
  }

  private capture(): void {
    if (this.starts !== undefined) return;
    const starts = new Map<keyof T, TweenValue>();
    const ends = new Map<keyof T, TweenValue>();
    for (const key of this.keys) {
      const current = this.target[key] as unknown as TweenValue;
      const given = this.props[key] as unknown as TweenValue;
      if (typeof current !== typeof given) {
        throw new TypeError(`Tween: property "${String(key)}" is not a ${typeof given}`);
      }
      starts.set(key, this.reverse ? given : current);
      ends.set(key, this.reverse ? current : given);
    }
    this.starts = starts;
    this.ends = ends;
  }

  private write(eased: number): void {
    const target = this.target as Record<keyof T, unknown>;
    for (const key of this.keys) {
      const from = this.starts?.get(key);
      const to = this.ends?.get(key);
      if (from === undefined || to === undefined) continue;
      target[key] = eased === 0 ? from : eased === 1 ? to : interpolate(from, to, eased);
    }
  }
}
