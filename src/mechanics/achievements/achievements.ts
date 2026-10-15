import { definePlugin } from '../../core/plugin.js';
import { idsByTime } from '../shared.js';
import type { Kernel, Plugin } from '../../core/plugin.js';
import { SaveCorruptedError, isJsonObject } from '../../core/save/index.js';
import type { JsonObject } from '../../core/save/index.js';

/**
 * Plugin name.
 */
export const ACHIEVEMENTS_PLUGIN = 'achievements';

/**
 * Declares one achievement.
 */
export interface AchievementDef<Ctx> {
  /**
   * Returns `true` once the achievement is earned. Checked while it is still locked.
   */
  readonly condition: (context: Ctx) => boolean;
  /**
   * Runs when the achievement unlocks, and again after a save is loaded so that permanent
   * effects (for example a production modifier) are restored. Make it idempotent.
   */
  readonly effect?: (context: Ctx) => void;
}

/**
 * Configuration of the {@link achievements} plugin.
 */
export interface AchievementsConfig<Ctx, A extends string> {
  /**
   * Builds the value passed to every condition. Called once during setup, so it can
   * `kernel.require(...)` other plugins. Use it to expose whatever your conditions read.
   */
  readonly context: (kernel: Kernel) => Ctx;
  /**
   * Achievements by id.
   */
  readonly definitions: { readonly [K in A]: AchievementDef<Ctx> };
  /**
   * How often conditions are evaluated, in ms of game time. Default `1000`.
   */
  readonly checkIntervalMs?: number;
}

/**
 * Events emitted by the {@link achievements} plugin.
 */
export interface AchievementsEvents<A extends string> {
  /**
   * An achievement was unlocked.
   */
  achievementUnlocked: { readonly id: A; readonly at: number };
}

/**
 * Methods the {@link achievements} plugin adds to the game.
 */
export interface AchievementsApi<A extends string> {
  /**
   * Ids of all achievements.
   */
  readonly achievementIds: readonly A[];
  /**
   * Whether an achievement is unlocked.
   */
  hasAchievement(id: A): boolean;
  /**
   * Ids of unlocked achievements, in unlock order.
   */
  unlockedAchievements(): A[];
  /**
   * Clock time (ms) when it unlocked, or `undefined` if still locked.
   */
  achievementUnlockedAt(id: A): number | undefined;
  /**
   * Evaluates every locked condition now. Returns the ids unlocked by this call.
   */
  checkAchievements(): A[];
}

/**
 * Plugin for achievements defined by conditions over the game state.
 *
 * The plugin knows nothing about what a condition inspects; you decide the `context`
 * (typically the API of another plugin) and write plain functions over it.
 *
 * @example
 * achievements({
 *   context: (kernel) => kernel.require<ResourcesApi<'gold', never, never>>('resources'),
 *   definitions: {
 *     rich: { condition: (game) => game.amount('gold').gte(1e6) },
 *   },
 * });
 */
export function achievements<Ctx, A extends string>(
  config: AchievementsConfig<Ctx, A>,
): Plugin<AchievementsApi<A>, AchievementsEvents<A>> {
  const setup = (kernel: Kernel<AchievementsEvents<A>>): AchievementsApi<A> => {
    const ids = Object.keys(config.definitions) as A[];
    const interval = config.checkIntervalMs ?? 1000;
    if (!Number.isFinite(interval) || interval <= 0) {
      throw new RangeError('achievements: checkIntervalMs must be a positive number');
    }
    const context = config.context(kernel);
    const defs = config.definitions as Readonly<Record<string, AchievementDef<Ctx>>>;
    const unlocked = new Map<A, number>();
    let sinceCheck = 0;

    const check = (): A[] => {
      const fresh: A[] = [];
      for (const id of ids) {
        if (unlocked.has(id)) continue;
        const def = defs[id] as AchievementDef<Ctx>;
        if (!def.condition(context)) continue;
        const at = kernel.now();
        unlocked.set(id, at);
        fresh.push(id);
        def.effect?.(context);
        kernel.emit('achievementUnlocked', { id, at });
      }
      return fresh;
    };

    kernel.registerSystem({
      id: ACHIEVEMENTS_PLUGIN,
      tick: (dtMs) => {
        sinceCheck += dtMs;
        if (sinceCheck < interval) return;
        sinceCheck = 0;
        check();
      },
      serialize: () => {
        const out: JsonObject = {};
        for (const [id, at] of unlocked) out[id] = at;
        return out;
      },
      deserialize: (data) => {
        unlocked.clear();
        sinceCheck = 0;
        if (data === undefined) return;
        if (!isJsonObject(data)) {
          throw new SaveCorruptedError('achievements: save entry must be an object');
        }
        for (const id of ids) {
          const at = data[id];
          if (at === undefined) continue;
          if (typeof at !== 'number' || !Number.isFinite(at)) {
            throw new SaveCorruptedError(`achievements: invalid timestamp for "${id}"`);
          }
          unlocked.set(id, at);
        }
        for (const id of unlocked.keys()) defs[id]?.effect?.(context);
      },
    });

    return {
      achievementIds: ids,
      hasAchievement: (id) => unlocked.has(id),
      unlockedAchievements: () => idsByTime(unlocked),
      achievementUnlockedAt: (id) => unlocked.get(id),
      checkAchievements: check,
    };
  };
  return definePlugin<AchievementsApi<A>, AchievementsEvents<A>>(ACHIEVEMENTS_PLUGIN, setup);
}
