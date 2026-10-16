/**
 * Tweens, easing and timelines, driven by game time.
 *
 * @module @portojs/tween
 */

export { Animation } from './animation.ts';
export { cubicBezier, easings, mirrorEase, resolveEase, reverseEase, steps } from './easing.ts';
export type { Ease, EaseLike, EaseName } from './easing.ts';
export { Timeline } from './timeline.ts';
export type { TimelinePosition } from './timeline.ts';
export { Tween, interpolate } from './tween.ts';
export type { TweenOptions, TweenProps, TweenValue } from './tween.ts';
export { TweenSystem } from './tween-system.ts';
export { Tweens } from './tweens.ts';
