import { BigNum } from '../../core/bignum/index.js';
import type { BigNumLike } from '../../core/bignum/index.js';
import { definePlugin } from '../../core/plugin.js';
import type { Plugin } from '../../core/plugin.js';
import { SaveCorruptedError, isJsonObject } from '../../core/save/index.js';
import type { JsonObject } from '../../core/save/index.js';
import { compileFormula } from '../prestige/prestige.js';
import type { PrestigeBonus, PrestigeFormula } from '../prestige/prestige.js';
import { RESOURCES_PLUGIN } from '../resources/resources.js';
import type { ResetKeep, ResourcesApi } from '../resources/types.js';

/** Plugin name. */
export const PRESTIGE_LAYERS_PLUGIN = 'prestigeLayers';

/** Declares one prestige layer. */
export interface PrestigeLayerDef<R extends string, G extends string, U extends string> {
  /**
   * What the reward is computed from: the total earned of a resource in the current run, or
   * `{ layer }` for the points a lower layer has produced since a higher layer last reset it.
   */
  readonly basedOn: R | { readonly layer: string };
  /** Reward formula, see {@link PrestigeFormula}. */
  readonly gain: PrestigeFormula;
  /** Smallest reward that allows ascending. Default `1`. */
  readonly minimum?: BigNumLike;
  /** What survives the run reset. Default: nothing. */
  readonly keep?: ResetKeep<R, G, U>;
  /** Permanent bonuses derived from this layer's points. */
  readonly bonuses?: readonly PrestigeBonus<R, G>[];
  /**
   * Whether ascending this layer also clears the points of every lower layer. Default `true`,
   * the usual rule: a higher reset is "bigger" and wipes the layers beneath it.
   */
  readonly resetsLower?: boolean;
}

/** Configuration of the {@link prestigeLayers} plugin. */
export interface PrestigeLayersConfig<
  R extends string,
  G extends string,
  U extends string,
  L extends string,
> {
  /** Layers by id, **lowest first**. A layer may only be based on a layer listed before it. */
  readonly layers: { readonly [id in L]: PrestigeLayerDef<R, G, U> };
}

/** Events emitted by the {@link prestigeLayers} plugin. */
export interface PrestigeLayersEvents<L extends string> {
  /** A layer was ascended. */
  ascended: {
    readonly layer: L;
    readonly gained: BigNum;
    readonly points: BigNum;
    readonly count: number;
  };
}

/** Methods the {@link prestigeLayers} plugin adds to the game. */
export interface PrestigeLayersApi<L extends string> {
  /** Ids of all layers, lowest first. */
  readonly layerIds: readonly L[];
  /** Points a layer currently holds. */
  layerPoints(layer: L): BigNum;
  /** Points a layer has gained over all time (spending and resets do not reduce it). */
  layerLifetime(layer: L): BigNum;
  /** Times a layer has been ascended. */
  layerCount(layer: L): number;
  /** Points ascending a layer would grant now (`0` below the minimum). */
  pendingLayer(layer: L): BigNum;
  /** Whether ascending a layer now would grant at least the minimum. */
  canAscend(layer: L): boolean;
  /**
   * Ascends a layer: resets the run, grants points, clears lower layers' points (unless the
   * layer sets `resetsLower: false`) and keeps what the layer lists.
   *
   * @returns points gained, or `undefined` (nothing happens) if the layer cannot ascend yet.
   */
  ascend(layer: L): BigNum | undefined;
  /** Spends a layer's points. Returns `false` and changes nothing if short. */
  spendLayerPoints(layer: L, amount: BigNumLike): boolean;
}

interface LayerState {
  points: BigNum;
  lifetime: BigNum;
  count: number;
  /** Points gained since a higher layer last reset this one; the basis for the layer above. */
  runGained: BigNum;
}

const fresh = (): LayerState => ({
  points: BigNum.ZERO,
  lifetime: BigNum.ZERO,
  count: 0,
  runGained: BigNum.ZERO,
});

/**
 * Plugin for several prestige layers stacked on one another (reset, then a bigger reset
 * built on the first). Install it after `resources`. For a single layer, the simpler
 * `prestige` plugin is enough.
 *
 * @example
 * prestigeLayers<'gold', never, never, 'ascension' | 'transcendence'>({
 *   layers: {
 *     ascension: { basedOn: 'gold', gain: { threshold: 1e6 } },
 *     transcendence: {
 *       basedOn: { layer: 'ascension' },
 *       gain: { threshold: 100 },
 *       bonuses: [{ target: { all: true }, perPoint: 1 }],
 *     },
 *   },
 * });
 */
export function prestigeLayers<
  R extends string,
  G extends string = never,
  U extends string = never,
  L extends string = string,
>(config: PrestigeLayersConfig<R, G, U, L>): Plugin<PrestigeLayersApi<L>, PrestigeLayersEvents<L>> {
  return definePlugin<PrestigeLayersApi<L>, PrestigeLayersEvents<L>>(
    PRESTIGE_LAYERS_PLUGIN,
    (kernel) => {
      const game = kernel.require<ResourcesApi<R, G, U>>(RESOURCES_PLUGIN);
      const ids = Object.keys(config.layers) as L[];
      const defs = config.layers as Readonly<Record<string, PrestigeLayerDef<R, G, U>>>;
      const order = new Map<string, number>(ids.map((id, i) => [id, i]));
      const states = new Map<L, LayerState>(ids.map((id) => [id, fresh()]));
      const formulas = new Map<L, (basis: BigNum) => BigNum>();
      const minimums = new Map<L, BigNum>();

      for (const id of ids) {
        const def = defs[id] as PrestigeLayerDef<R, G, U>;
        formulas.set(id, compileFormula(def.gain));
        minimums.set(id, BigNum.from(def.minimum ?? 1));
        if (typeof def.basedOn !== 'string') {
          const base = order.get(def.basedOn.layer);
          if (base === undefined || base >= (order.get(id) as number)) {
            throw new Error(
              `prestigeLayers: layer "${id}" is based on "${def.basedOn.layer}", which must be listed before it`,
            );
          }
        }
      }

      const state = (id: L): LayerState => {
        const s = states.get(id);
        if (s === undefined) throw new Error(`prestigeLayers: unknown layer "${id}"`);
        return s;
      };

      const basisOf = (id: L): BigNum => {
        const { basedOn } = defs[id] as PrestigeLayerDef<R, G, U>;
        return typeof basedOn === 'string'
          ? game.earned(basedOn)
          : state(basedOn.layer as L).runGained;
      };

      const pending = (id: L): BigNum => {
        const value = (formulas.get(id) as (b: BigNum) => BigNum)(basisOf(id)).floor();
        return value.lt(minimums.get(id) as BigNum) ? BigNum.ZERO : value;
      };

      ids.forEach((id) => {
        const def = defs[id] as PrestigeLayerDef<R, G, U>;
        (def.bonuses ?? []).forEach((bonus, i) => {
          const perPoint = 'perPoint' in bonus ? BigNum.from(bonus.perPoint) : undefined;
          game.setModifier(`${PRESTIGE_LAYERS_PLUGIN}:${id}:${i}`, bonus.target, () => {
            const s = state(id);
            if (perPoint !== undefined) return s.points.mul(perPoint).add(1);
            return 'multiplier' in bonus ? bonus.multiplier(s.points, s.lifetime) : 1;
          });
        });
      });

      kernel.registerSystem({
        id: PRESTIGE_LAYERS_PLUGIN,
        serialize: () => {
          const out: JsonObject = {};
          for (const [id, s] of states) {
            out[id] = {
              points: s.points.toJSON(),
              lifetime: s.lifetime.toJSON(),
              count: s.count,
              runGained: s.runGained.toJSON(),
            };
          }
          return out;
        },
        deserialize: (data) => {
          for (const id of ids) states.set(id, fresh());
          if (data === undefined) return;
          if (!isJsonObject(data)) {
            throw new SaveCorruptedError('prestigeLayers: save entry must be an object');
          }
          for (const id of ids) {
            const saved = data[id];
            if (saved === undefined) continue;
            if (!isJsonObject(saved)) {
              throw new SaveCorruptedError(`prestigeLayers: invalid state for "${id}"`);
            }
            const count = saved['count'] ?? 0;
            if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
              throw new SaveCorruptedError(`prestigeLayers: invalid count for "${id}"`);
            }
            try {
              const next: LayerState = {
                points: BigNum.fromJSON(saved['points'] ?? 0),
                lifetime: BigNum.fromJSON(saved['lifetime'] ?? 0),
                count,
                runGained: BigNum.fromJSON(saved['runGained'] ?? 0),
              };
              if ([next.points, next.lifetime, next.runGained].some((v) => v.isNegative())) {
                throw new RangeError('negative');
              }
              states.set(id, next);
            } catch {
              throw new SaveCorruptedError(`prestigeLayers: invalid numbers for "${id}"`);
            }
          }
        },
      });

      return {
        layerIds: ids,
        layerPoints: (id) => state(id).points,
        layerLifetime: (id) => state(id).lifetime,
        layerCount: (id) => state(id).count,
        pendingLayer: (id) => {
          state(id);
          return pending(id);
        },
        canAscend: (id) => {
          state(id);
          return !pending(id).isZero();
        },
        ascend: (id) => {
          const s = state(id);
          const gained = pending(id);
          if (gained.isZero()) return undefined;
          const def = defs[id] as PrestigeLayerDef<R, G, U>;
          s.points = s.points.add(gained);
          s.lifetime = s.lifetime.add(gained);
          s.runGained = s.runGained.add(gained);
          s.count += 1;
          if (def.resetsLower ?? true) {
            const index = order.get(id) as number;
            ids.slice(0, index).forEach((lower) => {
              const ls = state(lower);
              ls.points = BigNum.ZERO;
              ls.runGained = BigNum.ZERO;
            });
          }
          game.resetRun(def.keep);
          kernel.emit('ascended', { layer: id, gained, points: s.points, count: s.count });
          return gained;
        },
        spendLayerPoints: (id, amount) => {
          const s = state(id);
          const value = BigNum.from(amount);
          if (value.isNegative()) throw new RangeError('prestigeLayers: amount must be >= 0');
          if (value.gt(s.points)) return false;
          s.points = s.points.sub(value);
          return true;
        },
      };
    },
  );
}
