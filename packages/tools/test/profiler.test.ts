import { ManualClock } from '@portojs/core';
import type { JsonValue } from '@portojs/core';
import { Component, Game } from '@portojs/runtime';
import { describe, expect, it } from 'vitest';
import { Profiler, reloadWithState } from '../src/index.ts';

function setup() {
  const clock = new ManualClock(0);
  const game = new Game({ clock, stepMs: 100 });
  const cost = { fixed: 0, frame: 0 };
  let time = 0;
  const now = (): number => time;
  class Mover extends Component {
    static override typeId = 'Mover';
    override fixedUpdate(): void {
      time += cost.fixed;
    }
    override update(): void {
      time += cost.frame;
    }
  }
  class Light extends Component {
    override fixedUpdate(): void {
      time += 0.5;
    }
  }
  return { game, clock, cost, now, Mover, Light, bump: (ms: number) => void (time += ms) };
}

describe('Profiler', () => {
  it('measures calls, totals, averages and maxima per component and phase', () => {
    const { game, clock, cost, now, Mover, Light } = setup();
    game.createObject('a').addComponent(Mover);
    game.createObject('b').addComponent(Light);
    const profiler = new Profiler({ now }).attach(game);
    cost.fixed = 2;
    cost.frame = 1;
    clock.advance(100);
    game.update();
    cost.fixed = 4;
    clock.advance(100);
    game.update();
    const report = profiler.report();
    expect(report[0]).toMatchObject({ type: 'Mover', phase: 'fixedUpdate', calls: 2, total: 6, average: 3, max: 4 });
    const light = report.find((entry) => entry.type === 'Light');
    expect(light).toMatchObject({ phase: 'fixedUpdate', calls: 2, total: 1 });
    const update = report.find((entry) => entry.phase === 'update');
    expect(update).toMatchObject({ type: 'Mover', calls: 2, total: 2 });
  });

  it('keeps a history of step times and memory samples', () => {
    const { game, clock, cost, now, Mover } = setup();
    game.createObject('a').addComponent(Mover);
    let memory = 1000;
    const profiler = new Profiler({ now, history: 2, memory: () => (memory += 10) }).attach(game);
    cost.fixed = 3;
    for (let i = 0; i < 3; i++) {
      clock.advance(100);
      game.update();
    }
    const frames = profiler.frames();
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ fixedMs: 3, memory: 1020 });
    expect(frames[1]?.memory).toBe(1030);
  });

  it('picks up components created later and survives errors', () => {
    const { game, clock, now, Light } = setup();
    class Broken extends Component {
      override fixedUpdate(): void {
        throw new Error('boom');
      }
    }
    const profiler = new Profiler({ now }).attach(game);
    game.createObject('late').addComponent(Light);
    clock.advance(100);
    game.update();
    expect(profiler.report()).toHaveLength(0);
    clock.advance(100);
    game.update();
    expect(profiler.report()[0]).toMatchObject({ type: 'Light', calls: 1 });
    const broken = game.createObject('x').addComponent(Broken);
    profiler.sync();
    expect(() => broken.fixedUpdate()).toThrow('boom');
    expect(profiler.report().find((entry) => entry.type === 'Broken')?.calls).toBe(1);
  });

  it('detaches cleanly and can reset', () => {
    const { game, clock, now, Mover } = setup();
    const mover = game.createObject('a').addComponent(Mover);
    const original = Mover.prototype.fixedUpdate;
    const profiler = new Profiler({ now }).attach(game);
    expect(Object.hasOwn(mover, 'fixedUpdate')).toBe(true);
    clock.advance(100);
    game.update();
    profiler.detach();
    expect(profiler.attached).toBe(false);
    expect(Object.hasOwn(mover, 'fixedUpdate')).toBe(false);
    expect(mover.fixedUpdate).toBe(original);
    clock.advance(100);
    game.update();
    expect(profiler.report()[0]?.calls).toBe(1);
    profiler.reset();
    expect(profiler.report()).toEqual([]);
    expect(profiler.frames()).toEqual([]);
  });
});

describe('reloadWithState', () => {
  class CounterV1 extends Component {
    static override typeId = 'Counter';
    value = 0;
    override onSave(): JsonValue {
      return { value: this.value };
    }
    override onLoad(data?: unknown): void {
      this.value = typeof data === 'object' && data !== null && 'value' in data ? Number(data.value) : 0;
    }
  }
  class CounterV2 extends CounterV1 {
    label = 'v2';
  }

  it('recreates the objects with new classes and keeps their state', () => {
    const game = new Game({ clock: new ManualClock(0), stepMs: 100 });
    const first = game.createObject('Counter').addComponent(CounterV1);
    first.value = 42;
    const replaced = reloadWithState(game, (g) => void g.createObject('Counter').addComponent(CounterV2));
    expect(replaced).toBe(1);
    const next = game.find('Counter')?.getComponent(CounterV2);
    expect(next).toBeDefined();
    expect(next?.value).toBe(42);
    expect(next).not.toBe(first);
    expect(game.objects).toHaveLength(1);
  });

  it('keeps children out of the root count and does not credit offline time', () => {
    const clock = new ManualClock(0);
    const game = new Game({ clock, stepMs: 100 });
    const parent = game.createObject('P');
    game.createObject('C', { parent });
    const replaced = reloadWithState(game, (g) => {
      const p = g.createObject('P');
      g.createObject('C', { parent: p });
    });
    expect(replaced).toBe(1);
    expect(game.objects).toHaveLength(2);
  });
});
