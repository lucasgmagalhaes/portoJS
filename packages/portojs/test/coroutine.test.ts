import { describe, expect, it } from 'vitest';
import {
  Component,
  Game,
  ManualClock,
  WaitForSeconds,
  WaitUntil,
  WaitWhile,
  YieldInstruction,
} from '../src/index.js';
import type { CoroutineYield } from '../src/index.js';

class Runner extends Component {
  log: string[] = [];
  flag = false;

  *countTo(n: number): Generator<CoroutineYield> {
    for (let i = 1; i <= n; i++) {
      this.log.push(`n${i}`);
      yield undefined;
    }
  }

  *sleepy(): Generator<CoroutineYield> {
    this.log.push('a');
    yield new WaitForSeconds(1);
    this.log.push('b');
    yield new WaitForSeconds(0.5);
    this.log.push('c');
  }

  *gated(): Generator<CoroutineYield> {
    yield new WaitUntil(() => this.flag);
    this.log.push('until');
    yield new WaitWhile(() => this.flag);
    this.log.push('while');
  }

  *parent(): Generator<CoroutineYield> {
    const child = this.startCoroutine(this.sleepy());
    yield child;
    this.log.push('parent');
  }

  *boom(): Generator<CoroutineYield> {
    yield undefined;
    throw new Error('boom');
  }
}

function make() {
  const game = new Game({ clock: new ManualClock(0), stepMs: 100 });
  const runner = game.createObject('R').addComponent(Runner);
  return { game, runner };
}

describe('coroutines', () => {
  it('runs the first segment immediately and one segment per step after a bare yield', () => {
    const { game, runner } = make();
    const co = runner.startCoroutine(runner.countTo(3));
    expect(runner.log).toEqual(['n1']);
    expect(co.isRunning).toBe(true);
    game.advance(100);
    expect(runner.log).toEqual(['n1', 'n2']);
    game.advance(200);
    expect(runner.log).toEqual(['n1', 'n2', 'n3']);
    expect(co.isRunning).toBe(false);
  });

  it('WaitForSeconds waits game time', () => {
    const { game, runner } = make();
    runner.startCoroutine(runner.sleepy());
    game.advance(900);
    expect(runner.log).toEqual(['a']);
    game.advance(100);
    expect(runner.log).toEqual(['a', 'b']);
    game.advance(500);
    expect(runner.log).toEqual(['a', 'b', 'c']);
  });

  it('rejects a negative wait', () => {
    expect(() => new WaitForSeconds(-1)).toThrow(RangeError);
  });

  it('WaitUntil and WaitWhile check a condition every step', () => {
    const { game, runner } = make();
    runner.startCoroutine(runner.gated());
    game.advance(300);
    expect(runner.log).toEqual([]);
    runner.flag = true;
    game.advance(100);
    expect(runner.log).toEqual(['until']);
    game.advance(100);
    expect(runner.log).toEqual(['until']);
    runner.flag = false;
    game.advance(100);
    expect(runner.log).toEqual(['until', 'while']);
  });

  it('yielding a coroutine waits for it to finish', () => {
    const { game, runner } = make();
    runner.startCoroutine(runner.parent());
    game.advance(1400);
    expect(runner.log).toEqual(['a', 'b']);
    game.advance(200);
    expect(runner.log).toEqual(['a', 'b', 'c', 'parent']);
  });

  it('stop ends a coroutine and stopAllCoroutines ends them all', () => {
    const { game, runner } = make();
    const one = runner.startCoroutine(runner.countTo(10));
    runner.startCoroutine(runner.countTo(10));
    one.stop();
    one.stop();
    game.advance(100);
    expect(runner.log).toEqual(['n1', 'n1', 'n2']);
    runner.stopAllCoroutines();
    game.advance(500);
    expect(runner.log).toHaveLength(3);
  });

  it('pauses while inactive and resumes afterwards', () => {
    const { game, runner } = make();
    runner.startCoroutine(runner.countTo(3));
    runner.gameObject.setActive(false);
    game.advance(500);
    expect(runner.log).toEqual(['n1']);
    runner.gameObject.setActive(true);
    game.advance(100);
    expect(runner.log).toEqual(['n1', 'n2']);
  });

  it('stops when the component is destroyed', () => {
    const { game, runner } = make();
    const co = runner.startCoroutine(runner.countTo(10));
    runner.destroy();
    expect(co.isRunning).toBe(false);
    game.advance(300);
    expect(runner.log).toEqual(['n1']);
  });

  it('does not keep a coroutine that finishes at once', () => {
    const { game, runner } = make();
    const co = runner.startCoroutine(runner.countTo(0));
    expect(co.isRunning).toBe(false);
    expect(game.advance(100)).toBe(1);
  });

  it('propagates errors and ends the coroutine', () => {
    const { game, runner } = make();
    const co = runner.startCoroutine(runner.boom());
    expect(() => game.advance(100)).toThrow('boom');
    expect(co.isRunning).toBe(false);
    expect(() => game.advance(100)).not.toThrow();
  });

  it('supports custom instructions', () => {
    class Twice extends YieldInstruction {
      calls = 0;
      override isDone(): boolean {
        this.calls++;
        return this.calls >= 2;
      }
    }
    const { game, runner } = make();
    const wait = new Twice();
    function* routine(): Generator<CoroutineYield> {
      yield wait;
      runner.log.push('done');
    }
    runner.startCoroutine(routine());
    game.advance(100);
    expect(runner.log).toEqual([]);
    game.advance(100);
    expect(runner.log).toEqual(['done']);
  });
});
