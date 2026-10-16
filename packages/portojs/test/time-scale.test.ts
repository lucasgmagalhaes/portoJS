import { describe, expect, it } from 'vitest';
import { Component, Game, ManualClock, WaitForSeconds } from '../src/index.ts';

class Accumulator extends Component {
  static override typeId = 'Accumulator';
  total = 0;
  coroutineDone = false;

  override fixedUpdate(deltaTime: number): void {
    this.total += deltaTime;
  }

  override start(): void {
    this.startCoroutine(this.wait());
  }

  private *wait(): Generator<WaitForSeconds> {
    yield new WaitForSeconds(1);
    this.coroutineDone = true;
  }
}

function make(): { game: Game; clock: ManualClock; acc: Accumulator } {
  const clock = new ManualClock(0);
  const game = new Game({ clock, stepMs: 100 });
  const acc = game.createObject('A').addComponent(Accumulator);
  return { game, clock, acc };
}

describe('timeScale', () => {
  it('scales the delta that fixedUpdate receives', () => {
    const { game, acc } = make();
    game.timeScale = 0.5;
    game.advance(1000);
    expect(acc.total).toBeCloseTo(0.5, 9);
    expect(game.time.deltaTime).toBeCloseTo(0.05, 12);
    expect(game.time.unscaledDeltaTime).toBeCloseTo(0.1, 12);
    expect(game.time.scaledTime).toBeCloseTo(0.5, 9);
    expect(game.time.time).toBeCloseTo(1, 9);
  });

  it('runs faster than real time above 1', () => {
    const { game, acc } = make();
    game.timeScale = 3;
    game.advance(1000);
    expect(acc.total).toBeCloseTo(3, 9);
  });

  it('slows coroutines too', () => {
    const { game, acc } = make();
    game.timeScale = 0.5;
    game.advance(1500);
    expect(acc.coroutineDone).toBe(false);
    game.advance(600);
    expect(acc.coroutineDone).toBe(true);
  });

  it('rejects negative and non-finite values', () => {
    const { game } = make();
    expect(() => (game.timeScale = -1)).toThrow(RangeError);
    expect(() => (game.timeScale = Infinity)).toThrow(RangeError);
    expect(() => (game.timeScale = NaN)).toThrow(RangeError);
    expect(game.timeScale).toBe(1);
  });

  it('stops time at zero but keeps ticking', () => {
    const { game, acc } = make();
    const ticks: number[] = [];
    game.on('tick', ({ tick }) => ticks.push(tick));
    game.timeScale = 0;
    game.advance(300);
    expect(acc.total).toBe(0);
    expect(ticks).toEqual([1, 2, 3]);
  });
});

describe('pause and resume', () => {
  it('freezes updates, coroutines and timers, and emits events', () => {
    const { game, acc } = make();
    const events: string[] = [];
    game.on('pause', () => events.push('pause'));
    game.on('resume', () => events.push('resume'));
    let fired = 0;
    game.setTimeout(() => fired++, 500);

    game.advance(200);
    game.pause();
    game.pause();
    expect(game.paused).toBe(true);
    game.advance(5000);
    expect(acc.total).toBeCloseTo(0.2, 9);
    expect(fired).toBe(0);
    expect(acc.coroutineDone).toBe(false);

    game.resume();
    game.resume();
    expect(game.paused).toBe(false);
    game.advance(300);
    expect(fired).toBe(1);
    expect(events).toEqual(['pause', 'resume']);
  });
});

describe('game timers', () => {
  it('fires a timeout once, after its delay in game time', () => {
    const { game } = make();
    const log: number[] = [];
    game.setTimeout(() => log.push(game.time.tickCount), 250);
    game.advance(200);
    expect(log).toEqual([]);
    game.advance(500);
    expect(log).toEqual([3]);
  });

  it('repeats an interval until cancelled, also from its own callback', () => {
    const { game } = make();
    let count = 0;
    const timer = game.setInterval(() => {
      count++;
      if (count === 3) timer.cancel();
    }, 100);
    game.advance(2000);
    expect(count).toBe(3);
    expect(timer.isCancelled).toBe(true);
  });

  it('runs due timers in order, including several per step', () => {
    const { game } = make();
    const order: string[] = [];
    game.setTimeout(() => order.push('b'), 150);
    game.setTimeout(() => order.push('a'), 50);
    game.setTimeout(() => order.push('c'), 150);
    game.setInterval(() => order.push('i'), 40);
    game.advance(100);
    expect(order).toEqual(['i', 'a', 'i']);
    game.advance(100);
    expect(order.filter((x) => x !== 'i')).toEqual(['a', 'b', 'c']);
  });

  it('follows timeScale', () => {
    const { game } = make();
    game.timeScale = 2;
    let fired = false;
    game.setTimeout(() => (fired = true), 1000);
    game.advance(500);
    expect(fired).toBe(true);
  });

  it('can be cancelled before it fires and is dropped on dispose', () => {
    const { game } = make();
    let fired = 0;
    game.setTimeout(() => fired++, 100).cancel();
    game.setTimeout(() => fired++, 100);
    game.dispose();
    game.advance(500);
    expect(fired).toBe(0);
  });

  it('validates its arguments', () => {
    const { game } = make();
    expect(() => game.setTimeout(() => undefined, -1)).toThrow(RangeError);
    expect(() => game.setTimeout(() => undefined, NaN)).toThrow(RangeError);
    expect(() => game.setInterval(() => undefined, 0)).toThrow(RangeError);
    expect(() => game.setTimeout(() => undefined, 0)).not.toThrow();
  });
});
