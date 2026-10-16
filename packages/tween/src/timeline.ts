import { Animation } from './animation.ts';
import { Tween } from './tween.ts';
import type { TweenOptions, TweenProps } from './tween.ts';

/**
 * Where to place an animation in a {@link Timeline}: seconds from the start, the name of a
 * label, `'<'` to start together with the previous one, or `'>'` (the default) to start when
 * everything added so far has finished.
 */
export type TimelinePosition = number | string;

interface Entry {
  readonly at: number;
  readonly animation: Animation;
}

class Callback extends Animation {
  private called = false;

  constructor(private readonly callback: () => void) {
    super();
  }

  override get duration(): number {
    return 0;
  }

  protected override apply(): void {
    if (this.called) return;
    this.called = true;
    this.callback();
  }
}

class Pause extends Animation {
  constructor(private readonly seconds: number) {
    super();
  }

  override get duration(): number {
    return this.seconds;
  }

  protected override apply(): void {
    return;
  }
}

/**
 * A sequence of tweens, pauses and callbacks, with parallel branches and named labels.
 *
 * @example
 * tweens
 *   .timeline()
 *   .to(box, { x: 100 }, { duration: 1 })
 *   .to(box, { y: 50 }, { duration: 1 }, '<')
 *   .wait(0.5)
 *   .call(() => sound.play());
 */
export class Timeline extends Animation {
  private readonly entries: Entry[] = [];
  private readonly labels = new Map<string, number>();
  private lastStart = 0;
  private end = 0;

  override get duration(): number {
    return this.end;
  }

  /**
   * Adds a tween, placed by `position`.
   */
  to<T extends object>(
    target: T,
    props: TweenProps<T>,
    options: TweenOptions,
    position: TimelinePosition = '>',
  ): this {
    return this.add(new Tween(target, props, options), position);
  }

  /**
   * Adds a tween that starts from `props` and ends at the current values.
   */
  from<T extends object>(
    target: T,
    props: TweenProps<T>,
    options: TweenOptions,
    position: TimelinePosition = '>',
  ): this {
    return this.add(new Tween(target, props, options, true), position);
  }

  /**
   * Adds any animation, for example another timeline.
   *
   * @throws {RangeError} for an unknown label or a negative time.
   */
  add(animation: Animation, position: TimelinePosition = '>'): this {
    const at = this.resolve(position);
    this.entries.push({ at, animation });
    this.lastStart = at;
    this.end = Math.max(this.end, at + animation.duration);
    return this;
  }

  /**
   * Adds a pause of `seconds`.
   */
  wait(seconds: number): this {
    if (!(seconds >= 0)) throw new RangeError('Timeline.wait: seconds must be >= 0');
    return this.add(new Pause(seconds));
  }

  /**
   * Runs `callback` once when the timeline reaches this point.
   */
  call(callback: () => void, position: TimelinePosition = '>'): this {
    return this.add(new Callback(callback), position);
  }

  /**
   * Names the point at `position` so later calls can refer to it.
   */
  label(name: string, position: TimelinePosition = '>'): this {
    this.labels.set(name, this.resolve(position));
    return this;
  }

  protected override apply(): void {
    for (const { at, animation } of this.entries) {
      if (this.elapsedSeconds < at || animation.isFinished) continue;
      animation.seek(Math.min(this.elapsedSeconds - at, animation.duration));
    }
  }

  override kill(): void {
    for (const { animation } of this.entries) animation.kill();
    super.kill();
  }

  private resolve(position: TimelinePosition): number {
    if (typeof position === 'number') {
      if (!(position >= 0)) throw new RangeError('Timeline: a time must be >= 0');
      return position;
    }
    if (position === '>') return this.end;
    if (position === '<') return this.lastStart;
    const labelled = this.labels.get(position);
    if (labelled === undefined) throw new RangeError(`Timeline: unknown label "${position}"`);
    return labelled;
  }
}
