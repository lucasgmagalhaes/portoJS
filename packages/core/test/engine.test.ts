import { describe, expect, it, vi } from 'vitest';
import { ManualClock } from '../src/index.js';
import { Engine, createIntervalScheduler } from '../src/index.js';
import type { Scheduler } from '../src/index.js';

/**
 * Scheduler that never fires by itself; the test pumps it.
 */
function fakeScheduler(): { scheduler: Scheduler; fire: () => void; active: () => boolean } {
  let callback: (() => void) | undefined;
  return {
    scheduler: {
      start(cb) {
        callback = cb;
        return () => {
          callback = undefined;
        };
      },
    },
    fire: () => callback?.(),
    active: () => callback !== undefined,
  };
}

function setup(options: { stepMs?: number; maxCatchUpTicks?: number } = {}) {
  const clock = new ManualClock(0);
  const steps: number[] = [];
  const dropped: number[] = [];
  const engine = new Engine({
    clock,
    onStep: (dt) => steps.push(dt),
    onOverflow: (ms) => dropped.push(ms),
    ...options,
  });
  return { clock, engine, steps, dropped };
}

describe('Engine fixed timestep', () => {
  it('runs one step per full stepMs and keeps the remainder', () => {
    const { clock, engine, steps } = setup({ stepMs: 100 });
    clock.advance(250);
    expect(engine.update()).toBe(2);
    expect(steps).toEqual([100, 100]);
    expect(engine.pending).toBe(50);
    clock.advance(50);
    expect(engine.update()).toBe(1);
    expect(engine.pending).toBe(0);
    expect(engine.stepCount).toBe(3);
  });

  it('is independent of update frequency', () => {
    const a = setup({ stepMs: 100 });
    const b = setup({ stepMs: 100 });
    for (let i = 0; i < 1000; i++) {
      a.clock.advance(7);
      a.engine.update();
    }
    for (let i = 0; i < 21; i++) {
      b.clock.advance(333);
      b.engine.update();
    }
    b.clock.advance(7);
    b.engine.update();
    expect(a.engine.stepCount).toBe(70);
    expect(b.engine.stepCount).toBe(70);
  });

  it('runs nothing when no time passed', () => {
    const { engine, steps } = setup();
    expect(engine.update()).toBe(0);
    expect(steps).toEqual([]);
  });

  it('ignores a clock that went backwards', () => {
    const { clock, engine } = setup({ stepMs: 100 });
    clock.advance(100);
    engine.update();
    clock.set(-5000);
    expect(engine.update()).toBe(0);
    clock.advance(100);
    expect(engine.update()).toBe(1);
  });

  it('advance() simulates time without the clock or the cap', () => {
    const { engine, steps } = setup({ stepMs: 100, maxCatchUpTicks: 2 });
    expect(engine.advance(1050)).toBe(10);
    expect(steps).toHaveLength(10);
    expect(engine.pending).toBe(50);
    expect(() => engine.advance(-1)).toThrow(RangeError);
    expect(() => engine.advance(NaN)).toThrow(RangeError);
  });
});

describe('Engine catch-up limit', () => {
  it('caps steps per update and reports the dropped time', () => {
    const { clock, engine, steps, dropped } = setup({ stepMs: 100, maxCatchUpTicks: 5 });
    clock.advance(10_000);
    expect(engine.update()).toBe(5);
    expect(steps).toHaveLength(5);
    expect(dropped).toEqual([9_500]);
    expect(engine.pending).toBe(0);
  });

  it('keeps sub-step remainder when overflowing', () => {
    const { clock, engine, dropped } = setup({ stepMs: 100, maxCatchUpTicks: 5 });
    clock.advance(10_030);
    engine.update();
    expect(dropped).toEqual([9_500]);
    expect(engine.pending).toBe(30);
  });

  it('does not report overflow at exactly the cap', () => {
    const { clock, engine, dropped } = setup({ stepMs: 100, maxCatchUpTicks: 5 });
    clock.advance(500);
    expect(engine.update()).toBe(5);
    expect(dropped).toEqual([]);
  });
});

describe('Engine lifecycle', () => {
  it('start/stop drive the scheduler and are idempotent', () => {
    const fake = fakeScheduler();
    const clock = new ManualClock(0);
    const steps: number[] = [];
    const engine = new Engine({ clock, scheduler: fake.scheduler, onStep: (dt) => steps.push(dt) });
    expect(engine.running).toBe(false);
    engine.start();
    engine.start();
    expect(engine.running).toBe(true);
    clock.advance(300);
    fake.fire();
    expect(steps).toHaveLength(3);
    engine.stop();
    engine.stop();
    expect(engine.running).toBe(false);
    expect(fake.active()).toBe(false);
  });

  it('time elapsed before start() is ignored', () => {
    const fake = fakeScheduler();
    const clock = new ManualClock(0);
    const engine = new Engine({ clock, scheduler: fake.scheduler, onStep: () => undefined });
    clock.advance(5000);
    engine.start();
    fake.fire();
    expect(engine.stepCount).toBe(0);
  });

  it('is not re-entrant: update() inside a step does nothing', () => {
    const clock = new ManualClock(0);
    let inner = -1;
    const engine: Engine = new Engine({
      clock,
      stepMs: 100,
      onStep: () => {
        clock.advance(500);
        inner = engine.update();
      },
    });
    clock.advance(100);
    expect(engine.update()).toBe(1);
    expect(inner).toBe(0);
  });

  it('stays consistent when a step throws', () => {
    const clock = new ManualClock(0);
    let calls = 0;
    const engine = new Engine({
      clock,
      stepMs: 100,
      onStep: () => {
        calls++;
        if (calls === 2) throw new Error('boom');
      },
    });
    clock.advance(300);
    expect(() => engine.update()).toThrow('boom');
    expect(engine.pending).toBe(100);
    expect(engine.update()).toBe(1);
  });

  it('validates options', () => {
    const noop = (): void => undefined;
    expect(() => new Engine({ onStep: noop, stepMs: 0 })).toThrow(RangeError);
    expect(() => new Engine({ onStep: noop, stepMs: -1 })).toThrow(RangeError);
    expect(() => new Engine({ onStep: noop, maxCatchUpTicks: 0 })).toThrow(RangeError);
    expect(() => new Engine({ onStep: noop, pollMs: Infinity })).toThrow(RangeError);
  });
});

describe('Engine determinism', () => {
  it('produces identical step sequences for identical clock scripts', () => {
    const script = [13, 250, 0, 999, 41, 7, 100, 3000, 1];
    const run = (): number[] => {
      const { clock, engine, steps } = setup({ stepMs: 50, maxCatchUpTicks: 20 });
      for (const ms of script) {
        clock.advance(ms);
        engine.update();
      }
      return [engine.stepCount, engine.pending, steps.length];
    };
    expect(run()).toEqual(run());
  });
});

describe('createIntervalScheduler', () => {
  it('unrefs the timer only when asked', () => {
    const unref = vi.fn();
    const spy = vi
      .spyOn(globalThis, 'setInterval')
      .mockReturnValue({ unref } as unknown as ReturnType<typeof setInterval>);
    const clear = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined);
    try {
      createIntervalScheduler().start(() => undefined, 10)();
      expect(unref).not.toHaveBeenCalled();
      const stop = createIntervalScheduler({ unref: true }).start(() => undefined, 10);
      expect(unref).toHaveBeenCalledTimes(1);
      stop();
      expect(clear).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      clear.mockRestore();
    }
  });
});
