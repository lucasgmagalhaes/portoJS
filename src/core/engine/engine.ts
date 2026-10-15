import { TimeGuard, systemClock } from '../clock/index.js';
import type { Clock } from '../clock/index.js';

/**
 * Drives a repeating callback. Injectable so tests (and non-browser hosts) control
 * how the loop is pumped.
 */
export interface Scheduler {
  /** Starts calling `callback` every `intervalMs`. Returns a function that stops it. */
  start(callback: () => void, intervalMs: number): () => void;
}

/** Options for {@link createIntervalScheduler}. */
export interface IntervalSchedulerOptions {
  /**
   * In Node, `unref` the timer so a running game does not keep the process alive on its
   * own. Useful for tests and scripts. No effect in browsers. Default `false`.
   */
  readonly unref?: boolean;
}

/** Creates a `setInterval` based {@link Scheduler}. */
export function createIntervalScheduler(options: IntervalSchedulerOptions = {}): Scheduler {
  return {
    start(callback, intervalMs) {
      const id = setInterval(callback, intervalMs);
      const handle: unknown = id;
      if (
        options.unref === true &&
        typeof handle === 'object' &&
        handle !== null &&
        'unref' in handle &&
        typeof handle.unref === 'function'
      ) {
        handle.unref();
      }
      return () => clearInterval(id);
    },
  };
}

/** Default scheduler, backed by `setInterval`. */
export const intervalScheduler: Scheduler = createIntervalScheduler();

/** Options for {@link Engine}. */
export interface EngineOptions {
  /** Called once per fixed step with the step length in ms. */
  readonly onStep: (dtMs: number) => void;
  /** Called when more time piled up than `maxCatchUpTicks` allows; receives the dropped ms. */
  readonly onOverflow?: (droppedMs: number) => void;
  /** Fixed timestep in ms. Default `100`. */
  readonly stepMs?: number;
  /** Maximum steps simulated per {@link Engine.update}. Default `100`. */
  readonly maxCatchUpTicks?: number;
  /** How often the scheduler wakes the loop. Default is `stepMs`. */
  readonly pollMs?: number;
  /** Time source. Default {@link systemClock}. */
  readonly clock?: Clock;
  /** Loop driver. Default {@link intervalScheduler}. */
  readonly scheduler?: Scheduler;
}

/**
 * Fixed-timestep loop with an accumulator.
 *
 * Simulation always advances in whole steps of `stepMs`, regardless of how often
 * {@link Engine.update} runs (frame rate independent). Leftover time stays in the
 * accumulator for the next update. After a long pause (a throttled background tab, a
 * suspended laptop) at most `maxCatchUpTicks` steps run; the rest is dropped and reported
 * through `onOverflow` so the host can decide what to do with it.
 *
 * With a fake clock and no scheduler the loop is fully deterministic: call
 * `clock.advance(n)` then {@link Engine.update}, or use {@link Engine.advance}.
 */
export class Engine {
  /** Fixed step length in ms. */
  readonly stepMs: number;
  /** Cap on steps per update. */
  readonly maxCatchUpTicks: number;

  private readonly guard: TimeGuard;
  private readonly scheduler: Scheduler;
  private readonly pollMs: number;
  private readonly onStep: (dtMs: number) => void;
  private readonly onOverflow: ((droppedMs: number) => void) | undefined;
  private accumulator = 0;
  private steps = 0;
  private stopLoop: (() => void) | undefined;
  private busy = false;

  private readonly pump = (): void => {
    this.update();
  };

  /** @throws {RangeError} if `stepMs`, `maxCatchUpTicks` or `pollMs` is not a positive finite number. */
  constructor(options: EngineOptions) {
    this.stepMs = options.stepMs ?? 100;
    this.maxCatchUpTicks = options.maxCatchUpTicks ?? 100;
    this.pollMs = options.pollMs ?? this.stepMs;
    for (const [name, value] of [
      ['stepMs', this.stepMs],
      ['maxCatchUpTicks', this.maxCatchUpTicks],
      ['pollMs', this.pollMs],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`Engine: ${name} must be a positive finite number`);
      }
    }
    this.onStep = options.onStep;
    this.onOverflow = options.onOverflow;
    this.scheduler = options.scheduler ?? intervalScheduler;
    this.guard = new TimeGuard(options.clock ?? systemClock);
  }

  /** `true` between {@link Engine.start} and {@link Engine.stop}. */
  get running(): boolean {
    return this.stopLoop !== undefined;
  }

  /** Total fixed steps executed so far. */
  get stepCount(): number {
    return this.steps;
  }

  /** Time (ms) waiting in the accumulator, always below `stepMs` after an update. */
  get pending(): number {
    return this.accumulator;
  }

  /** Starts the loop. Time before the call is ignored. No-op when already running. */
  start(): void {
    if (this.running) return;
    this.guard.reset();
    this.stopLoop = this.scheduler.start(this.pump, this.pollMs);
  }

  /** Stops the loop. Pending accumulator time is kept. No-op when not running. */
  stop(): void {
    this.stopLoop?.();
    this.stopLoop = undefined;
  }

  /**
   * Forgets accumulated time and re-bases the clock reading, so the next update measures from
   * now. Used after loading a save: time before the load must not tick the loaded state.
   */
  discardPending(): void {
    this.accumulator = 0;
    this.guard.reset();
  }

  /**
   * Reads the clock and runs the whole steps that fit, up to `maxCatchUpTicks`.
   * A clock that went backwards contributes no time.
   *
   * @returns number of steps executed.
   */
  update(): number {
    const { delta } = this.guard.sample();
    this.accumulator += delta;
    let due = Math.floor(this.accumulator / this.stepMs);
    if (due > this.maxCatchUpTicks) {
      const dropped = (due - this.maxCatchUpTicks) * this.stepMs;
      this.accumulator -= dropped;
      due = this.maxCatchUpTicks;
      this.onOverflow?.(dropped);
    }
    return this.run(due);
  }

  /**
   * Simulates `ms` of game time without touching the clock (no catch-up cap).
   * Useful for tests, fast-forward and replays.
   *
   * @returns number of steps executed.
   * @throws {RangeError} if `ms` is negative or not finite.
   */
  advance(ms: number): number {
    if (!Number.isFinite(ms) || ms < 0) throw new RangeError('Engine.advance: ms must be >= 0');
    this.accumulator += ms;
    return this.run(Math.floor(this.accumulator / this.stepMs));
  }

  private run(count: number): number {
    if (this.busy) return 0;
    this.busy = true;
    let done = 0;
    try {
      while (done < count) {
        this.accumulator -= this.stepMs;
        this.steps += 1;
        done += 1;
        this.onStep(this.stepMs);
      }
    } finally {
      this.busy = false;
    }
    return done;
  }
}
