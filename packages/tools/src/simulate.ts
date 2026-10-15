import type { Game } from '@portojs/runtime';

/**
 * One recorded point of a simulation.
 */
export interface SimulationSample {
  /**
   * Game time in milliseconds since the simulation began.
   */
  readonly atMs: number;
  /**
   * The values returned by the `sample` option at that time.
   */
  readonly values: Readonly<Record<string, number>>;
}

/**
 * Options of {@link simulate}.
 */
export interface SimulationOptions {
  /**
   * The game to play. It is advanced with `game.advance`, so no clock or timer is involved and
   * the run is deterministic.
   */
  readonly game: Game;
  /**
   * Game time to simulate at most, in milliseconds.
   */
  readonly maxMs: number;
  /**
   * How often the strategy acts and milestones are checked, in milliseconds. Default 1000.
   */
  readonly decisionMs?: number;
  /**
   * The simulated player. Called once per decision with the game and the elapsed game time: buy
   * things, prestige, and so on. See `buyCheapest` and `buyInOrder`.
   */
  readonly strategy?: (game: Game, elapsedMs: number) => void;
  /**
   * Named goals. Each returns `true` once reached; its first time is recorded. The run stops
   * early when every milestone has been reached.
   */
  readonly milestones?: Readonly<Record<string, (game: Game) => boolean>>;
  /**
   * Numbers to record over time, for charts and tuning.
   */
  readonly sample?: (game: Game) => Readonly<Record<string, number>>;
  /**
   * How often to record `sample`, in milliseconds. Default 60000.
   */
  readonly sampleEveryMs?: number;
}

/**
 * What {@link simulate} found.
 */
export interface SimulationResult {
  /**
   * Game time simulated, in milliseconds.
   */
  readonly elapsedMs: number;
  /**
   * Time each milestone was first reached, or `undefined` if it never was within `maxMs`.
   */
  readonly reached: Readonly<Record<string, number | undefined>>;
  /**
   * `true` when every milestone was reached (also `true` when there are none and `maxMs` ran
   * out).
   */
  readonly completed: boolean;
  /**
   * Recorded samples, oldest first.
   */
  readonly samples: readonly SimulationSample[];
  /**
   * Fixed steps the game executed.
   */
  readonly steps: number;
}

/**
 * Fast-forwards a game with a scripted player and reports when each milestone was reached: a
 * headless balancing tool. Run it in a test or script to answer "how long until the first
 * prestige?" or to guard a tuning change.
 *
 * @example
 * const result = simulate({
 *   game,
 *   maxMs: 3_600_000,
 *   strategy: buyCheapest([miner, mine, factory]),
 *   milestones: { tenThousandGold: () => gold.amount.gte(10_000) },
 * });
 * result.reached.tenThousandGold; // game ms, or undefined
 *
 * @throws {RangeError} if `maxMs`, `decisionMs` or `sampleEveryMs` is not positive.
 */
export function simulate(options: SimulationOptions): SimulationResult {
  const { game, maxMs } = options;
  const decisionMs = options.decisionMs ?? 1000;
  const sampleEveryMs = options.sampleEveryMs ?? 60_000;
  if (!(maxMs > 0)) throw new RangeError('simulate: maxMs must be > 0');
  if (!(decisionMs > 0)) throw new RangeError('simulate: decisionMs must be > 0');
  if (!(sampleEveryMs > 0)) throw new RangeError('simulate: sampleEveryMs must be > 0');

  const goals = Object.entries(options.milestones ?? {});
  const reached: Record<string, number | undefined> = {};
  for (const [name] of goals) reached[name] = undefined;
  const samples: SimulationSample[] = [];
  let remaining = goals.length;
  let elapsed = 0;
  let steps = 0;
  let nextSample = 0;

  const checkMilestones = (): void => {
    for (const [name, isReached] of goals) {
      if (reached[name] === undefined && isReached(game)) {
        reached[name] = elapsed;
        remaining -= 1;
      }
    }
  };

  checkMilestones();
  while (elapsed < maxMs && (goals.length === 0 || remaining > 0)) {
    if (options.sample !== undefined && elapsed >= nextSample) {
      samples.push({ atMs: elapsed, values: options.sample(game) });
      nextSample += sampleEveryMs;
    }
    options.strategy?.(game, elapsed);
    const slice = Math.min(decisionMs, maxMs - elapsed);
    steps += game.advance(slice);
    elapsed += slice;
    checkMilestones();
  }
  if (options.sample !== undefined) samples.push({ atMs: elapsed, values: options.sample(game) });
  return {
    elapsedMs: elapsed,
    reached,
    completed: goals.length === 0 || remaining === 0,
    samples,
    steps,
  };
}
