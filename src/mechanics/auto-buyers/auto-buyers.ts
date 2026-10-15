import type { BigNum } from '../../core/bignum/index.js';
import { definePlugin } from '../../core/plugin.js';
import type { Kernel, Plugin } from '../../core/plugin.js';
import { SaveCorruptedError, isJsonObject } from '../../core/save/index.js';
import type { JsonObject } from '../../core/save/index.js';
import { RESOURCES_PLUGIN } from '../resources/resources.js';
import type { BulkAmount, ResourcesApi } from '../resources/types.js';

/** Plugin name. */
export const AUTO_BUYERS_PLUGIN = 'autoBuyers';

/** Declares one auto-buyer. */
export interface AutoBuyerDef<G extends string> {
  /** Generator it buys. */
  readonly generator: G;
  /** How much to buy each time: a count or `'max'`. Default `'max'`. */
  readonly amount?: BulkAmount;
  /** Time between purchases, in ms of game time. Default `1000`. */
  readonly everyMs?: number;
  /** Whether it starts switched on in a new game. Default `false`. */
  readonly enabled?: boolean;
}

/** Configuration of the {@link autoBuyers} plugin. */
export interface AutoBuyersConfig<G extends string, B extends string> {
  /** Auto-buyers by id. */
  readonly buyers: { readonly [id in B]: AutoBuyerDef<NoInfer<G>> };
}

/** Events emitted by the {@link autoBuyers} plugin. */
export interface AutoBuyersEvents<G extends string, B extends string> {
  /** An auto-buyer bought something. */
  autoBuy: { readonly id: B; readonly generator: G; readonly amount: BigNum };
}

/** Methods the {@link autoBuyers} plugin adds to the game. */
export interface AutoBuyersApi<B extends string> {
  /** Ids of all auto-buyers. */
  readonly autoBuyerIds: readonly B[];
  /** Switches an auto-buyer on or off. */
  setAutoBuyer(id: B, enabled: boolean): void;
  /** Whether an auto-buyer is on. */
  isAutoBuyerEnabled(id: B): boolean;
}

interface BuyerState<G extends string> {
  readonly generator: G;
  readonly amount: BulkAmount;
  readonly everyMs: number;
  enabled: boolean;
  readonly initiallyEnabled: boolean;
  elapsed: number;
}

/**
 * Plugin that buys generators for the player on a timer.
 *
 * Auto-buyers act on game ticks only. They do **not** act while the player is away, because
 * offline progress is computed as a closed form with no purchases in it; this keeps
 * offline gains predictable and cheap.
 *
 * Install it after `resources`. Purchases respect any purchase guards (for example locks).
 *
 * @example
 * autoBuyers({
 *   buyers: { minerBot: { generator: 'miner', everyMs: 2000 } },
 * });
 * game.setAutoBuyer('minerBot', true);
 */
export function autoBuyers<G extends string, B extends string>(
  config: AutoBuyersConfig<G, B>,
): Plugin<AutoBuyersApi<B>, AutoBuyersEvents<G, B>> {
  const setup = (kernel: Kernel<AutoBuyersEvents<G, B>>): AutoBuyersApi<B> => {
    const game = kernel.require<ResourcesApi<string, G, string>>(RESOURCES_PLUGIN);
    const ids = Object.keys(config.buyers) as B[];
    const defs = config.buyers as Readonly<Record<string, AutoBuyerDef<G>>>;
    const buyers = new Map<B, BuyerState<G>>();
    for (const id of ids) {
      const def = defs[id] as AutoBuyerDef<G>;
      const everyMs = def.everyMs ?? 1000;
      if (!Number.isFinite(everyMs) || everyMs <= 0) {
        throw new RangeError(`autoBuyers: everyMs of "${id}" must be a positive number`);
      }
      buyers.set(id, {
        generator: def.generator,
        amount: def.amount ?? 'max',
        everyMs,
        enabled: def.enabled ?? false,
        initiallyEnabled: def.enabled ?? false,
        elapsed: 0,
      });
    }
    const buyer = (id: B): BuyerState<G> => {
      const state = buyers.get(id);
      if (state === undefined) throw new Error(`autoBuyers: unknown auto-buyer "${id}"`);
      return state;
    };

    kernel.registerSystem({
      id: AUTO_BUYERS_PLUGIN,
      tick: (dtMs) => {
        for (const [id, state] of buyers) {
          if (!state.enabled) continue;
          state.elapsed += dtMs;
          if (state.elapsed < state.everyMs) continue;
          state.elapsed %= state.everyMs;
          const amount = game.buy(state.generator, state.amount);
          if (!amount.isZero()) kernel.emit('autoBuy', { id, generator: state.generator, amount });
        }
      },
      serialize: () => {
        const out: JsonObject = {};
        for (const [id, state] of buyers) {
          out[id] = { enabled: state.enabled, elapsed: state.elapsed };
        }
        return out;
      },
      deserialize: (data) => {
        for (const state of buyers.values()) {
          state.enabled = state.initiallyEnabled;
          state.elapsed = 0;
        }
        if (data === undefined) return;
        if (!isJsonObject(data)) {
          throw new SaveCorruptedError('autoBuyers: save entry must be an object');
        }
        for (const id of ids) {
          const saved = data[id];
          if (saved === undefined) continue;
          if (
            !isJsonObject(saved) ||
            typeof saved['enabled'] !== 'boolean' ||
            typeof saved['elapsed'] !== 'number' ||
            !Number.isFinite(saved['elapsed']) ||
            saved['elapsed'] < 0
          ) {
            throw new SaveCorruptedError(`autoBuyers: invalid state for "${id}"`);
          }
          const state = buyer(id);
          state.enabled = saved['enabled'];
          state.elapsed = saved['elapsed'];
        }
      },
    });

    return {
      autoBuyerIds: ids,
      setAutoBuyer: (id, enabled) => {
        const state = buyer(id);
        if (enabled && !state.enabled) state.elapsed = 0;
        state.enabled = enabled;
      },
      isAutoBuyerEnabled: (id) => buyer(id).enabled,
    };
  };
  return definePlugin<AutoBuyersApi<B>, AutoBuyersEvents<G, B>>(AUTO_BUYERS_PLUGIN, setup);
}
