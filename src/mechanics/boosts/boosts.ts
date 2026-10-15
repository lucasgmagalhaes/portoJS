import type { BigNumLike } from '../../core/bignum/index.js';
import { definePlugin } from '../../core/plugin.js';
import type { Plugin } from '../../core/plugin.js';
import { SaveCorruptedError, isJsonObject } from '../../core/save/index.js';
import type { JsonObject } from '../../core/save/index.js';
import { RESOURCES_PLUGIN } from '../resources/resources.js';
import type { EffectTarget, ResourcesApi } from '../resources/types.js';

/** Plugin name. */
export const BOOSTS_PLUGIN = 'boosts';

/** A multiplier applied while a boost is active. */
export type BoostEffect<R extends string, G extends string> = EffectTarget<R, G> & {
  readonly multiplier: BigNumLike;
};

/** Declares one boost. */
export interface BoostDef<R extends string, G extends string> {
  /** Multipliers applied while the boost is active. */
  readonly effects: readonly BoostEffect<R, G>[];
  /** How long it lasts, in ms of game time. */
  readonly durationMs: number;
  /**
   * What activating an already active boost does: `'refresh'` restarts the full duration
   * (default), `'extend'` adds the duration to what is left, `'ignore'` does nothing.
   */
  readonly onReactivate?: 'refresh' | 'extend' | 'ignore';
}

/** Configuration of the {@link boosts} plugin. */
export interface BoostsConfig<R extends string, G extends string, B extends string> {
  /** Boosts by id. */
  readonly definitions: { readonly [id in B]: BoostDef<R, G> };
}

/** Events emitted by the {@link boosts} plugin. */
export interface BoostsEvents<B extends string> {
  /** A boost was activated (or refreshed / extended). */
  boostStarted: { readonly id: B; readonly remainingMs: number };
  /** A boost ran out. */
  boostEnded: { readonly id: B };
}

/** Methods the {@link boosts} plugin adds to the game. */
export interface BoostsApi<B extends string> {
  /** Ids of all boosts. */
  readonly boostIds: readonly B[];
  /** Activates a boost. Returns `false` if it was already active and set to `'ignore'`. */
  activateBoost(id: B): boolean;
  /** Ends a boost early. Returns whether it was active. */
  cancelBoost(id: B): boolean;
  /** Whether a boost is running. */
  isBoostActive(id: B): boolean;
  /** Time left in ms (`0` when not active). */
  boostRemainingMs(id: B): number;
  /** Ids of running boosts. */
  activeBoosts(): B[];
}

/**
 * Plugin for time-limited multipliers: "2x production for 30 seconds".
 *
 * Boost timers advance with game ticks. They **pause while the player is away**, and boosts
 * do not apply to offline gains; this keeps offline progress a closed form and means a
 * player cannot lose a boost's duration by closing the game.
 *
 * Install it after `resources`. Pass your ids explicitly so effects are typed:
 *
 * @example
 * boosts<'gold', never, 'frenzy'>({
 *   definitions: {
 *     frenzy: { durationMs: 30_000, effects: [{ resource: 'gold', multiplier: 2 }] },
 *   },
 * });
 * game.activateBoost('frenzy');
 */
export function boosts<R extends string, G extends string = never, B extends string = string>(
  config: BoostsConfig<R, G, B>,
): Plugin<BoostsApi<B>, BoostsEvents<B>> {
  return definePlugin<BoostsApi<B>, BoostsEvents<B>>(BOOSTS_PLUGIN, (kernel) => {
    const game = kernel.require<ResourcesApi<R, G, string>>(RESOURCES_PLUGIN);
    const ids = Object.keys(config.definitions) as B[];
    const defs = config.definitions as Readonly<Record<string, BoostDef<R, G>>>;
    const remaining = new Map<B, number>();

    for (const id of ids) {
      const def = defs[id] as BoostDef<R, G>;
      if (!Number.isFinite(def.durationMs) || def.durationMs <= 0) {
        throw new RangeError(`boosts: durationMs of "${id}" must be a positive number`);
      }
      def.effects.forEach((effect, i) => {
        game.setModifier(`${BOOSTS_PLUGIN}:${id}:${i}`, effect, ({ offline }) =>
          !offline && remaining.has(id) ? effect.multiplier : 1,
        );
      });
    }

    const known = (id: B): BoostDef<R, G> => {
      const def = defs[id];
      if (def === undefined) throw new Error(`boosts: unknown boost "${id}"`);
      return def;
    };

    kernel.registerSystem({
      id: BOOSTS_PLUGIN,
      tick: (dtMs) => {
        for (const [id, left] of [...remaining]) {
          const next = left - dtMs;
          if (next > 0) {
            remaining.set(id, next);
          } else {
            remaining.delete(id);
            kernel.emit('boostEnded', { id });
          }
        }
      },
      serialize: () => {
        const out: JsonObject = {};
        for (const [id, left] of remaining) out[id] = left;
        return out;
      },
      deserialize: (data) => {
        remaining.clear();
        if (data === undefined) return;
        if (!isJsonObject(data))
          throw new SaveCorruptedError('boosts: save entry must be an object');
        for (const id of ids) {
          const left = data[id];
          if (left === undefined) continue;
          if (typeof left !== 'number' || !Number.isFinite(left) || left < 0) {
            throw new SaveCorruptedError(`boosts: invalid remaining time for "${id}"`);
          }
          if (left > 0) remaining.set(id, left);
        }
      },
    });

    return {
      boostIds: ids,
      activateBoost: (id) => {
        const def = known(id);
        const current = remaining.get(id);
        const mode = def.onReactivate ?? 'refresh';
        if (current !== undefined && mode === 'ignore') return false;
        const next =
          current !== undefined && mode === 'extend' ? current + def.durationMs : def.durationMs;
        remaining.set(id, next);
        kernel.emit('boostStarted', { id, remainingMs: next });
        return true;
      },
      cancelBoost: (id) => {
        known(id);
        const was = remaining.delete(id);
        if (was) kernel.emit('boostEnded', { id });
        return was;
      },
      isBoostActive: (id) => {
        known(id);
        return remaining.has(id);
      },
      boostRemainingMs: (id) => {
        known(id);
        return remaining.get(id) ?? 0;
      },
      activeBoosts: () => [...remaining.keys()],
    };
  });
}
