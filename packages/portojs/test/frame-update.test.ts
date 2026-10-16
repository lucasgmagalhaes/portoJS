import { describe, expect, it } from 'vitest';
import { Component, Game, ManualClock } from '../src/index.ts';
import type { Scheduler } from '../src/index.ts';

class Recorder extends Component {
  static override typeId = 'Recorder';
  readonly log: string[] = [];

  constructor(
    gameObject: ConstructorParameters<typeof Component>[0],
    private readonly shared?: string[],
  ) {
    super(gameObject);
  }

  override start(): void {
    this.record('start');
  }

  override fixedUpdate(): void {
    this.record('fixed');
  }

  override update(deltaTime: number): void {
    this.record(`update ${deltaTime.toFixed(3)}`);
  }

  override lateUpdate(deltaTime: number): void {
    this.record(`late ${deltaTime.toFixed(3)}`);
  }

  private record(entry: string): void {
    this.log.push(entry);
    this.shared?.push(`${this.gameObject.name}:${entry}`);
  }
}

function make(stepMs = 100) {
  const clock = new ManualClock(0);
  const game = new Game({ clock, stepMs });
  return { clock, game };
}

describe('update and lateUpdate', () => {
  it('run once per frame after the fixed steps, with the real time in seconds', () => {
    const { clock, game } = make();
    const recorder = game.createObject('R').addComponent(Recorder);
    clock.advance(250);
    game.update();
    expect(recorder.log).toEqual(['start', 'fixed', 'fixed', 'update 0.250', 'late 0.250']);
    clock.advance(30);
    game.update();
    expect(recorder.log.slice(5)).toEqual(['update 0.030', 'late 0.030']);
  });

  it('run every update of every component before any lateUpdate, in execution order', () => {
    const { clock, game } = make();
    const shared: string[] = [];
    class Early extends Recorder {
      static override typeId = 'Early';
      static override executionOrder = -5;
    }
    const a = game.createObject('A');
    a.addComponent(Recorder, shared);
    game.createObject('B').addComponent(Early, shared);
    clock.advance(100);
    game.update();
    expect(shared.filter((e) => !e.includes('start') && !e.includes('fixed'))).toEqual([
      'B:update 0.100',
      'A:update 0.100',
      'B:late 0.100',
      'A:late 0.100',
    ]);
  });

  it('follow timeScale and are 0 while paused, with the unscaled time kept on Time', () => {
    const { clock, game } = make();
    const recorder = game.createObject('R').addComponent(Recorder);
    game.timeScale = 0.5;
    clock.advance(200);
    game.update();
    game.pause();
    clock.advance(100);
    game.update();
    expect(recorder.log.filter((e) => e.startsWith('update'))).toEqual([
      'update 0.100',
      'update 0.000',
    ]);
    expect(game.time.frameDeltaTime).toBe(0);
    expect(game.time.unscaledFrameDeltaTime).toBeCloseTo(0.1, 9);
  });

  it('skip inactive objects and wait for start', () => {
    const { clock, game } = make();
    const object = game.createObject('R', { active: false });
    const recorder = object.addComponent(Recorder);
    clock.advance(100);
    game.update();
    expect(recorder.log).toEqual([]);
    object.setActive(true);
    clock.advance(100);
    game.update();
    expect(recorder.log).toEqual(['start', 'fixed', 'update 0.100', 'late 0.100']);
  });

  it('stop being called once the component is removed', () => {
    const { clock, game } = make();
    const object = game.createObject('R');
    const recorder = object.addComponent(Recorder);
    clock.advance(100);
    game.update();
    object.removeComponent(recorder);
    clock.advance(100);
    game.update();
    expect(recorder.log.filter((e) => e.startsWith('update'))).toHaveLength(1);
  });

  it('run for advance() with the simulated time', () => {
    const { game } = make();
    const recorder = game.createObject('R').addComponent(Recorder);
    game.advance(500);
    expect(recorder.log.filter((e) => e.startsWith('update'))).toEqual(['update 0.500']);
  });

  it('run when the loop pumps itself through the scheduler', () => {
    const clock = new ManualClock(0);
    let pump: (() => void) | undefined;
    const scheduler: Scheduler = {
      start(callback) {
        pump = callback;
        return () => {
          pump = undefined;
        };
      },
    };
    const game = new Game({ clock, scheduler, stepMs: 50, pollMs: 16 });
    const recorder = game.createObject('R').addComponent(Recorder);
    game.start();
    clock.advance(16);
    pump?.();
    clock.advance(16);
    pump?.();
    expect(recorder.log.filter((e) => e.startsWith('update'))).toEqual([
      'update 0.016',
      'update 0.016',
    ]);
    game.dispose();
  });
});

describe('alpha', () => {
  it('is the fraction of the next fixed step already elapsed', () => {
    const { clock, game } = make(100);
    expect(game.alpha).toBe(0);
    clock.advance(150);
    game.update();
    expect(game.alpha).toBeCloseTo(0.5, 9);
    clock.advance(50);
    game.update();
    expect(game.alpha).toBeCloseTo(0, 9);
  });

  it('lets a visual interpolate between fixed steps', () => {
    class Mover extends Component {
      static override typeId = 'Mover';
      previous = 0;
      current = 0;
      shown = 0;

      override fixedUpdate(): void {
        this.previous = this.current;
        this.current += 10;
      }

      override update(): void {
        this.shown = this.previous + (this.current - this.previous) * this.game.alpha;
      }
    }
    const { clock, game } = make(100);
    const mover = game.createObject('M').addComponent(Mover);
    clock.advance(150);
    game.update();
    expect(mover.current).toBe(10);
    expect(mover.shown).toBeCloseTo(5, 9);
    clock.advance(30);
    game.update();
    expect(mover.shown).toBeCloseTo(0 + 10 * 0.8, 9);
  });

  it('works with a 16 ms action step', () => {
    const { clock, game } = make(16);
    clock.advance(40);
    expect(game.update()).toBe(2);
    expect(game.alpha).toBeCloseTo(8 / 16, 9);
  });
});
