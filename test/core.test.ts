import fc from 'fast-check';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ManualClock,
  SaveCorruptedError,
  SaveVersionError,
  createCore,
  createSave,
  definePlugin,
} from '../src/core/index.js';
import type { CoreOptions, Scheduler } from '../src/core/index.js';

type Extra = Omit<CoreOptions, 'plugins' | 'clock'>;

const HOUR = 3_600_000;

interface CounterApi {
  readonly count: number;
  add(n: number): void;
}

/**
 * Tiny plugin: accumulates tick time and offline time into a counter.
 */
const counter = definePlugin<CounterApi, { bump: { count: number } }>('counter', (kernel) => {
  let count = 0;
  kernel.registerSystem({
    id: 'counter',
    tick: (dtMs) => {
      count += dtMs;
    },
    offline: (ms) => {
      count += ms;
    },
    serialize: () => count,
    deserialize: (data) => {
      if (data === 'explode') throw new Error('bad data');
      count = typeof data === 'number' ? data : 0;
    },
  });
  return {
    get count() {
      return count;
    },
    add(n) {
      count += n;
      kernel.emit('bump', { count });
    },
  };
});

function fakeScheduler(): { scheduler: Scheduler; fire: () => void } {
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
  };
}

function make(options: Extra = {}) {
  const clock = new ManualClock(1_000_000);
  const game = createCore({ plugins: [counter], clock, stepMs: 100, ...options });
  return { clock, game };
}

describe('createCore: plugins', () => {
  it('merges plugin APIs and types onto the game', () => {
    const { game } = make();
    expectTypeOf(game.count).toEqualTypeOf<number>();
    game.add(5);
    expect(game.count).toBe(5);
  });

  it('types plugin events on .on()', () => {
    const { game } = make();
    const seen: number[] = [];
    game.on('bump', ({ count }) => seen.push(count));
    game.add(2);
    expect(seen).toEqual([2]);
  });

  it('works with no plugins', () => {
    const game = createCore({ clock: new ManualClock(0) });
    expect(game.advance(1000)).toBe(10);
  });

  it('rejects duplicate plugins, duplicate systems and reserved names', () => {
    expect(() => createCore({ plugins: [counter, counter] })).toThrow(/installed twice/);
    const dupSystem = definePlugin('dup', (k) => {
      k.registerSystem({ id: 'counter' });
      return {};
    });
    expect(() => createCore({ plugins: [counter, dupSystem] })).toThrow(/already registered/);
    const clash = definePlugin('clash', () => ({ save: 1 }));
    expect(() => createCore({ plugins: [clash] })).toThrow(/reserves/);
  });

  it('lets a plugin require an earlier plugin and fails clearly otherwise', () => {
    const user = definePlugin('user', (k) => {
      const api = k.require<CounterApi>('counter');
      return { peek: () => api.count };
    });
    const game = createCore({ plugins: [counter, user], clock: new ManualClock(0) });
    game.add(3);
    expect(game.peek()).toBe(3);
    expect(() => createCore({ plugins: [user, counter] })).toThrow(/required but not installed/);
  });

  it('validates options', () => {
    expect(() => createCore({ version: 0 })).toThrow(RangeError);
    expect(() => createCore({ offline: { efficiency: 2 } })).toThrow(RangeError);
    expect(() => createCore({ stepMs: 0 })).toThrow(RangeError);
  });
});

describe('createCore: loop and determinism', () => {
  it('ticks systems in fixed steps driven by a fake clock', () => {
    const { clock, game } = make();
    const ticks: number[] = [];
    game.on('tick', ({ tick }) => ticks.push(tick));
    clock.advance(350);
    expect(game.update()).toBe(3);
    expect(game.count).toBe(300);
    expect(ticks).toEqual([1, 2, 3]);
    expect(game.tickCount).toBe(3);
  });

  it('is deterministic for identical scripts', () => {
    const run = (): number => {
      const { clock, game } = make();
      for (const ms of [17, 400, 3, 1000, 250]) {
        clock.advance(ms);
        game.update();
      }
      return game.count;
    };
    expect(run()).toBe(run());
  });

  it('start/stop emit events and drive the scheduler', () => {
    const fake = fakeScheduler();
    const { clock, game } = make({ scheduler: fake.scheduler });
    const log: string[] = [];
    game.on('start', () => log.push('start'));
    game.on('stop', () => log.push('stop'));
    game.start();
    game.start();
    clock.advance(200);
    fake.fire();
    expect(game.count).toBe(200);
    expect(game.running).toBe(true);
    game.stop();
    game.stop();
    expect(log).toEqual(['start', 'stop']);
  });
});

describe('createCore: saves', () => {
  it('round-trips state through an object, a JSON string and an export string', () => {
    const { game } = make();
    game.add(42);
    const save = game.save();
    game.add(100);
    game.load(save, { offline: false });
    expect(game.count).toBe(42);
    game.add(1);
    game.load(JSON.stringify(game.save()), { offline: false });
    expect(game.count).toBe(43);
    game.add(1);
    const text = game.exportSave();
    game.add(1000);
    game.importSave(text, { offline: false });
    expect(game.count).toBe(44);
  });

  it('reset restores defaults', () => {
    const { game } = make();
    game.add(9);
    game.reset();
    expect(game.count).toBe(0);
  });

  it('rejects corrupted saves without touching state', () => {
    const { game } = make();
    game.add(7);
    const save = game.save();
    const forged = { ...save, data: { counter: 1e9 } };
    expect(() => game.load(forged)).toThrow(SaveCorruptedError);
    expect(() => game.load('garbage')).toThrow(SaveCorruptedError);
    expect(() => game.importSave('@@@')).toThrow(SaveCorruptedError);
    expect(game.count).toBe(7);
  });

  it('is atomic: a failing deserializer rolls everything back', () => {
    const { game } = make();
    game.add(7);
    const poisoned = createSave(game.version, game.now(), { counter: 'explode' });
    expect(() => game.load(poisoned)).toThrow('bad data');
    expect(game.count).toBe(7);
  });

  it('migrates old saves and refuses future ones', () => {
    const v1 = make();
    v1.game.add(10);
    const old = v1.game.save();
    const { game } = make({
      version: 3,
      migrations: {
        1: (d) => ({ ...d, counter: Number(d['counter']) * 2 }),
        2: (d) => ({ ...d, counter: Number(d['counter']) + 1 }),
      },
    });
    game.load(old, { offline: false });
    expect(game.count).toBe(21);

    const future = make({ version: 9 }).game.save();
    expect(() => game.load(future)).toThrow(SaveVersionError);
  });

  it('emits saved and loaded events', () => {
    const { game } = make();
    const log: string[] = [];
    game.on('saved', () => log.push('saved'));
    game.on('loaded', () => log.push('loaded'));
    game.load(game.save(), { offline: false });
    expect(log).toEqual(['saved', 'loaded']);
  });
});

describe('createCore: offline', () => {
  function savedAfter(hours: number, options: Extra = {}) {
    const { clock, game } = make(options);
    game.add(100);
    const save = game.save();
    clock.advance(hours * HOUR);
    return { clock, game, save };
  }

  it('credits away-time on load', () => {
    const { game, save } = savedAfter(2);
    const report = game.load(save);
    expect(report).toEqual({ elapsedMs: 2 * HOUR, appliedMs: 2 * HOUR, status: 'applied' });
    expect(game.count).toBe(100 + 2 * HOUR);
  });

  it('credits nothing for zero time', () => {
    const { game, save } = savedAfter(0);
    game.load(save);
    expect(game.count).toBe(100);
  });

  it('credits nothing when the clock went backwards', () => {
    const { clock, game, save } = savedAfter(0);
    clock.advance(-5000);
    const reports: string[] = [];
    game.on('offline', (r) => reports.push(`${r.source}:${r.status}`));
    game.load(save);
    expect(game.count).toBe(100);
    expect(reports).toEqual(['load:backward']);
  });

  it('respects the maximum offline time and efficiency', () => {
    const { game, save } = savedAfter(48, { offline: { maxMs: 10 * HOUR, efficiency: 0.5 } });
    const report = game.load(save);
    expect(report?.status).toBe('capped');
    expect(game.count).toBe(100 + 5 * HOUR);
  });

  it('can be disabled globally or per load', () => {
    const a = savedAfter(1, { offline: { onLoad: false } });
    expect(a.game.load(a.save)).toBeUndefined();
    expect(a.game.count).toBe(100);
    const b = savedAfter(1);
    expect(b.game.load(b.save, { offline: false })).toBeUndefined();
    expect(b.game.count).toBe(100);
  });

  it('simulateOffline credits manually and emits an event', () => {
    const { game } = make({ offline: { efficiency: 0.5 } });
    const sources: string[] = [];
    game.on('offline', (r) => sources.push(r.source));
    game.simulateOffline(HOUR);
    expect(game.count).toBe(HOUR / 2);
    expect(sources).toEqual(['manual']);
  });

  it('credits time dropped by the catch-up cap as background offline time', () => {
    const { clock, game } = make({ maxCatchUpTicks: 10, offline: { efficiency: 0.5 } });
    const overflow: number[] = [];
    game.on('overflow', (o) => overflow.push(o.droppedMs));
    clock.advance(100_000);
    game.update();
    expect(overflow).toEqual([99_000]);
    expect(game.count).toBe(10 * 100 + 99_000 * 0.5);
  });

  it('background crediting can be turned off', () => {
    const { clock, game } = make({ maxCatchUpTicks: 10, offline: { background: false } });
    clock.advance(100_000);
    game.update();
    expect(game.count).toBe(1000);
  });
});

describe('createCore: dispose', () => {
  it('stops the loop and drops all listeners', () => {
    const fake = fakeScheduler();
    const { game } = make({ scheduler: fake.scheduler });
    const log: string[] = [];
    game.on('stop', () => log.push('stop'));
    game.on('bump', () => log.push('bump'));
    game.start();
    game.dispose();
    expect(game.running).toBe(false);
    game.add(1);
    expect(log).toEqual(['stop']);
  });
});

describe('createCore: untrusted input limits', () => {
  it('rejects oversized save strings before decoding them', () => {
    const { game } = make({ maxSaveChars: 50 });
    const big = game.exportSave();
    expect(big.length).toBeGreaterThan(50);
    expect(() => game.importSave(big)).toThrow(/too large/);
    expect(() => game.load(big)).toThrow(SaveCorruptedError);
    expect(() => make().game.load('x'.repeat(5_000_000))).toThrow(/not valid Base64/);
  });

  it('validates the limit', () => {
    expect(() => createCore({ maxSaveChars: 0 })).toThrow(RangeError);
    expect(() => createCore({ maxSaveChars: NaN })).toThrow(RangeError);
  });

  it('only ever throws SaveCorruptedError for arbitrary strings (fuzz)', () => {
    const { game } = make();
    game.add(5);
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.string({ unit: 'binary' }), fc.base64String(), fc.json()),
        (text) => {
          try {
            game.importSave(text, { offline: false });
          } catch (error) {
            expect(error).toBeInstanceOf(SaveCorruptedError);
          }
          expect(game.count).toBe(5);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('survives mutated real saves (fuzz)', () => {
    const { game } = make();
    game.add(5);
    const real = game.exportSave();
    fc.assert(
      fc.property(
        fc.nat(real.length - 1),
        fc.string({ minLength: 1, maxLength: 3 }),
        (at, junk) => {
          const mutated = real.slice(0, at) + junk + real.slice(at + 1);
          try {
            game.importSave(mutated, { offline: false });
          } catch (error) {
            expect(error).toBeInstanceOf(SaveCorruptedError);
          }
          expect(game.count).toBe(5);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('createCore: loading discards pending loop time', () => {
  it('does not tick the loaded state for time that passed before the load', () => {
    const { clock, game } = make();
    const save = game.save();
    clock.advance(1000);
    game.load(save, { offline: false });
    expect(game.update()).toBe(0);
    expect(game.count).toBe(0);
    clock.advance(200);
    expect(game.update()).toBe(2);
  });
});
