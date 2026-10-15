import { definePlugin } from '../../core/plugin.js';
import type { Plugin } from '../../core/plugin.js';
import { SaveCorruptedError, isJsonObject } from '../../core/save/index.js';
import type { JsonObject } from '../../core/save/index.js';
import { RESOURCES_PLUGIN } from '../resources/resources.js';
import type { ResourcesApi } from '../resources/types.js';

/** Plugin name. */
export const UNLOCKS_PLUGIN = 'unlocks';

/** Declares one unlock: a condition and what it opens. */
export interface UnlockDef<R extends string, G extends string, U extends string> {
  /** Returns `true` once the player has earned the unlock. Checked while it is locked. */
  readonly condition: (game: ResourcesApi<R, G, U>) => boolean;
  /** Generators that cannot be bought until this unlock is earned. */
  readonly generators?: readonly G[];
  /** Upgrades that cannot be bought until this unlock is earned. */
  readonly upgrades?: readonly U[];
}

/** Configuration of the {@link unlocks} plugin. */
export interface UnlocksConfig<
  R extends string,
  G extends string,
  U extends string,
  K extends string,
> {
  /** Unlocks by id. */
  readonly definitions: { readonly [id in K]: UnlockDef<R, G, U> };
  /** How often locked conditions are polled, in ms of game time. Default `500`. */
  readonly checkIntervalMs?: number;
}

/** Events emitted by the {@link unlocks} plugin. */
export interface UnlocksEvents<K extends string> {
  /** An unlock was earned. */
  unlocked: { readonly id: K; readonly at: number };
}

/** Methods the {@link unlocks} plugin adds to the game. */
export interface UnlocksApi<K extends string> {
  /** Ids of all unlocks. */
  readonly unlockIds: readonly K[];
  /** Whether an unlock has been earned. Evaluates the condition on demand while locked. */
  isUnlocked(id: K): boolean;
  /** Ids earned so far, in the order they were earned. */
  unlockedIds(): K[];
  /** Evaluates every locked condition now. Returns the ids earned by this call. */
  checkUnlocks(): K[];
}

/**
 * Plugin that hides generators and upgrades until a condition is met. Unlocks are
 * permanent: they survive prestige and resets of the run, and they are saved.
 *
 * It gates purchases through the `resources` guard hook, so `canBuy`, `buy` and
 * `maxAffordable` all respect it. Install it after `resources`. Because the condition
 * type depends on your resource ids, pass them explicitly:
 *
 * @example
 * unlocks<'gold', 'miner' | 'drill', never, 'deepMining'>({
 *   definitions: {
 *     deepMining: {
 *       condition: (game) => game.bought('miner').gte(10),
 *       generators: ['drill'],
 *     },
 *   },
 * });
 */
export function unlocks<
  R extends string,
  G extends string = never,
  U extends string = never,
  K extends string = string,
>(config: UnlocksConfig<R, G, U, K>): Plugin<UnlocksApi<K>, UnlocksEvents<K>> {
  return definePlugin<UnlocksApi<K>, UnlocksEvents<K>>(UNLOCKS_PLUGIN, (kernel) => {
    const game = kernel.require<ResourcesApi<R, G, U>>(RESOURCES_PLUGIN);
    const ids = Object.keys(config.definitions) as K[];
    const defs = config.definitions as Readonly<Record<string, UnlockDef<R, G, U>>>;
    const interval = config.checkIntervalMs ?? 500;
    if (!Number.isFinite(interval) || interval <= 0) {
      throw new RangeError('unlocks: checkIntervalMs must be a positive number');
    }
    const earned = new Map<K, number>();
    let sinceCheck = 0;

    // Which unlocks gate each target.
    const gatesOf = new Map<string, K[]>();
    for (const id of ids) {
      const def = defs[id] as UnlockDef<R, G, U>;
      for (const g of def.generators ?? []) push(gatesOf, `generator:${g}`, id);
      for (const u of def.upgrades ?? []) push(gatesOf, `upgrade:${u}`, id);
    }

    const evaluate = (id: K): boolean => {
      if (earned.has(id)) return true;
      if (!(defs[id] as UnlockDef<R, G, U>).condition(game)) return false;
      const at = kernel.now();
      earned.set(id, at);
      kernel.emit('unlocked', { id, at });
      return true;
    };

    const check = (): K[] => {
      const fresh: K[] = [];
      for (const id of ids) {
        if (!earned.has(id) && evaluate(id)) fresh.push(id);
      }
      return fresh;
    };

    game.setPurchaseGuard(UNLOCKS_PLUGIN, (target) => {
      const gates = gatesOf.get(`${target.kind}:${target.id}`);
      return gates === undefined || gates.every(evaluate);
    });

    kernel.registerSystem({
      id: UNLOCKS_PLUGIN,
      tick: (dtMs) => {
        sinceCheck += dtMs;
        if (sinceCheck < interval) return;
        sinceCheck = 0;
        check();
      },
      serialize: () => {
        const out: JsonObject = {};
        for (const [id, at] of earned) out[id] = at;
        return out;
      },
      deserialize: (data) => {
        earned.clear();
        sinceCheck = 0;
        if (data === undefined) return;
        if (!isJsonObject(data))
          throw new SaveCorruptedError('unlocks: save entry must be an object');
        for (const id of ids) {
          const at = data[id];
          if (at === undefined) continue;
          if (typeof at !== 'number' || !Number.isFinite(at)) {
            throw new SaveCorruptedError(`unlocks: invalid timestamp for "${id}"`);
          }
          earned.set(id, at);
        }
      },
    });

    return {
      unlockIds: ids,
      isUnlocked: evaluate,
      unlockedIds: () => [...earned.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id),
      checkUnlocks: check,
    };
  });
}

function push<K>(map: Map<string, K[]>, key: string, value: K): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}
