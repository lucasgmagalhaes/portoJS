import type { BigNumLike } from '../../core/bignum/index.js';
import { definePlugin } from '../../core/plugin.js';
import type { Kernel, Plugin } from '../../core/plugin.js';
import { SaveCorruptedError, isJsonObject } from '../../core/save/index.js';
import { RESOURCES_PLUGIN } from '../resources/resources.js';
import type { EffectTarget, ResetKeep, ResourcesApi } from '../resources/types.js';

/** Plugin name. */
export const CHALLENGES_PLUGIN = 'challenges';

/** A multiplier applied to a target. */
export type ChallengeModifier<R extends string, G extends string> = EffectTarget<R, G> & {
  readonly multiplier: BigNumLike;
};

/** Declares one challenge. */
export interface ChallengeDef<R extends string, G extends string> {
  /** Returns `true` when the player has beaten the challenge. Checked while it is active. */
  readonly goal: (game: ResourcesApi<R, G, string>) => boolean;
  /** Handicaps applied only while the challenge is active (for example `0.1` to cut output). */
  readonly modifiers?: readonly ChallengeModifier<R, G>[];
  /** Bonuses applied permanently once the challenge has been completed. */
  readonly reward?: readonly ChallengeModifier<R, G>[];
  /** What survives the reset when the challenge starts or is abandoned. Default: nothing. */
  readonly keep?: ResetKeep<R, G, string>;
}

/** Configuration of the {@link challenges} plugin. */
export interface ChallengesConfig<R extends string, G extends string, C extends string> {
  /** Challenges by id. */
  readonly definitions: { readonly [id in C]: ChallengeDef<R, G> };
  /** How often the active challenge's goal is polled, in ms of game time. Default `500`. */
  readonly checkIntervalMs?: number;
}

/** Events emitted by the {@link challenges} plugin. */
export interface ChallengesEvents<C extends string> {
  /** A challenge started (the run was reset). */
  challengeStarted: { readonly id: C };
  /** The active challenge was beaten. */
  challengeCompleted: { readonly id: C; readonly firstTime: boolean };
  /** The active challenge was abandoned. */
  challengeExited: { readonly id: C };
}

/** Methods the {@link challenges} plugin adds to the game. */
export interface ChallengesApi<C extends string> {
  /** Ids of all challenges. */
  readonly challengeIds: readonly C[];
  /**
   * Starts a challenge: resets the run (keeping what the definition lists) and applies its
   * handicaps. Returns `false` if a challenge is already active.
   */
  startChallenge(id: C): boolean;
  /** Abandons the active challenge and resets the run. Returns `false` if none is active. */
  exitChallenge(): boolean;
  /** The active challenge, if any. */
  activeChallenge(): C | undefined;
  /** Whether a challenge has been beaten at least once. */
  isChallengeCompleted(id: C): boolean;
  /** Ids of beaten challenges, in completion order. */
  completedChallenges(): C[];
}

/**
 * Plugin for challenge runs: restart with a handicap, and earn a permanent reward by
 * reaching a goal anyway. Handicaps and rewards are applied as `resources` modifiers, so
 * they affect ticks and offline progress alike, and they follow saves automatically.
 *
 * Install it after `resources`. Pass your ids explicitly so goals are typed:
 *
 * @example
 * challenges<'gold', 'miner', 'noMiners'>({
 *   definitions: {
 *     slowGold: {
 *       goal: (game) => game.earned('gold').gte(1e6),
 *       modifiers: [{ resource: 'gold', multiplier: 0.1 }],
 *       reward: [{ resource: 'gold', multiplier: 2 }],
 *     },
 *   },
 * });
 */
export function challenges<R extends string, G extends string = never, C extends string = string>(
  config: ChallengesConfig<R, G, C>,
): Plugin<ChallengesApi<C>, ChallengesEvents<C>> {
  const setup = (kernel: Kernel<ChallengesEvents<C>>): ChallengesApi<C> => {
    const game = kernel.require<ResourcesApi<R, G, string>>(RESOURCES_PLUGIN);
    const ids = Object.keys(config.definitions) as C[];
    const defs = config.definitions as Readonly<Record<string, ChallengeDef<R, G>>>;
    const interval = config.checkIntervalMs ?? 500;
    if (!Number.isFinite(interval) || interval <= 0) {
      throw new RangeError('challenges: checkIntervalMs must be a positive number');
    }
    let active: C | undefined;
    const completed: C[] = [];
    let sinceCheck = 0;

    const whenActive = (id: C, multiplier: BigNumLike) => (): BigNumLike =>
      active === id ? multiplier : 1;
    const whenCompleted = (id: C, multiplier: BigNumLike) => (): BigNumLike =>
      completed.includes(id) ? multiplier : 1;

    for (const id of ids) {
      const def = defs[id] as ChallengeDef<R, G>;
      const handicaps = def.modifiers ?? [];
      for (let i = 0; i < handicaps.length; i++) {
        const handicap = handicaps[i] as ChallengeModifier<R, G>;
        const name = `${CHALLENGES_PLUGIN}:${id}:handicap:${i}`;
        game.setModifier(name, handicap, whenActive(id, handicap.multiplier));
      }
      const rewards = def.reward ?? [];
      for (let i = 0; i < rewards.length; i++) {
        const reward = rewards[i] as ChallengeModifier<R, G>;
        const name = `${CHALLENGES_PLUGIN}:${id}:reward:${i}`;
        game.setModifier(name, reward, whenCompleted(id, reward.multiplier));
      }
    }

    const reset = (id: C): void => {
      const keep = (defs[id] as ChallengeDef<R, G>).keep;
      if (keep === undefined) game.resetRun();
      else game.resetRun(keep);
    };

    const check = (): void => {
      if (active === undefined) return;
      const id = active;
      if (!(defs[id] as ChallengeDef<R, G>).goal(game)) return;
      const firstTime = !completed.includes(id);
      if (firstTime) completed.push(id);
      active = undefined;
      kernel.emit('challengeCompleted', { id, firstTime });
    };

    kernel.registerSystem({
      id: CHALLENGES_PLUGIN,
      tick: (dtMs) => {
        if (active === undefined) return;
        sinceCheck += dtMs;
        if (sinceCheck < interval) return;
        sinceCheck = 0;
        check();
      },
      serialize: () => ({ active: active ?? null, completed: [...completed] }),
      deserialize: (data) => {
        active = undefined;
        completed.length = 0;
        sinceCheck = 0;
        if (data === undefined) return;
        if (!isJsonObject(data)) {
          throw new SaveCorruptedError('challenges: save entry must be an object');
        }
        const savedActive = data['active'] ?? null;
        const savedDone = data['completed'] ?? [];
        const known = (value: unknown): value is C => ids.includes(value as C);
        if (savedActive !== null && !known(savedActive)) {
          throw new SaveCorruptedError('challenges: unknown active challenge');
        }
        if (!Array.isArray(savedDone) || !savedDone.every(known)) {
          throw new SaveCorruptedError('challenges: invalid completed list');
        }
        active = savedActive ?? undefined;
        for (const id of new Set(savedDone)) completed.push(id);
      },
    });

    return {
      challengeIds: ids,
      startChallenge: (id) => {
        if (!ids.includes(id)) throw new Error(`challenges: unknown challenge "${id}"`);
        if (active !== undefined) return false;
        active = id;
        sinceCheck = 0;
        reset(id);
        kernel.emit('challengeStarted', { id });
        return true;
      },
      exitChallenge: () => {
        if (active === undefined) return false;
        const id = active;
        active = undefined;
        reset(id);
        kernel.emit('challengeExited', { id });
        return true;
      },
      activeChallenge: () => active,
      isChallengeCompleted: (id) => completed.includes(id),
      completedChallenges: () => [...completed],
    };
  };
  return definePlugin<ChallengesApi<C>, ChallengesEvents<C>>(CHALLENGES_PLUGIN, setup);
}
