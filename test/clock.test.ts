import { describe, expect, it } from 'vitest';
import { ManualClock, TimeGuard, systemClock } from '../src/core/clock/index.js';

describe('ManualClock', () => {
  it('starts at the given time and only moves on demand', () => {
    const clock = new ManualClock(1000);
    expect(clock.now()).toBe(1000);
    expect(clock.now()).toBe(1000);
    clock.advance(250);
    expect(clock.now()).toBe(1250);
    clock.set(5);
    expect(clock.now()).toBe(5);
  });

  it('defaults to zero', () => {
    expect(new ManualClock().now()).toBe(0);
  });
});

describe('systemClock', () => {
  it('returns wall-clock milliseconds', () => {
    const before = Date.now();
    const value = systemClock.now();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(Date.now());
  });
});

describe('TimeGuard', () => {
  it('reports normal progress', () => {
    const clock = new ManualClock(0);
    const guard = new TimeGuard(clock);
    clock.advance(16);
    expect(guard.sample()).toEqual({ delta: 16, status: 'ok' });
    clock.advance(0);
    expect(guard.sample()).toEqual({ delta: 0, status: 'ok' });
  });

  it('never returns a negative delta when the clock goes backwards', () => {
    const clock = new ManualClock(10_000);
    const guard = new TimeGuard(clock);
    clock.set(5_000);
    expect(guard.sample()).toEqual({ delta: 0, status: 'backward' });
    clock.advance(100);
    expect(guard.sample()).toEqual({ delta: 100, status: 'ok' });
  });

  it('flags forward jumps beyond the limit but keeps the raw gap', () => {
    const clock = new ManualClock(0);
    const guard = new TimeGuard(clock, { maxJumpMs: 1000 });
    clock.advance(1000);
    expect(guard.sample().status).toBe('ok');
    clock.advance(1001);
    expect(guard.sample()).toEqual({ delta: 1001, status: 'jump' });
  });

  it('never flags jumps by default', () => {
    const clock = new ManualClock(0);
    const guard = new TimeGuard(clock);
    clock.advance(1e12);
    expect(guard.sample().status).toBe('ok');
  });

  it('reset discards history', () => {
    const clock = new ManualClock(0);
    const guard = new TimeGuard(clock);
    clock.advance(500);
    guard.reset();
    clock.advance(20);
    expect(guard.sample().delta).toBe(20);
  });
});
