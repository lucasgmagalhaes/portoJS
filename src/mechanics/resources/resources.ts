import { BigNum } from '../../core/bignum/index.js';
import type { BigNumLike } from '../../core/bignum/index.js';
import { forEachOfflineStep } from '../../core/offline/index.js';
import { definePlugin } from '../../core/plugin.js';
import type { Plugin } from '../../core/plugin.js';
import { SaveCorruptedError, isJsonObject } from '../../core/save/index.js';
import type { JsonObject, JsonValue } from '../../core/save/index.js';
import { compileCost } from './cost.js';
import type { CostFunctions } from './cost.js';
import { solveFlows } from './flows.js';
import type { FlowSource } from './flows.js';
import type {
  BulkAmount,
  EffectTarget,
  ResetKeep,
  ResourcesApi,
  ResourcesConfig,
  ResourcesEvents,
} from './types.js';

/** Plugin name, for `kernel.require('resources')`. */
export const RESOURCES_PLUGIN = 'resources';

/**
 * A purchase is allowed when the price exceeds the balance by less than this fraction.
 * Absorbs the last-digit error that accumulating many small gains leaves behind.
 */
const AFFORD_TOLERANCE = 1e-12;

type Compiled =
  { kind: 'all' } | { kind: 'generator'; index: number } | { kind: 'resource'; index: number };

interface ResState {
  readonly initial: BigNum;
  amount: BigNum;
  earned: BigNum;
}

interface GenState {
  readonly costFns: CostFunctions;
  readonly costResource: number;
  readonly rate: BigNum;
  readonly target: { readonly kind: 'generator' | 'resource'; readonly index: number };
  readonly initialBought: BigNum;
  bought: BigNum;
  free: BigNum;
  /** Last serialized form, reused while `bought` and `free` are the same objects (immutable). */
  snapshot:
    { readonly bought: BigNum; readonly free: BigNum; readonly json: JsonObject } | undefined;
}

interface UpState {
  readonly costFns: CostFunctions;
  readonly costResource: number;
  readonly maxLevel: number;
  readonly effects: readonly { readonly target: Compiled; readonly multiplier: BigNum }[];
  level: number;
}

interface ModifierState {
  readonly target: Compiled;
  readonly value: BigNum | (() => BigNumLike);
}

function affordable(price: BigNum, balance: BigNum): boolean {
  if (price.lte(balance)) return true;
  return price.sub(balance).div(price).lt(AFFORD_TOLERANCE);
}

function readBig(value: JsonValue | undefined, label: string): BigNum {
  try {
    const parsed = BigNum.fromJSON(value);
    if (parsed.isNegative()) throw new RangeError('negative');
    return parsed;
  } catch {
    throw new SaveCorruptedError(`resources: invalid number for ${label}`);
  }
}

/**
 * Plugin providing resources, generators (with scaling costs and bulk buying), upgrades
 * and multipliers, plus exact offline production.
 *
 * Production runs in fixed steps. Offline, it is solved in closed form (a polynomial per
 * generator chain) whenever generators only feed resources or form acyclic chains, and
 * falls back to a bounded step simulation otherwise.
 *
 * @example
 * const game = createCore({
 *   plugins: [
 *     resources({
 *       resources: { gold: { initial: 10 } },
 *       generators: {
 *         miner: { cost: { resource: 'gold', base: 10, growth: 1.15 }, produces: 'gold', rate: 1 },
 *       },
 *     }),
 *   ],
 * });
 * game.buy('miner', 'max');
 */
export function resources<R extends string, G extends string = never, U extends string = never>(
  config: ResourcesConfig<R, G, U>,
): Plugin<ResourcesApi<R, G, U>, ResourcesEvents<R, G, U>> {
  return definePlugin<ResourcesApi<R, G, U>, ResourcesEvents<R, G, U>>(
    RESOURCES_PLUGIN,
    (kernel) => {
      const resourceIds = Object.keys(config.resources) as R[];
      const generatorIds = Object.keys(config.generators ?? {}) as G[];
      const upgradeIds = Object.keys(config.upgrades ?? {}) as U[];
      const resourceIndex = new Map<string, number>(resourceIds.map((id, i) => [id, i]));
      const generatorIndex = new Map<string, number>(generatorIds.map((id, i) => [id, i]));
      const upgradeIndex = new Map<string, number>(upgradeIds.map((id, i) => [id, i]));

      const resourceAt = (id: string, context: string): number => {
        const index = resourceIndex.get(id);
        if (index === undefined)
          throw new Error(`resources: ${context} uses unknown resource "${id}"`);
        return index;
      };
      const generatorAt = (id: string, context: string): number => {
        const index = generatorIndex.get(id);
        if (index === undefined)
          throw new Error(`resources: ${context} uses unknown generator "${id}"`);
        return index;
      };
      const compileTarget = (target: EffectTarget<R, G>, context: string): Compiled => {
        if ('all' in target) return { kind: 'all' };
        if ('generator' in target) {
          return { kind: 'generator', index: generatorAt(target.generator, context) };
        }
        return { kind: 'resource', index: resourceAt(target.resource, context) };
      };

      // ---- compile the config ------------------------------------------------------
      const res: ResState[] = resourceIds.map((id) => {
        const initial = BigNum.from(config.resources[id].initial ?? 0);
        return { initial, amount: initial, earned: BigNum.ZERO };
      });

      const gens: GenState[] = generatorIds.map((id) => {
        const def = (config.generators as Record<string, NonNullable<typeof config.generators>[G]>)[
          id
        ];
        if (def === undefined) throw new Error(`resources: generator "${id}" is missing`);
        const target =
          typeof def.produces === 'string'
            ? ({ kind: 'resource', index: resourceAt(def.produces, `generator "${id}"`) } as const)
            : ({
                kind: 'generator',
                index: generatorAt(def.produces.generator, `generator "${id}"`),
              } as const);
        const initialBought = BigNum.from(def.initial ?? 0).floor();
        return {
          costFns: compileCost(def.cost),
          costResource: resourceAt(def.cost.resource, `generator "${id}" cost`),
          rate: BigNum.from(def.rate),
          target,
          initialBought,
          bought: initialBought,
          free: BigNum.ZERO,
          snapshot: undefined,
        };
      });

      const ups: UpState[] = upgradeIds.map((id) => {
        const def = (config.upgrades as Record<string, NonNullable<typeof config.upgrades>[U]>)[id];
        if (def === undefined) throw new Error(`resources: upgrade "${id}" is missing`);
        return {
          costFns: compileCost(def.cost),
          costResource: resourceAt(def.cost.resource, `upgrade "${id}" cost`),
          maxLevel: def.maxLevel ?? 1,
          effects: def.effects.map((effect) => ({
            target: compileTarget(effect, `upgrade "${id}"`),
            multiplier: BigNum.from(effect.multiplier),
          })),
          level: 0,
        };
      });

      const hasChains = gens.some((g) => g.target.kind === 'generator');
      const maxChain = config.offline?.maxChain;
      const maxSteps = config.offline?.maxSteps;

      // ---- multiplier caches -------------------------------------------------------
      const genUpgradeMult: BigNum[] = gens.map(() => BigNum.ONE);
      const resUpgradeMult: BigNum[] = res.map(() => BigNum.ONE);
      let allUpgradeMult: BigNum = BigNum.ONE;
      let baseEff: BigNum[] = gens.map((g) => g.rate);

      const modifiers = new Map<string, ModifierState>();
      const modGen: BigNum[] = gens.map(() => BigNum.ONE);
      const modRes: BigNum[] = res.map(() => BigNum.ONE);
      let modAll: BigNum = BigNum.ONE;

      const applyMultiplier = (
        target: Compiled,
        value: BigNum,
        into: 'upgrade' | 'modifier',
      ): void => {
        const generatorsArr = into === 'upgrade' ? genUpgradeMult : modGen;
        const resourcesArr = into === 'upgrade' ? resUpgradeMult : modRes;
        if (target.kind === 'generator') {
          generatorsArr[target.index] = (generatorsArr[target.index] as BigNum).mul(value);
        } else if (target.kind === 'resource') {
          resourcesArr[target.index] = (resourcesArr[target.index] as BigNum).mul(value);
        } else if (into === 'upgrade') {
          allUpgradeMult = allUpgradeMult.mul(value);
        } else {
          modAll = modAll.mul(value);
        }
      };

      /** `rate × multipliers × dt` per generator, valid while nothing that feeds it changes. */
      let effDt: BigNum[] = [];
      let effDtFor = Number.NaN;
      let dtCache: { readonly seconds: number; readonly value: BigNum } | undefined;

      const rebuildUpgradeCaches = (): void => {
        genUpgradeMult.fill(BigNum.ONE);
        resUpgradeMult.fill(BigNum.ONE);
        allUpgradeMult = BigNum.ONE;
        for (const up of ups) {
          if (up.level === 0) continue;
          for (const effect of up.effects) {
            applyMultiplier(effect.target, effect.multiplier.pow(up.level), 'upgrade');
          }
        }
        baseEff = gens.map((g, i) => g.rate.mul(genUpgradeMult[i] as BigNum).mul(allUpgradeMult));
        effDtFor = Number.NaN;
      };

      const refreshModifiers = (): void => {
        if (modifiers.size === 0) return;
        modGen.fill(BigNum.ONE);
        modRes.fill(BigNum.ONE);
        modAll = BigNum.ONE;
        for (const modifier of modifiers.values()) {
          const value =
            typeof modifier.value === 'function' ? BigNum.from(modifier.value()) : modifier.value;
          applyMultiplier(modifier.target, value, 'modifier');
        }
      };

      const effOf = (i: number): BigNum =>
        modifiers.size === 0
          ? (baseEff[i] as BigNum)
          : (baseEff[i] as BigNum).mul(modGen[i] as BigNum).mul(modAll);
      const resMultOf = (r: number): BigNum =>
        modifiers.size === 0
          ? (resUpgradeMult[r] as BigNum)
          : (resUpgradeMult[r] as BigNum).mul(modRes[r] as BigNum);

      // ---- production --------------------------------------------------------------
      const pendingRes: BigNum[] = res.map(() => BigNum.ZERO);
      const pendingGen: BigNum[] = gens.map(() => BigNum.ZERO);

      /** Computes what every generator emits over `dt` seconds, into the scratch arrays. */
      const produce = (dt: BigNum, cacheKey?: number): void => {
        pendingRes.fill(BigNum.ZERO);
        if (hasChains) pendingGen.fill(BigNum.ZERO);
        // Dynamic modifiers are re-read every tick, so the cache only applies without them.
        const cached = cacheKey !== undefined && modifiers.size === 0;
        if (cached && effDtFor !== cacheKey) {
          effDt = gens.map((_, i) => effOf(i).mul(dt));
          effDtFor = cacheKey;
        }
        for (let i = 0; i < gens.length; i++) {
          const g = gens[i] as GenState;
          const hasFree = !g.free.isZero();
          if (g.bought.isZero() && !hasFree) continue;
          const held = hasFree ? g.bought.add(g.free) : g.bought;
          const out = held.mul(cached ? (effDt[i] as BigNum) : effOf(i).mul(dt));
          const t = g.target.index;
          if (g.target.kind === 'resource') pendingRes[t] = (pendingRes[t] as BigNum).add(out);
          else pendingGen[t] = (pendingGen[t] as BigNum).add(out);
        }
      };

      const credit = (r: number, amount: BigNum): void => {
        const state = res[r] as ResState;
        state.amount = state.amount.add(amount);
        state.earned = state.earned.add(amount);
      };

      const step = (dtSeconds: number): void => {
        refreshModifiers();
        if (dtCache?.seconds !== dtSeconds) {
          dtCache = { seconds: dtSeconds, value: BigNum.from(dtSeconds) };
        }
        produce(dtCache.value, dtSeconds);
        for (let r = 0; r < res.length; r++) {
          const pending = pendingRes[r] as BigNum;
          if (!pending.isZero()) credit(r, pending.mul(resMultOf(r)));
        }
        if (hasChains) {
          for (let i = 0; i < gens.length; i++) {
            const pending = pendingGen[i] as BigNum;
            if (!pending.isZero()) {
              const g = gens[i] as GenState;
              g.free = g.free.add(pending);
            }
          }
        }
      };

      const offlineCredit = (ms: number): void => {
        const before = res.map((r) => r.amount);
        const seconds = ms / 1000;
        refreshModifiers();
        const sources: FlowSource[] = gens.map((g, i) => ({
          initial: g.bought.add(g.free),
          coefficient:
            g.target.kind === 'resource' ? effOf(i).mul(resMultOf(g.target.index)) : effOf(i),
          target: g.target,
        }));
        const solved = solveFlows(sources, res.length, seconds, maxChain);
        if (solved) {
          solved.counts.forEach((count, i) => {
            const g = gens[i] as GenState;
            const free = count.sub(g.bought);
            g.free = free.isNegative() ? BigNum.ZERO : free;
          });
          solved.gains.forEach((gain, r) => {
            if (!gain.isZero()) credit(r, gain);
          });
        } else {
          forEachOfflineStep(ms, (stepMs) => step(stepMs / 1000), {
            ...(maxSteps === undefined ? {} : { maxSteps }),
          });
        }
        const gains = {} as Record<R, BigNum>;
        resourceIds.forEach((id, r) => {
          gains[id] = (res[r] as ResState).amount.sub(before[r] as BigNum);
        });
        kernel.emit('offlineGains', { elapsedMs: ms, gains });
      };

      // ---- state -------------------------------------------------------------------
      const resetAll = (): void => {
        res.forEach((r) => {
          r.amount = r.initial;
          r.earned = BigNum.ZERO;
        });
        gens.forEach((g) => {
          g.bought = g.initialBought;
          g.free = BigNum.ZERO;
        });
        ups.forEach((u) => {
          u.level = 0;
        });
        rebuildUpgradeCaches();
      };

      kernel.registerSystem({
        id: RESOURCES_PLUGIN,
        tick: (dtMs) => step(dtMs / 1000),
        offline: offlineCredit,
        serialize: () => {
          const resourcesOut: JsonObject = {};
          const generatorsOut: JsonObject = {};
          const upgradesOut: JsonObject = {};
          resourceIds.forEach((id, i) => {
            const r = res[i] as ResState;
            resourcesOut[id] = { amount: r.amount.toJSON(), earned: r.earned.toJSON() };
          });
          generatorIds.forEach((id, i) => {
            const g = gens[i] as GenState;
            const snap = g.snapshot;
            if (snap !== undefined && snap.bought === g.bought && snap.free === g.free) {
              generatorsOut[id] = snap.json;
              return;
            }
            const json: JsonObject = { bought: g.bought.toJSON(), free: g.free.toJSON() };
            g.snapshot = { bought: g.bought, free: g.free, json };
            generatorsOut[id] = json;
          });
          upgradeIds.forEach((id, i) => {
            upgradesOut[id] = (ups[i] as UpState).level;
          });
          return { resources: resourcesOut, generators: generatorsOut, upgrades: upgradesOut };
        },
        deserialize: (data) => {
          resetAll();
          if (data === undefined) return;
          if (!isJsonObject(data))
            throw new SaveCorruptedError('resources: save entry must be an object');
          const section = (key: string): JsonObject => {
            const value = data[key];
            return isJsonObject(value) ? value : {};
          };
          const savedRes = section('resources');
          const savedGens = section('generators');
          const savedUps = section('upgrades');
          resourceIds.forEach((id, i) => {
            const saved = savedRes[id];
            if (!isJsonObject(saved)) return;
            const r = res[i] as ResState;
            r.amount = readBig(saved['amount'], `${id}.amount`);
            r.earned = readBig(saved['earned'], `${id}.earned`);
          });
          generatorIds.forEach((id, i) => {
            const saved = savedGens[id];
            if (!isJsonObject(saved)) return;
            const g = gens[i] as GenState;
            g.bought = readBig(saved['bought'], `${id}.bought`).floor();
            g.free = readBig(saved['free'], `${id}.free`);
          });
          upgradeIds.forEach((id, i) => {
            const saved = savedUps[id];
            if (saved === undefined) return;
            const u = ups[i] as UpState;
            if (
              typeof saved !== 'number' ||
              !Number.isInteger(saved) ||
              saved < 0 ||
              saved > u.maxLevel
            ) {
              throw new SaveCorruptedError(`resources: invalid level for upgrade "${id}"`);
            }
            u.level = saved;
          });
          rebuildUpgradeCaches();
        },
      });
      rebuildUpgradeCaches();

      // ---- public API --------------------------------------------------------------
      const resState = (id: R): ResState => {
        const index = resourceIndex.get(id);
        if (index === undefined) throw new Error(`resources: unknown resource "${id}"`);
        return res[index] as ResState;
      };
      const genAt = (id: G): number => {
        const index = generatorIndex.get(id);
        if (index === undefined) throw new Error(`resources: unknown generator "${id}"`);
        return index;
      };
      const upAt = (id: U): number => {
        const index = upgradeIndex.get(id);
        if (index === undefined) throw new Error(`resources: unknown upgrade "${id}"`);
        return index;
      };
      const validateCount = (amount: number): BigNum => {
        if (!Number.isInteger(amount) || amount < 1) {
          throw new RangeError('resources: amount must be a positive integer or "max"');
        }
        return BigNum.from(amount);
      };
      const maxFor = (g: GenState): BigNum =>
        g.costFns.max(g.bought, (res[g.costResource] as ResState).amount);
      const totalFor = (g: GenState, amount: BulkAmount): BigNum => {
        if (amount === 'max') {
          const count = maxFor(g);
          return g.costFns.total(g.bought, count.isZero() ? BigNum.ONE : count);
        }
        return g.costFns.total(g.bought, validateCount(amount));
      };

      const api: ResourcesApi<R, G, U> = {
        resourceIds,
        generatorIds,
        upgradeIds,

        amount: (id) => resState(id).amount,
        earned: (id) => resState(id).earned,
        rate: (id) => {
          const target = resourceAt(id, 'rate()');
          refreshModifiers();
          produce(BigNum.ONE);
          return (pendingRes[target] as BigNum).mul(resMultOf(target));
        },
        add: (id, amount) => {
          const value = BigNum.from(amount);
          if (value.isNegative()) throw new RangeError('resources: add() needs an amount >= 0');
          const state = resState(id);
          state.amount = state.amount.add(value);
          state.earned = state.earned.add(value);
        },
        spend: (id, amount) => {
          const value = BigNum.from(amount);
          if (value.isNegative()) throw new RangeError('resources: spend() needs an amount >= 0');
          const state = resState(id);
          if (!affordable(value, state.amount)) return false;
          state.amount = value.gte(state.amount) ? BigNum.ZERO : state.amount.sub(value);
          return true;
        },

        count: (id) => {
          const g = gens[genAt(id)] as GenState;
          return g.bought.add(g.free);
        },
        bought: (id) => (gens[genAt(id)] as GenState).bought,
        cost: (id, amount = 1) => totalFor(gens[genAt(id)] as GenState, amount),
        canBuy: (id, amount = 1) => {
          const g = gens[genAt(id)] as GenState;
          if (amount === 'max') return maxFor(g).gt(0);
          return affordable(totalFor(g, amount), (res[g.costResource] as ResState).amount);
        },
        maxAffordable: (id) => maxFor(gens[genAt(id)] as GenState),
        buy: (id, amount = 1) => {
          const index = genAt(id);
          const g = gens[index] as GenState;
          const wallet = res[g.costResource] as ResState;
          const count = amount === 'max' ? maxFor(g) : validateCount(amount);
          if (count.isZero()) return BigNum.ZERO;
          const price = g.costFns.total(g.bought, count);
          if (!affordable(price, wallet.amount)) return BigNum.ZERO;
          wallet.amount = price.gte(wallet.amount) ? BigNum.ZERO : wallet.amount.sub(price);
          g.bought = g.bought.add(count);
          kernel.emit('purchase', {
            kind: 'generator',
            id,
            amount: count,
            cost: price,
            resource: resourceIds[g.costResource] as R,
          });
          return count;
        },

        upgradeLevel: (id) => (ups[upAt(id)] as UpState).level,
        upgradeCost: (id) => {
          const u = ups[upAt(id)] as UpState;
          return u.level >= u.maxLevel ? undefined : u.costFns.unit(BigNum.from(u.level));
        },
        canBuyUpgrade: (id) => {
          const u = ups[upAt(id)] as UpState;
          if (u.level >= u.maxLevel) return false;
          const price = u.costFns.unit(BigNum.from(u.level));
          return affordable(price, (res[u.costResource] as ResState).amount);
        },
        buyUpgrade: (id) => {
          const u = ups[upAt(id)] as UpState;
          if (u.level >= u.maxLevel) return false;
          const wallet = res[u.costResource] as ResState;
          const price = u.costFns.unit(BigNum.from(u.level));
          if (!affordable(price, wallet.amount)) return false;
          wallet.amount = price.gte(wallet.amount) ? BigNum.ZERO : wallet.amount.sub(price);
          u.level += 1;
          rebuildUpgradeCaches();
          kernel.emit('purchase', {
            kind: 'upgrade',
            id,
            level: u.level,
            cost: price,
            resource: resourceIds[u.costResource] as R,
          });
          return true;
        },

        multiplier: (target) => {
          const compiled = compileTarget(target, 'multiplier()');
          refreshModifiers();
          const mods = modifiers.size > 0;
          if (compiled.kind === 'all') return mods ? allUpgradeMult.mul(modAll) : allUpgradeMult;
          if (compiled.kind === 'resource') return resMultOf(compiled.index);
          const own = genUpgradeMult[compiled.index] as BigNum;
          const withAll = own.mul(allUpgradeMult);
          return mods ? withAll.mul(modGen[compiled.index] as BigNum).mul(modAll) : withAll;
        },
        setModifier: (id, target, multiplier) => {
          modifiers.set(id, {
            target: compileTarget(target, `modifier "${id}"`),
            value: typeof multiplier === 'function' ? multiplier : BigNum.from(multiplier),
          });
        },
        removeModifier: (id) => {
          const removed = modifiers.delete(id);
          if (modifiers.size === 0) {
            modGen.fill(BigNum.ONE);
            modRes.fill(BigNum.ONE);
            modAll = BigNum.ONE;
          }
          return removed;
        },

        resetRun: (keep: ResetKeep<R, G, U> = {}) => {
          const keptRes = res.map((r) => r.amount);
          const keptGens = gens.map((g) => ({ bought: g.bought, free: g.free }));
          const keptUps = ups.map((u) => u.level);
          resetAll();
          for (const id of keep.resources ?? []) {
            const index = resourceIndex.get(id);
            if (index !== undefined) (res[index] as ResState).amount = keptRes[index] as BigNum;
          }
          for (const id of keep.generators ?? []) {
            const index = generatorIndex.get(id);
            if (index === undefined) continue;
            const g = gens[index] as GenState;
            const saved = keptGens[index] as { bought: BigNum; free: BigNum };
            g.bought = saved.bought;
            g.free = saved.free;
          }
          for (const id of keep.upgrades ?? []) {
            const index = upgradeIndex.get(id);
            if (index !== undefined) (ups[index] as UpState).level = keptUps[index] as number;
          }
          rebuildUpgradeCaches();
        },
      };
      return api;
    },
  );
}
