import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BigNum } from '@portojs/core';
import { Component, Game, ManualClock } from '@portojs/runtime';
import {
  Timeline,
  Tween,
  TweenSystem,
  Tweens,
  cubicBezier,
  easings,
  resolveEase,
  steps,
} from '../src/index.ts';
import type { EaseName } from '../src/index.ts';

const names = Object.keys(easings) as EaseName[];

describe('easings', () => {
  it('starts at 0 and ends at 1', () => {
    for (const name of names) {
      expect(easings[name](0), name).toBeCloseTo(0, 9);
      expect(easings[name](1), name).toBeCloseTo(1, 9);
    }
  });

  it('does not overshoot for the monotonic families', () => {
    const monotonic = names.filter((n) => !/back|elastic|bounce/.test(n));
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (t) => {
        for (const name of monotonic) {
          const v = easings[name](t);
          expect(v, name).toBeGreaterThanOrEqual(-1e-9);
          expect(v, name).toBeLessThanOrEqual(1 + 1e-9);
        }
      }),
    );
  });

  it('keeps the monotonic families non-decreasing', () => {
    const monotonic = names.filter((n) => !/back|elastic|bounce/.test(n));
    for (const name of monotonic) {
      let previous = -Infinity;
      for (let i = 0; i <= 100; i++) {
        const v = easings[name](i / 100);
        expect(v, name).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = v;
      }
    }
  });

  it('has inOut curves that cross the middle at one half', () => {
    for (const name of names.filter((n) => /InOut$/.test(n))) {
      expect(easings[name](0.5), name).toBeCloseTo(0.5, 6);
    }
  });

  it('overshoots for back and elastic as designed', () => {
    expect(easings.backOut(0.5)).toBeGreaterThan(0.5);
    expect(easings.backIn(0.2)).toBeLessThan(0);
    expect(Math.max(...[0.6, 0.7, 0.8].map(easings.elasticOut))).toBeGreaterThan(1);
  });

  it('resolves names and rejects unknown ones', () => {
    expect(resolveEase('quadIn')(0.5)).toBe(0.25);
    const custom = (t: number): number => t;
    expect(resolveEase(custom)).toBe(custom);
    expect(() => resolveEase('nope' as EaseName)).toThrow(RangeError);
  });

  it('builds cubic-bezier curves like CSS', () => {
    const linearish = cubicBezier(0, 0, 1, 1);
    for (const t of [0, 0.25, 0.5, 0.9, 1]) expect(linearish(t)).toBeCloseTo(t, 5);
    const easeInOut = cubicBezier(0.42, 0, 0.58, 1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    expect(cubicBezier(0.1, 0.9, 0.9, 0.1)(0.5)).toBeCloseTo(0.5, 5);
    expect(() => cubicBezier(2, 0, 0.5, 1)).toThrow(RangeError);
  });

  it('builds step curves', () => {
    const three = steps(3);
    expect([three(0), three(0.34), three(0.7), three(1)]).toEqual([0, 1 / 3, 2 / 3, 1]);
    expect(() => steps(0)).toThrow(RangeError);
    expect(() => steps(1.5)).toThrow(RangeError);
  });
});

describe('Tween', () => {
  it('moves properties linearly and lands exactly on the end', () => {
    const box = { x: 0, y: 10 };
    const tween = new Tween(box, { x: 100, y: 0 }, { duration: 1 });
    tween.update(0.25);
    expect(box).toEqual({ x: 25, y: 7.5 });
    tween.update(10);
    expect(box).toEqual({ x: 100, y: 0 });
    expect(tween.isComplete).toBe(true);
  });

  it('waits for the delay', () => {
    const box = { x: 0 };
    const tween = new Tween(box, { x: 10 }, { duration: 1, delay: 0.5 });
    tween.update(0.4);
    expect(box.x).toBe(0);
    tween.update(0.6);
    expect(box.x).toBeCloseTo(1, 9);
    expect(tween.duration).toBe(1.5);
  });

  it('reads start values when it starts, not when it is created', () => {
    const box = { x: 0 };
    const tween = new Tween(box, { x: 10 }, { duration: 1, delay: 1 });
    box.x = 100;
    tween.update(1.5);
    expect(box.x).toBeCloseTo(55, 9);
  });

  it('repeats and plays yoyo runs backwards', () => {
    const box = { x: 0 };
    const iterations: number[] = [];
    const tween = new Tween(
      box,
      { x: 10 },
      { duration: 1, repeat: 2, yoyo: true, onRepeat: (i) => iterations.push(i) },
    );
    tween.update(1.5);
    expect(box.x).toBeCloseTo(5, 9);
    tween.update(1);
    expect(box.x).toBeCloseTo(5, 9);
    tween.update(1);
    expect(box.x).toBe(10);
    expect(iterations).toEqual([1, 2]);
    expect(tween.isComplete).toBe(true);
    expect(tween.duration).toBe(3);
  });

  it('ends back at the start when a yoyo has an odd number of runs', () => {
    const box = { x: 0 };
    const tween = new Tween(box, { x: 10 }, { duration: 1, repeat: 1, yoyo: true });
    tween.update(5);
    expect(box.x).toBe(0);
  });

  it('loops forever with repeat Infinity and never completes', () => {
    const box = { x: 0 };
    const tween = new Tween(box, { x: 10 }, { duration: 1, repeat: Infinity });
    tween.update(1000.5);
    expect(box.x).toBeCloseTo(5, 6);
    expect(tween.isComplete).toBe(false);
    expect(tween.duration).toBe(Infinity);
    expect(() => tween.complete()).toThrow(RangeError);
  });

  it('applies a curve', () => {
    const box = { x: 0 };
    new Tween(box, { x: 100 }, { duration: 1, ease: 'quadIn' }).seek(0.5);
    expect(box.x).toBe(25);
  });

  it('handles zero duration by jumping to the end at once', () => {
    const box = { x: 0 };
    let done = 0;
    const tween = new Tween(box, { x: 5 }, { duration: 0, onComplete: () => done++ });
    tween.update(0);
    expect(box.x).toBe(5);
    expect(done).toBe(1);
    tween.update(1);
    expect(done).toBe(1);
  });

  it('tweens from given values to the current ones', () => {
    const box = { alpha: 1 };
    const tween = new Tween(box, { alpha: 0 }, { duration: 1 }, true);
    tween.update(0);
    tween.seek(0);
    expect(box.alpha).toBe(0);
    tween.update(0.5);
    expect(box.alpha).toBeCloseTo(0.5, 9);
    tween.update(1);
    expect(box.alpha).toBe(1);
  });

  it('interpolates BigNum values', () => {
    const wallet = { gold: BigNum.from(0) };
    const tween = new Tween(wallet, { gold: BigNum.from('1e30') }, { duration: 1 });
    tween.update(0.5);
    expect(wallet.gold.toNumber()).toBeCloseTo(5e29, -20);
    tween.update(1);
    expect(wallet.gold.eq('1e30')).toBe(true);
  });

  it('rejects a property that is not of the tweened kind', () => {
    const box = { x: 0 };
    const tween = new Tween(box, { x: BigNum.from(1) } as never, { duration: 1 });
    expect(() => tween.update(0.1)).toThrow(TypeError);
  });

  it('pauses, resumes and kills', async () => {
    const box = { x: 0 };
    const tween = new Tween(box, { x: 10 }, { duration: 1 });
    tween.pause();
    tween.update(0.5);
    expect(box.x).toBe(0);
    expect(tween.isPaused).toBe(true);
    tween.resume();
    tween.update(0.5);
    expect(box.x).toBe(5);
    tween.kill();
    tween.kill();
    tween.update(1);
    expect(box.x).toBe(5);
    expect(tween.isKilled).toBe(true);
    expect(await tween.finished).toBe(false);
  });

  it('calls onUpdate and onComplete and resolves its promise', async () => {
    const box = { x: 0 };
    const progress: number[] = [];
    let completed = 0;
    const tween = new Tween(
      box,
      { x: 1 },
      { duration: 1, onUpdate: (p) => progress.push(p), onComplete: () => completed++ },
    );
    const done = tween.finished;
    tween.update(0.5);
    tween.update(0.5);
    expect(progress).toEqual([0.5, 1]);
    expect(completed).toBe(1);
    expect(await done).toBe(true);
    expect(await tween.finished).toBe(true);
  });

  it('can be completed immediately and seeks', () => {
    const box = { x: 0 };
    const tween = new Tween(box, { x: 8 }, { duration: 2 });
    tween.seek(1);
    expect(box.x).toBe(4);
    tween.complete();
    expect(box.x).toBe(8);
    expect(() => tween.seek(-1)).toThrow(RangeError);
  });

  it('validates its options', () => {
    const box = { x: 0 };
    expect(() => new Tween(box, { x: 1 }, { duration: -1 })).toThrow(RangeError);
    expect(() => new Tween(box, { x: 1 }, { duration: NaN })).toThrow(RangeError);
    expect(() => new Tween(box, { x: 1 }, { duration: 1, delay: -1 })).toThrow(RangeError);
    expect(() => new Tween(box, { x: 1 }, { duration: 1, repeat: 1.5 })).toThrow(RangeError);
    expect(() => new Tween(box, { x: 1 }, { duration: 0, repeat: Infinity })).toThrow(RangeError);
  });

  it('reaches the same state whatever the step size', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), (parts) => {
        const box = { x: 0 };
        const tween = new Tween(box, { x: 100 }, { duration: 2, ease: 'cubicInOut' });
        for (let i = 0; i < parts; i++) tween.update(1 / parts);
        const reference = { x: 0 };
        new Tween(reference, { x: 100 }, { duration: 2, ease: 'cubicInOut' }).seek(1);
        expect(box.x).toBeCloseTo(reference.x, 6);
      }),
    );
  });
});

describe('Timeline', () => {
  it('plays tweens in sequence, in parallel and with waits and callbacks', () => {
    const box = { x: 0, y: 0 };
    const log: string[] = [];
    const timeline = new Timeline()
      .to(box, { x: 10 }, { duration: 1 })
      .to(box, { y: 20 }, { duration: 2 }, '<')
      .wait(1)
      .call(() => log.push('called'))
      .label('end')
      .to(box, { x: 0 }, { duration: 1 });
    expect(timeline.duration).toBe(4);

    timeline.update(1);
    expect(box).toEqual({ x: 10, y: 10 });
    timeline.update(1.5);
    expect(box.y).toBe(20);
    expect(log).toEqual([]);
    timeline.update(0.5);
    expect(log).toEqual(['called']);
    timeline.update(0.5);
    expect(box.x).toBeCloseTo(5, 9);
    timeline.update(5);
    expect(box.x).toBe(0);
    expect(timeline.isComplete).toBe(true);
    expect(log).toEqual(['called']);
  });

  it('supports absolute times and labels', () => {
    const box = { x: 0, y: 0 };
    const timeline = new Timeline()
      .label('start', 0)
      .to(box, { x: 10 }, { duration: 1 }, 2)
      .to(box, { y: 10 }, { duration: 1 }, 'start');
    timeline.update(1);
    expect(box).toEqual({ x: 0, y: 10 });
    timeline.update(1.5);
    expect(box.x).toBeCloseTo(5, 9);
    expect(timeline.duration).toBe(3);
    expect(() => timeline.add(new Tween(box, { x: 1 }, { duration: 1 }), 'missing')).toThrow(
      RangeError,
    );
    expect(() => timeline.add(new Tween(box, { x: 1 }, { duration: 1 }), -1)).toThrow(RangeError);
    expect(() => timeline.wait(-1)).toThrow(RangeError);
  });

  it('lets a from-tween start from the given value', () => {
    const box = { x: 5 };
    const timeline = new Timeline().from(box, { x: 0 }, { duration: 1 });
    timeline.update(0.5);
    expect(box.x).toBeCloseTo(2.5, 9);
  });

  it('nests timelines and kills its children', () => {
    const box = { x: 0 };
    const inner = new Timeline().to(box, { x: 10 }, { duration: 1 });
    const outer = new Timeline().add(inner).wait(1);
    outer.update(0.5);
    expect(box.x).toBe(5);
    outer.kill();
    expect(inner.isKilled).toBe(true);
    outer.update(5);
    expect(box.x).toBe(5);
  });
});

describe('Tweens', () => {
  it('advances and drops finished animations', () => {
    const tweens = new Tweens();
    const box = { x: 0 };
    tweens.to(box, { x: 10 }, { duration: 1 });
    tweens.from(box, { x: 0 }, { duration: 2 });
    expect(tweens.size).toBe(2);
    tweens.update(1);
    expect(tweens.size).toBe(1);
    tweens.update(1);
    expect(tweens.size).toBe(0);
  });

  it('kills the tweens of one target or all of them', () => {
    const tweens = new Tweens();
    const a = { x: 0 };
    const b = { x: 0 };
    const ta = tweens.to(a, { x: 1 }, { duration: 1 });
    const tb = tweens.to(b, { x: 1 }, { duration: 1 });
    tweens.killAll(a);
    expect(ta.isKilled).toBe(true);
    expect(tb.isKilled).toBe(false);
    expect(tweens.size).toBe(1);
    tweens.killAll();
    expect(tb.isKilled).toBe(true);
    expect(tweens.size).toBe(0);
  });

  it('creates timelines it plays', () => {
    const tweens = new Tweens();
    const box = { x: 0 };
    tweens.timeline().to(box, { x: 4 }, { duration: 2 });
    tweens.update(1);
    expect(box.x).toBe(2);
  });
});

describe('TweenSystem in a game', () => {
  class Waiter extends Component {
    static override typeId = 'Waiter';
    reached = false;

    override start(): void {
      this.startCoroutine(this.run());
    }

    private *run(): Generator<ReturnType<Tween['untilFinished']>> {
      const system = this.gameObject.getComponent(TweenSystem);
      yield system?.tweens.to({ v: 0 }, { v: 1 }, { duration: 0.5 }).untilFinished() as never;
      this.reached = true;
    }
  }

  it('follows game time, pause and timeScale', () => {
    const game = new Game({ clock: new ManualClock(0), stepMs: 100 });
    const object = game.createObject('Tweens');
    const system = object.addComponent(TweenSystem);
    const box = { x: 0 };
    system.tweens.to(box, { x: 10 }, { duration: 1 });

    game.advance(500);
    expect(box.x).toBeCloseTo(5, 9);
    game.pause();
    game.advance(1000);
    expect(box.x).toBeCloseTo(5, 9);
    game.resume();
    game.timeScale = 0.5;
    game.advance(500);
    expect(box.x).toBeCloseTo(7.5, 9);
  });

  it('can be awaited from a coroutine and is killed on destroy', () => {
    const game = new Game({ clock: new ManualClock(0), stepMs: 100 });
    const object = game.createObject('Tweens');
    object.addComponent(TweenSystem);
    const waiter = object.addComponent(Waiter);
    game.advance(300);
    expect(waiter.reached).toBe(false);
    game.advance(500);
    expect(waiter.reached).toBe(true);

    const box = { x: 0 };
    const tween = object.getComponent(TweenSystem)?.tweens.to(box, { x: 1 }, { duration: 9 });
    object.destroy();
    expect(tween?.isKilled).toBe(true);
  });
});
