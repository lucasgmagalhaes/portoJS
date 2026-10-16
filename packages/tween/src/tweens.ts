import type { Animation } from './animation.ts';
import { Timeline } from './timeline.ts';
import { Tween } from './tween.ts';
import type { TweenOptions, TweenProps } from './tween.ts';

function isLive(animation: Animation): boolean {
  return !animation.isFinished;
}

/**
 * Owns a set of running animations and advances them together. Drive it with
 * {@link Tweens.update}, or let a {@link TweenSystem} do it in game time.
 */
export class Tweens {
  private running: Animation[] = [];

  /**
   * Number of animations still running.
   */
  get size(): number {
    return this.running.length;
  }

  /**
   * Animates `props` of `target` from their current values to the given ones.
   *
   * @example
   * tweens.to(sprite, { x: 200, alpha: 0 }, { duration: 0.5, ease: 'cubicOut' });
   */
  to<T extends object>(target: T, props: TweenProps<T>, options: TweenOptions): Tween<T> {
    return this.add(new Tween(target, props, options));
  }

  /**
   * Animates `props` of `target` from the given values to their current ones.
   */
  from<T extends object>(target: T, props: TweenProps<T>, options: TweenOptions): Tween<T> {
    return this.add(new Tween(target, props, options, true));
  }

  /**
   * Creates a timeline that this manager plays.
   */
  timeline(): Timeline {
    return this.add(new Timeline());
  }

  /**
   * Starts playing an animation you built yourself. Returns it.
   */
  add<A extends Animation>(animation: A): A {
    this.running.push(animation);
    return animation;
  }

  /**
   * Advances every animation by `deltaSeconds` and drops the ones that finished.
   */
  update(deltaSeconds: number): void {
    for (const animation of [...this.running]) animation.update(deltaSeconds);
    this.running = this.running.filter(isLive);
  }

  /**
   * Kills every tween that animates `target`, or everything when `target` is omitted.
   */
  killAll(target?: object): void {
    for (const animation of this.running) {
      if (target === undefined || (animation instanceof Tween && animation.target === target)) {
        animation.kill();
      }
    }
    this.running = this.running.filter(isLive);
  }
}
