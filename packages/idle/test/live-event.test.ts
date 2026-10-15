import { ManualClock } from '@portojs/core';
import { Game } from '@portojs/runtime';
import { describe, expect, it } from 'vitest';
import { Generator, LiveEvent, Resource, idleComponents } from '../src/index.ts';

function make(startAt = 0) {
  const clock = new ManualClock(startAt);
  const game = new Game({ clock, stepMs: 100 });
  const gold = game.createObject('Gold').addComponent(Resource, { initial: 0 });
  const miner = game.createObject('Miner').addComponent(Generator, {
    cost: { resource: gold, base: 1, growth: 1 },
    produces: gold,
    rate: 1,
    initial: 1,
  });
  return { clock, game, gold, miner };
}

function run(clock: ManualClock, game: Game, ms: number): void {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    clock.advance(100);
    game.update();
  }
}

describe('LiveEvent windows', () => {
  it('describes a single window', () => {
    const { game } = make();
    const event = game.createObject('Once').addComponent(LiveEvent, {
      startsAt: 1000,
      durationMs: 500,
    });
    expect(event.windowAt(999)).toBeUndefined();
    expect(event.windowAt(1000)).toEqual({ start: 1000, end: 1500 });
    expect(event.windowAt(1499)).toEqual({ start: 1000, end: 1500 });
    expect(event.windowAt(1500)).toBeUndefined();
    expect(event.isOpen(1200)).toBe(true);
    expect(event.nextWindow(0)).toEqual({ start: 1000, end: 1500 });
    expect(event.nextWindow(1200)).toBeUndefined();
    expect(event.remainingMs(1200)).toBe(300);
    expect(event.remainingMs(2000)).toBe(0);
    expect(event.windowsBetween(0, 5000)).toEqual([{ start: 1000, end: 1500 }]);
    expect(event.windowsBetween(1500, 5000)).toEqual([]);
  });

  it('repeats, optionally a limited number of times', () => {
    const { game } = make();
    const forever = game.createObject('Weekly').addComponent(LiveEvent, {
      startsAt: 1000,
      durationMs: 200,
      repeatEveryMs: 1000,
    });
    expect(forever.windowAt(2100)).toEqual({ start: 2000, end: 2200 });
    expect(forever.windowAt(2300)).toBeUndefined();
    expect(forever.nextWindow(2100)).toEqual({ start: 3000, end: 3200 });
    expect(forever.windowsBetween(1900, 4100).map((window) => window.start)).toEqual([
      2000, 3000, 4000,
    ]);
    expect(forever.windowsBetween(1300, 1900)).toEqual([]);

    const limited = game.createObject('Three').addComponent(LiveEvent, {
      startsAt: 0,
      durationMs: 100,
      repeatEveryMs: 1000,
      occurrences: 3,
    });
    expect(limited.windowAt(2050)).toEqual({ start: 2000, end: 2100 });
    expect(limited.windowAt(3050)).toBeUndefined();
    expect(limited.nextWindow(2050)).toBeUndefined();
    expect(limited.nextWindow(1050)).toEqual({ start: 2000, end: 2100 });
    expect(limited.windowsBetween(0, 100_000)).toHaveLength(3);
  });

  it('validates the schedule', () => {
    const { game } = make();
    const add = (options: ConstructorParameters<typeof LiveEvent>[1]): void => {
      game.createObject(`E${Math.random()}`).addComponent(LiveEvent, options);
    };
    expect(() => add({ startsAt: Number.NaN, durationMs: 1 })).toThrow(RangeError);
    expect(() => add({ startsAt: 0, durationMs: 0 })).toThrow(RangeError);
    expect(() => add({ startsAt: 0, durationMs: 10, repeatEveryMs: 5 })).toThrow(RangeError);
    expect(() => add({ startsAt: 0, durationMs: 10, occurrences: 0 })).toThrow(RangeError);
  });
});

describe('LiveEvent in a game', () => {
  it('fires started and ended as the clock crosses the edges', () => {
    const { clock, game } = make();
    const event = game.createObject('Festival').addComponent(LiveEvent, {
      startsAt: 1000,
      durationMs: 1000,
    });
    const log: string[] = [];
    event.started.addListener(() => log.push('start'));
    event.ended.addListener(() => log.push('end'));
    clock.advance(500);
    game.update();
    expect(log).toEqual([]);
    clock.advance(600);
    game.update();
    expect(log).toEqual(['start']);
    clock.advance(1000);
    game.update();
    expect(log).toEqual(['start', 'end']);
  });

  it('multiplies production only while open, and not offline', () => {
    const { clock, game, gold } = make();
    game.createObject('Festival').addComponent(LiveEvent, {
      startsAt: 10_000,
      durationMs: 10_000,
      effects: [{ resource: gold, multiplier: 3 }],
    });
    run(clock, game, 10_000);
    expect(gold.amount.toNumber()).toBeCloseTo(10, 0);
    run(clock, game, 10_000);
    expect(gold.amount.toNumber()).toBeGreaterThan(35);
    expect(gold.amount.toNumber()).toBeLessThan(45);
    const before = gold.amount.toNumber();
    run(clock, game, 10_000);
    expect(gold.amount.toNumber() - before).toBeCloseTo(10, 0);
  });

  it('is already open when the game starts inside a window, and cleans up on destroy', () => {
    const { clock, game, gold } = make(5000);
    const event = game.createObject('Festival').addComponent(LiveEvent, {
      startsAt: 0,
      durationMs: 100_000,
      effects: [{ resource: gold, multiplier: 2 }],
    });
    const log: string[] = [];
    event.started.addListener(() => log.push('start'));
    clock.advance(1000);
    game.update();
    expect(log).toEqual([]);
    expect(gold.amount.toNumber()).toBeCloseTo(2, 0);
    event.destroy();
    const before = gold.amount.toNumber();
    clock.advance(1000);
    game.update();
    expect(gold.amount.toNumber() - before).toBeCloseTo(1, 0);
  });

  it('is registered for scenes', () => {
    expect(idleComponents).toContain(LiveEvent);
  });
});
