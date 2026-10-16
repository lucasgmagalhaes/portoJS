import { ManualClock } from '@portojs/core';
import type { OfflineReport } from '@portojs/core';
import { Game } from '@portojs/runtime';
import type { GameOptions } from '@portojs/runtime';

/**
 * A game with a fake clock and helpers to move time, from {@link createTestGame}.
 */
export interface TestGame {
  /**
   * The game under test. It is never started: time only moves when you move it.
   */
  readonly game: Game;
  /**
   * The fake clock the game reads.
   */
  readonly clock: ManualClock;
  /**
   * Runs `count` fixed steps (one by default) and returns the steps run.
   */
  tick(count?: number): number;
  /**
   * Lets `ms` of real time pass and runs the loop, as if the page had been open that long. Time
   * beyond `maxCatchUpTicks` steps is dropped (and credited as offline progress), like in a real
   * background tab.
   */
  elapse(ms: number): number;
  /**
   * Plays `ms` of game time in fixed steps, ignoring the clock and the catch-up limit.
   */
  advance(ms: number): number;
  /**
   * Saves, lets `ms` pass while "closed", and loads again, as if the player left and came back.
   *
   * @returns the offline report of the load.
   */
  leaveAndReturn(ms: number): OfflineReport | undefined;
  /**
   * Plays fixed steps until `done()` is true or `timeoutMs` of game time has passed.
   *
   * @returns `true` if `done()` became true.
   */
  runUntil(done: () => boolean, timeoutMs?: number): boolean;
}

/**
 * Creates a game that never runs by itself, with a {@link ManualClock}, for deterministic tests.
 *
 * @example
 * const { game, tick, leaveAndReturn } = createTestGame({ offline: { maxMs: 8 * 3_600_000 } });
 * const gold = game.createObject('Gold').addComponent(Resource);
 * tick(10);
 * leaveAndReturn(3_600_000);
 */
export function createTestGame(options: GameOptions = {}): TestGame {
  const clock = new ManualClock(0);
  const game = new Game({ ...options, clock });
  return {
    game,
    clock,
    tick(count = 1) {
      return game.advance(count * game.stepMs);
    },
    elapse(ms) {
      clock.advance(ms);
      return game.update();
    },
    advance(ms) {
      return game.advance(ms);
    },
    leaveAndReturn(ms) {
      const save = game.save();
      clock.advance(ms);
      return game.load(save);
    },
    runUntil(done, timeoutMs = 60_000) {
      let elapsed = 0;
      while (!done()) {
        if (elapsed >= timeoutMs) return false;
        game.advance(game.stepMs);
        elapsed += game.stepMs;
      }
      return true;
    },
  };
}
