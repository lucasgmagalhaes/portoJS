import { SaveCorruptedError, isJsonObject } from '@portojs/core';
import type { JsonValue } from '@portojs/core';
import { Component, GameEvent } from '@portojs/runtime';
import type { Game, GameObject } from '@portojs/runtime';

const DAY_MS = 86_400_000;

/**
 * The number of the calendar day a clock time falls on, counting from 1970-01-01 in the time zone
 * `utcOffsetMinutes` east of UTC (`-180` for Brazil, `new Date().getTimezoneOffset() * -1` for
 * the player's own).
 */
export function dayNumber(ms: number, utcOffsetMinutes = 0): number {
  return Math.floor((ms + utcOffsetMinutes * 60_000) / DAY_MS);
}

/**
 * Clock time in ms of the start of the day after the one `ms` falls on.
 */
export function nextDayStart(ms: number, utcOffsetMinutes = 0): number {
  return (dayNumber(ms, utcOffsetMinutes) + 1) * DAY_MS - utcOffsetMinutes * 60_000;
}

/**
 * Options of a {@link DailyStreak}.
 */
export interface DailyStreakOptions {
  /**
   * Minutes east of UTC for the day boundaries. Default `0` (UTC). Pass the player's own to reset
   * at their midnight: `-new Date().getTimezoneOffset()`.
   */
  readonly utcOffsetMinutes?: number;
  /**
   * Days that may be missed without losing the streak. Default `0`: missing one day resets it.
   */
  readonly graceDays?: number;
  /**
   * Pays the reward for a day of the streak when the player claims it.
   */
  readonly reward?: (game: Game, streak: number) => void;
  /**
   * Check in as soon as the game starts. Default `false`: call {@link DailyStreak.checkIn}.
   */
  readonly autoCheckIn?: boolean;
}

/**
 * What a check-in did to the streak:
 * - `started`: the first ever check-in, streak 1.
 * - `continued`: checked in the day after (or within the grace days of) the last one.
 * - `reset`: too many days were missed, the streak starts again at 1.
 * - `already`: already checked in today, nothing changed.
 */
export type StreakStatus = 'started' | 'continued' | 'reset' | 'already';

/**
 * Payload of {@link DailyStreak.checkedIn}.
 */
export interface CheckIn {
  readonly status: StreakStatus;
  readonly streak: number;
  /**
   * The longest streak so far.
   */
  readonly best: number;
  /**
   * Days missed since the last check-in, `0` for consecutive days.
   */
  readonly missed: number;
}

/**
 * Counts how many days in a row the player came back, with an optional daily reward. Days follow
 * the game clock, so it is testable with a fake clock.
 *
 * @example
 * const streak = game.createObject('Streak').addComponent(DailyStreak, {
 *   utcOffsetMinutes: -new Date().getTimezoneOffset(),
 *   reward: (game, days) => gold.add(100 * days),
 * });
 * streak.checkedIn.addListener(({ status, streak: days }) => showBanner(status, days));
 * streak.checkIn();
 * if (streak.canClaim) streak.claim();
 */
export class DailyStreak extends Component {
  static override typeId = 'DailyStreak';

  /**
   * Fired by {@link DailyStreak.checkIn} (also when the status is `already`).
   */
  readonly checkedIn = new GameEvent<CheckIn>();

  /**
   * Fired after the day's reward is claimed.
   */
  readonly claimed = new GameEvent<number>();

  private readonly options: DailyStreakOptions;
  private readonly offset: number;
  private readonly grace: number;
  private lastDay: number | undefined;
  private claimedDay: number | undefined;
  private count = 0;
  private longest = 0;

  constructor(gameObject: GameObject, options: DailyStreakOptions = {}) {
    super(gameObject);
    this.options = options;
    this.offset = options.utcOffsetMinutes ?? 0;
    this.grace = options.graceDays ?? 0;
    if (!Number.isFinite(this.offset)) throw new RangeError('DailyStreak: bad utcOffsetMinutes');
    if (!Number.isInteger(this.grace) || this.grace < 0) {
      throw new RangeError('DailyStreak: graceDays must be an integer >= 0');
    }
  }

  /**
   * Days in a row, as of the last check-in. It is not reduced by days missed since then; the next
   * check-in does that.
   */
  get streak(): number {
    return this.count;
  }

  /**
   * The longest streak so far.
   */
  get best(): number {
    return this.longest;
  }

  /**
   * Whether the player has checked in today.
   */
  get checkedInToday(): boolean {
    return this.lastDay === this.today();
  }

  /**
   * Whether today's reward can be claimed: checked in today and not claimed yet.
   */
  get canClaim(): boolean {
    return this.checkedInToday && this.claimedDay !== this.today();
  }

  /**
   * Ms of game clock until the next day starts, for a countdown.
   */
  get msUntilNextDay(): number {
    return nextDayStart(this.game.now(), this.offset) - this.game.now();
  }

  /**
   * Records that the player is here today and updates the streak.
   */
  checkIn(): CheckIn {
    const today = this.today();
    let status: StreakStatus;
    let missed = 0;
    if (this.lastDay === undefined) {
      status = 'started';
      this.count = 1;
    } else if (this.lastDay === today) {
      status = 'already';
    } else {
      missed = today - this.lastDay - 1;
      if (missed < 0) {
        status = 'already';
        missed = 0;
      } else if (missed <= this.grace) {
        status = 'continued';
        this.count += 1;
      } else {
        status = 'reset';
        this.count = 1;
      }
    }
    if (status !== 'already') this.lastDay = today;
    this.longest = Math.max(this.longest, this.count);
    const result: CheckIn = { status, streak: this.count, best: this.longest, missed };
    this.checkedIn.invoke(result);
    return result;
  }

  /**
   * Pays today's reward.
   *
   * @returns `false` and changes nothing if the player has not checked in today or already claimed.
   */
  claim(): boolean {
    if (!this.canClaim) return false;
    this.claimedDay = this.today();
    this.options.reward?.(this.game, this.count);
    this.claimed.invoke(this.count);
    return true;
  }

  override start(): void {
    if (this.options.autoCheckIn === true) this.checkIn();
  }

  override onSave(): JsonValue {
    return {
      lastDay: this.lastDay ?? null,
      claimedDay: this.claimedDay ?? null,
      streak: this.count,
      best: this.longest,
    };
  }

  override onLoad(data: JsonValue | undefined): void {
    this.lastDay = undefined;
    this.claimedDay = undefined;
    this.count = 0;
    this.longest = 0;
    if (data === undefined) return;
    if (!isJsonObject(data))
      throw new SaveCorruptedError('DailyStreak: save entry must be an object');
    const last = optionalInteger(data['lastDay'], 'lastDay');
    const claimed = optionalInteger(data['claimedDay'], 'claimedDay');
    const streak = integer(data['streak'], 'streak');
    const best = integer(data['best'], 'best');
    this.lastDay = last;
    this.claimedDay = claimed;
    this.count = streak;
    this.longest = Math.max(best, streak);
  }

  private today(): number {
    return dayNumber(this.game.now(), this.offset);
  }
}

function integer(value: JsonValue | undefined, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new SaveCorruptedError(`DailyStreak: ${name} must be an integer >= 0`);
  }
  return value;
}

function optionalInteger(value: JsonValue | undefined, name: string): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new SaveCorruptedError(`DailyStreak: ${name} must be a day number`);
  }
  return value;
}
