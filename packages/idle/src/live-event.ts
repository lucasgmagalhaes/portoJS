import type { BigNumLike } from '@portojs/core';
import { Component, GameEvent } from '@portojs/runtime';
import type { GameObject } from '@portojs/runtime';
import { Economy } from './economy.ts';
import type { ModifierContext } from './economy.ts';
import type { TargetedMultiplier } from './shared.ts';

/**
 * Options of {@link LiveEvent}.
 */
export interface LiveEventOptions {
  /**
   * When the first window opens, in milliseconds on the game clock (epoch milliseconds for the
   * default system clock).
   */
  readonly startsAt: number;
  /**
   * How long each window stays open, in milliseconds.
   */
  readonly durationMs: number;
  /**
   * Opens another window every this many milliseconds after the previous start. Must be at least
   * `durationMs`. Omit for a single window.
   */
  readonly repeatEveryMs?: number;
  /**
   * How many windows in total when repeating. Omit to repeat forever.
   */
  readonly occurrences?: number;
  /**
   * Multipliers applied while a window is open.
   */
  readonly effects?: readonly TargetedMultiplier[];
}

/**
 * A window of a {@link LiveEvent}.
 */
export interface EventWindow {
  /**
   * Opening time, in milliseconds on the game clock.
   */
  readonly start: number;
  /**
   * Closing time (exclusive), in milliseconds on the game clock.
   */
  readonly end: number;
}

/**
 * A time-limited event on the calendar: "double gold every weekend", "a one-hour harvest
 * festival". It is open during fixed windows of the game clock, so it does not depend on the
 * player being online. It raises `started` and `ended` as the clock crosses a window edge while
 * the game runs, and applies its multipliers only to production while playing: like `Boost`, it
 * does not touch offline gains, which keeps those a closed form.
 *
 * Whether it is open is read from the clock at each update, so its edges are as precise as the
 * update rate (a frame). It saves nothing, because whether it is open follows from the clock. Use `windowsBetween` to
 * draw a calendar.
 *
 * @example
 * const weekend = game.createObject('Weekend').addComponent(LiveEvent, {
 *   startsAt: Date.UTC(2026, 0, 3),
 *   durationMs: 2 * 86_400_000,
 *   repeatEveryMs: 7 * 86_400_000,
 *   effects: [{ resource: gold, multiplier: 2 }],
 * });
 * weekend.started.addListener(() => showBanner('Double gold!'));
 */
export class LiveEvent extends Component {
  static override typeId = 'LiveEvent';

  /**
   * Fired when a window opens.
   */
  readonly started = new GameEvent<LiveEvent>();
  /**
   * Fired when a window closes.
   */
  readonly ended = new GameEvent<LiveEvent>();

  private readonly options: LiveEventOptions;
  private wasOpen = false;

  /**
   * @param gameObject the object this component is attached to.
   * @param options the schedule and effects.
   * @throws {RangeError} if the schedule is not valid.
   */
  constructor(gameObject: GameObject, options: LiveEventOptions) {
    super(gameObject);
    this.options = options;
    if (!Number.isFinite(options.startsAt)) throw new RangeError('LiveEvent: invalid startsAt');
    if (!Number.isFinite(options.durationMs) || options.durationMs <= 0) {
      throw new RangeError('LiveEvent: durationMs must be a positive number');
    }
    const repeat = options.repeatEveryMs;
    if (repeat !== undefined && !(Number.isFinite(repeat) && repeat >= options.durationMs)) {
      throw new RangeError('LiveEvent: repeatEveryMs must be at least durationMs');
    }
    const count = options.occurrences;
    if (count !== undefined && !(Number.isInteger(count) && count >= 1)) {
      throw new RangeError('LiveEvent: occurrences must be a positive integer');
    }
  }

  override awake(): void {
    this.wasOpen = this.isOpen();
    const effects = this.options.effects ?? [];
    const economy = Economy.of(this.game);
    for (let i = 0; i < effects.length; i++) {
      const effect = effects[i] as TargetedMultiplier;
      economy.setModifier(this.modifierId(i), effect, this.whileOpen(effect));
    }
  }

  override onDestroy(): void {
    const economy = Economy.existing(this.game);
    for (let i = 0; i < (this.options.effects ?? []).length; i++) {
      economy?.removeModifier(this.modifierId(i));
    }
  }

  /**
   * The window that is open at `at`, or `undefined`.
   *
   * @param at time on the game clock. Default: now.
   */
  windowAt(at: number = this.game.now()): EventWindow | undefined {
    const { startsAt, durationMs, repeatEveryMs, occurrences } = this.options;
    if (at < startsAt) return undefined;
    const index = repeatEveryMs === undefined ? 0 : Math.floor((at - startsAt) / repeatEveryMs);
    if (occurrences !== undefined && index >= occurrences) return undefined;
    const start = startsAt + index * (repeatEveryMs ?? 0);
    return at < start + durationMs ? { start, end: start + durationMs } : undefined;
  }

  /**
   * Whether a window is open at `at`.
   *
   * @param at time on the game clock. Default: now.
   */
  isOpen(at: number = this.game.now()): boolean {
    return this.windowAt(at) !== undefined;
  }

  /**
   * The next window that opens after `at`, or `undefined` when there are no more.
   *
   * @param at time on the game clock. Default: now.
   */
  nextWindow(at: number = this.game.now()): EventWindow | undefined {
    const { startsAt, durationMs, repeatEveryMs, occurrences } = this.options;
    if (at < startsAt) return { start: startsAt, end: startsAt + durationMs };
    if (repeatEveryMs === undefined) return undefined;
    const index = Math.floor((at - startsAt) / repeatEveryMs) + 1;
    if (occurrences !== undefined && index >= occurrences) return undefined;
    const start = startsAt + index * repeatEveryMs;
    return { start, end: start + durationMs };
  }

  /**
   * Milliseconds until the open window closes, or `0` when none is open.
   *
   * @param at time on the game clock. Default: now.
   */
  remainingMs(at: number = this.game.now()): number {
    const window = this.windowAt(at);
    return window === undefined ? 0 : window.end - at;
  }

  /**
   * Every window that overlaps `[from, to)`, in order: the data for a calendar.
   *
   * @param from start of the range, on the game clock.
   * @param to end of the range (exclusive).
   */
  windowsBetween(from: number, to: number): EventWindow[] {
    const { startsAt, durationMs, repeatEveryMs, occurrences } = this.options;
    const windows: EventWindow[] = [];
    const first =
      repeatEveryMs === undefined || from <= startsAt
        ? 0
        : Math.max(0, Math.floor((from - startsAt - durationMs) / repeatEveryMs));
    const last = occurrences === undefined ? Number.POSITIVE_INFINITY : occurrences - 1;
    for (let index = first; index <= last; index++) {
      const start = startsAt + index * (repeatEveryMs ?? 0);
      if (start >= to) break;
      if (start + durationMs > from) windows.push({ start, end: start + durationMs });
      if (repeatEveryMs === undefined) break;
    }
    return windows;
  }

  override fixedUpdate(): void {
    const open = this.isOpen();
    if (open === this.wasOpen) return;
    this.wasOpen = open;
    (open ? this.started : this.ended).invoke(this);
  }

  private modifierId(index: number): string {
    return `event:${this.gameObject.name}:${index}`;
  }

  private readonly whileOpen =
    (effect: TargetedMultiplier) =>
    ({ offline }: ModifierContext): BigNumLike =>
      !offline && this.isOpen() ? effect.multiplier : 1;
}
