import { describe, expect, it } from 'vitest';
import {
  DailyStreak,
  Game,
  ManualClock,
  Resource,
  SaveCorruptedError,
  createSave,
  dayNumber,
  nextDayStart,
} from '../src/index.ts';
import type { DailyStreakOptions } from '../src/index.ts';

const DAY = 86_400_000;

function make(options: DailyStreakOptions = {}, startDay = 100) {
  const clock = new ManualClock(startDay * DAY + 3_600_000);
  const game = new Game({ clock });
  const gold = game.createObject('Gold').addComponent(Resource);
  const streak = game.createObject('Streak').addComponent(DailyStreak, {
    reward: (_game, days) => gold.add(100 * days),
    ...options,
  });
  return { clock, game, gold, streak };
}

describe('day helpers', () => {
  it('number days in UTC or in an offset time zone', () => {
    expect(dayNumber(0)).toBe(0);
    expect(dayNumber(DAY - 1)).toBe(0);
    expect(dayNumber(DAY)).toBe(1);
    expect(dayNumber(DAY - 1, -180)).toBe(0);
    expect(dayNumber(DAY + 3 * 3_600_000, -180)).toBe(1);
    expect(dayNumber(3 * 3_600_000, -180)).toBe(0);
    expect(dayNumber(2 * 3_600_000, -180)).toBe(-1);
  });

  it('find the start of the next day', () => {
    expect(nextDayStart(5)).toBe(DAY);
    expect(nextDayStart(DAY)).toBe(2 * DAY);
    expect(nextDayStart(0, -180)).toBe(3 * 3_600_000);
  });
});

describe('DailyStreak', () => {
  it('starts at 1 and does not count the same day twice', () => {
    const { streak, clock } = make();
    expect(streak.checkIn()).toEqual({ status: 'started', streak: 1, best: 1, missed: 0 });
    clock.advance(5 * 3_600_000);
    expect(streak.checkIn()).toEqual({ status: 'already', streak: 1, best: 1, missed: 0 });
    expect(streak.checkedInToday).toBe(true);
  });

  it('continues on consecutive days and tracks the best streak', () => {
    const { streak, clock } = make();
    streak.checkIn();
    clock.advance(DAY);
    expect(streak.checkIn().status).toBe('continued');
    clock.advance(DAY);
    expect(streak.checkIn()).toMatchObject({ status: 'continued', streak: 3, best: 3 });
    clock.advance(3 * DAY);
    expect(streak.checkIn()).toEqual({ status: 'reset', streak: 1, best: 3, missed: 2 });
    expect(streak.best).toBe(3);
  });

  it('forgives missed days within the grace period', () => {
    const { streak, clock } = make({ graceDays: 1 });
    streak.checkIn();
    clock.advance(2 * DAY);
    expect(streak.checkIn()).toMatchObject({ status: 'continued', streak: 2, missed: 1 });
    clock.advance(3 * DAY);
    expect(streak.checkIn()).toMatchObject({ status: 'reset', streak: 1, missed: 2 });
  });

  it('changes day at the offset midnight', () => {
    const { streak, clock } = make({ utcOffsetMinutes: -180 }, 100);
    clock.set(100 * DAY + 2 * 3_600_000);
    streak.checkIn();
    clock.set(100 * DAY + 4 * 3_600_000);
    expect(streak.checkIn().status).toBe('continued');
  });

  it('pays the reward once a day, for the current streak', () => {
    const { streak, clock, gold } = make();
    expect(streak.canClaim).toBe(false);
    expect(streak.claim()).toBe(false);
    streak.checkIn();
    expect(streak.canClaim).toBe(true);
    const paid: number[] = [];
    streak.claimed.addListener((days) => paid.push(days));
    expect(streak.claim()).toBe(true);
    expect(streak.claim()).toBe(false);
    clock.advance(DAY);
    streak.checkIn();
    expect(streak.canClaim).toBe(true);
    streak.claim();
    expect(gold.amount.toNumber()).toBe(100 + 200);
    expect(paid).toEqual([1, 2]);
  });

  it('cannot claim a day it has not checked in for', () => {
    const { streak, clock } = make();
    streak.checkIn();
    clock.advance(DAY);
    expect(streak.canClaim).toBe(false);
  });

  it('can check in by itself when the game starts', () => {
    const { game, streak } = make({ autoCheckIn: true });
    game.advance(100);
    expect(streak.streak).toBe(1);
    expect(streak.checkedInToday).toBe(true);
  });

  it('counts down to the next day', () => {
    const { streak, clock } = make();
    expect(streak.msUntilNextDay).toBe(DAY - 3_600_000);
    clock.advance(DAY - 3_600_000 - 1000);
    expect(streak.msUntilNextDay).toBe(1000);
  });

  it('fires the check-in event with the result', () => {
    const { streak } = make();
    const seen: string[] = [];
    streak.checkedIn.addListener(({ status, streak: days }) => seen.push(`${status}:${days}`));
    streak.checkIn();
    streak.checkIn();
    expect(seen).toEqual(['started:1', 'already:1']);
  });

  it('survives a save and load, including the claim of the day', () => {
    const a = make();
    a.streak.checkIn();
    a.clock.advance(DAY);
    a.streak.checkIn();
    a.streak.claim();
    const save = a.game.save();
    const b = make();
    b.clock.set(a.clock.now());
    b.game.load(save, { offline: false });
    expect(b.streak.streak).toBe(2);
    expect(b.streak.best).toBe(2);
    expect(b.streak.canClaim).toBe(false);
    b.clock.advance(DAY);
    expect(b.streak.checkIn().status).toBe('continued');
  });

  it('starts fresh after a reset and rejects a bad save entry', () => {
    const { game, streak } = make();
    streak.checkIn();
    game.reset();
    expect(streak.streak).toBe(0);
    expect(streak.checkIn().status).toBe('started');
    const bad = createSave(1, 0, { objects: { Streak: { DailyStreak: { streak: -1 } } } });
    expect(() => game.load(bad, { offline: false })).toThrow(SaveCorruptedError);
    const worse = createSave(1, 0, { objects: { Streak: { DailyStreak: 5 } } });
    expect(() => game.load(worse, { offline: false })).toThrow(SaveCorruptedError);
  });

  it('validates its options', () => {
    const game = new Game({ clock: new ManualClock(0) });
    expect(() => game.createObject('S').addComponent(DailyStreak, { graceDays: -1 })).toThrow(
      RangeError,
    );
    expect(() =>
      game.createObject('T').addComponent(DailyStreak, { utcOffsetMinutes: Infinity }),
    ).toThrow(RangeError);
  });
});
