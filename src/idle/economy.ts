import { BigNum } from '../core/bignum/index.js';
import type { BigNumLike } from '../core/bignum/index.js';
import { forEachOfflineStep } from '../core/offline/index.js';
import { Component, GameEvent } from '../runtime/index.js';
import type { Game, GameObject } from '../runtime/index.js';
import { solveFlows } from './flows.js';
import type { FlowSource } from './flows.js';
import { Generator } from './generator.js';
import type { GeneratorPurchase } from './generator.js';
import { Resource } from './resource.js';
import { filled } from './shared.js';
import type { EffectTarget, ResetKeep } from './shared.js';
import { Upgrade } from './upgrade.js';
import type { UpgradePurchase } from './upgrade.js';

/**
 * Name of the object the economy lives on when it is created automatically.
 */
export const ECONOMY_OBJECT = '[Economy]';

/**
 * Passed to dynamic modifier functions.
 */
export interface ModifierContext {
  /**
   * `true` while away-time is being credited (a span the modifier cannot track tick by tick).
   */
  readonly offline: boolean;
}

/**
 * A modifier value: a constant, or a function re-read every step.
 */
export type ModifierValue = BigNumLike | ((context: ModifierContext) => BigNumLike);

/**
 * Return `false` to forbid buying the target right now.
 */
export type PurchaseGuard = (target: Generator | Upgrade) => boolean;

/**
 * Payload of {@link Economy.purchased}.
 */
export type Purchase =
  | ({ readonly kind: 'generator' } & GeneratorPurchase)
  | ({ readonly kind: 'upgrade' } & UpgradePurchase);

/**
 * Payload of {@link Economy.offlineGains}.
 */
export interface OfflineGains {
  /**
   * The credited span in ms.
   */
  readonly elapsedMs: number;
  /**
   * What each resource gained.
   */
  readonly gains: ReadonlyMap<Resource, BigNum>;
}

/**
 * Options for {@link Economy}.
 */
export interface EconomyOptions {
  /**
   * Longest generator chain solved in closed form while offline. Default `64`.
   */
  readonly maxChain?: number;
  /**
   * Step budget for the simulation fallback while offline. Default `1000`.
   */
  readonly maxSteps?: number;
}

interface ModifierState {
  readonly target: EffectTarget;
  readonly value: BigNum | ((context: ModifierContext) => BigNumLike);
}

function indexMap<T>(items: readonly T[]): Map<T, number> {
  const index = new Map<T, number>();
  for (let i = 0; i < items.length; i++) index.set(items[i] as T, i);
  return index;
}

/**
 * The part of the idle mechanics that spans many objects: it turns generators into production
 * every step, solves offline gains exactly, and owns the multipliers (from upgrades and from
 * outside modifiers) and the purchase guards.
 *
 * You rarely create it yourself: the first {@link Generator} or {@link Upgrade} adds one. Create
 * it explicitly, before them, only to change its options.
 *
 * Offline, production is solved in closed form (a polynomial per generator chain) whenever
 * generators only feed resources or form acyclic chains, and falls back to a bounded step
 * simulation otherwise.
 *
 * @example
 * const economy = Economy.of(game);
 * economy.setModifier('frenzy', { resource: gold }, 2);
 */
export class Economy extends Component {
  static override typeId = 'Economy';
  static override executionOrder = -100;

  /**
   * Fired after any generator or upgrade purchase.
   */
  readonly purchased = new GameEvent<Purchase>();

  /**
   * Fired after away-time production was credited.
   */
  readonly offlineGains = new GameEvent<OfflineGains>();

  private readonly maxChain: number | undefined;
  private readonly maxSteps: number | undefined;
  private readonly modifiers = new Map<string, ModifierState>();
  private readonly guards = new Map<string, PurchaseGuard>();

  private syncedVersion = -1;
  private generators: readonly Generator[] = [];
  private resourceList: readonly Resource[] = [];
  private upgradeList: readonly Upgrade[] = [];
  private generatorIndex = new Map<Generator, number>();
  private resourceIndex = new Map<Resource, number>();
  private targetsResource: boolean[] = [];
  private targetIndex: number[] = [];
  private hasChains = false;

  private genUpgradeMult: BigNum[] = [];
  private resUpgradeMult: BigNum[] = [];
  private allUpgradeMult: BigNum = BigNum.ONE;
  private baseEff: BigNum[] = [];
  private upgradesDirty = true;

  private modGen: BigNum[] = [];
  private modRes: BigNum[] = [];
  private modAll: BigNum = BigNum.ONE;
  private inOffline = false;

  private effDt: BigNum[] = [];
  private effDtFor = Number.NaN;
  private dtCache: { readonly seconds: number; readonly value: BigNum } | undefined;
  private pendingRes: BigNum[] = [];
  private pendingGen: BigNum[] = [];

  private readonly stepSeconds = (stepMs: number): void => {
    this.step(stepMs / 1000);
  };

  constructor(gameObject: GameObject, options: EconomyOptions = {}) {
    super(gameObject);
    this.maxChain = options.maxChain;
    this.maxSteps = options.maxSteps;
  }

  /**
   * The economy of a game, created on demand.
   */
  static of(game: Game): Economy {
    const found = game.findObjectOfType(Economy);
    if (found !== undefined) return found;
    return game.createObject(ECONOMY_OBJECT).addComponent(Economy);
  }

  /**
   * The economy of a game, or `undefined` if none exists yet.
   */
  static existing(game: Game): Economy | undefined {
    return game.findObjectOfType(Economy);
  }

  /**
   * Registers (or replaces) a named multiplier from outside, such as a prestige bonus. Pass a
   * function to have it re-read every step; it also receives whether away-time is being
   * credited, so time-limited modifiers can step aside offline.
   */
  setModifier(id: string, target: EffectTarget, value: ModifierValue): void {
    this.modifiers.set(id, {
      target,
      value: typeof value === 'function' ? value : BigNum.from(value),
    });
    this.effDtFor = Number.NaN;
  }

  /**
   * Removes a modifier. Returns whether it existed.
   */
  removeModifier(id: string): boolean {
    const removed = this.modifiers.delete(id);
    if (this.modifiers.size === 0) {
      this.modGen.fill(BigNum.ONE);
      this.modRes.fill(BigNum.ONE);
      this.modAll = BigNum.ONE;
    }
    this.effDtFor = Number.NaN;
    return removed;
  }

  /**
   * Registers (or replaces) a named guard that can forbid purchases, for example until
   * something is unlocked. A purchase happens only if every guard allows it.
   */
  setPurchaseGuard(name: string, guard: PurchaseGuard): void {
    this.guards.set(name, guard);
  }

  /**
   * Removes a guard. Returns whether it existed.
   */
  removePurchaseGuard(name: string): boolean {
    return this.guards.delete(name);
  }

  /**
   * Whether every guard allows buying `target`.
   */
  allows(target: Generator | Upgrade): boolean {
    for (const guard of this.guards.values()) {
      if (!guard(target)) return false;
    }
    return true;
  }

  /**
   * Tells the economy that upgrade levels changed, so multipliers are recomputed.
   *
   * @internal
   */
  invalidate(): void {
    this.upgradesDirty = true;
  }

  /**
   * Production per second of a resource, multipliers included.
   */
  rateOf(resource: Resource): BigNum {
    this.ensureCaches();
    const index = this.resourceIndex.get(resource);
    if (index === undefined) return BigNum.ZERO;
    this.refreshModifiers();
    this.produce(BigNum.ONE);
    return (this.pendingRes[index] as BigNum).mul(this.resMultOf(index));
  }

  /**
   * Total multiplier currently applied to a target (upgrades and modifiers).
   */
  multiplierOf(target: EffectTarget): BigNum {
    this.ensureCaches();
    this.refreshModifiers();
    const hasModifiers = this.modifiers.size > 0;
    if ('all' in target) {
      return hasModifiers ? this.allUpgradeMult.mul(this.modAll) : this.allUpgradeMult;
    }
    if ('resource' in target) {
      const index = this.resourceIndex.get(target.resource);
      return index === undefined ? BigNum.ONE : this.resMultOf(index);
    }
    const index = this.generatorIndex.get(target.generator);
    if (index === undefined) return BigNum.ONE;
    const withAll = (this.genUpgradeMult[index] as BigNum).mul(this.allUpgradeMult);
    return hasModifiers ? withAll.mul(this.modGen[index] as BigNum).mul(this.modAll) : withAll;
  }

  /**
   * Returns the run to its starting state, keeping what `keep` lists. Run totals restart from
   * zero. This is the hook prestige uses.
   */
  resetRun(keep: ResetKeep = {}): void {
    this.sync();
    for (const resource of this.resourceList) {
      resource.resetRun(keep.resources?.includes(resource) ?? false);
    }
    for (const generator of this.generators) {
      generator.resetRun(keep.generators?.includes(generator) ?? false);
    }
    for (const upgrade of this.upgradeList) {
      if (!(keep.upgrades?.includes(upgrade) ?? false)) upgrade.setLevel(0);
    }
    this.upgradesDirty = true;
  }

  override fixedUpdate(deltaTime: number): void {
    this.step(deltaTime);
  }

  override onOffline(elapsedMs: number): void {
    this.inOffline = true;
    try {
      this.creditAway(elapsedMs);
    } finally {
      this.inOffline = false;
    }
  }

  private sync(): void {
    const version = this.game.structureVersion;
    if (version === this.syncedVersion) return;
    this.syncedVersion = version;
    this.generators = this.game.findObjectsOfType(Generator);
    this.resourceList = this.game.findObjectsOfType(Resource);
    this.upgradeList = this.game.findObjectsOfType(Upgrade);
    this.generatorIndex = indexMap(this.generators);
    this.resourceIndex = indexMap(this.resourceList);
    this.targetsResource = [];
    this.targetIndex = [];
    this.hasChains = false;
    for (const generator of this.generators) {
      const produces = generator.produces;
      const isResource = produces instanceof Resource;
      const index = isResource
        ? this.resourceIndex.get(produces)
        : this.generatorIndex.get(produces);
      if (index === undefined) {
        throw new Error('Economy: a generator produces a component that is not in the game');
      }
      this.targetsResource.push(isResource);
      this.targetIndex.push(index);
      if (!isResource) this.hasChains = true;
    }
    this.modGen = filled(this.generators.length, BigNum.ONE);
    this.modRes = filled(this.resourceList.length, BigNum.ONE);
    this.pendingRes = filled(this.resourceList.length, BigNum.ZERO);
    this.pendingGen = filled(this.generators.length, BigNum.ZERO);
    this.upgradesDirty = true;
    this.effDtFor = Number.NaN;
  }

  private ensureCaches(): void {
    this.sync();
    if (!this.upgradesDirty) return;
    this.genUpgradeMult = filled(this.generators.length, BigNum.ONE);
    this.resUpgradeMult = filled(this.resourceList.length, BigNum.ONE);
    this.allUpgradeMult = BigNum.ONE;
    for (const upgrade of this.upgradeList) {
      const level = upgrade.level;
      if (level === 0) continue;
      for (const effect of upgrade.effects) {
        this.applyMultiplier(effect, BigNum.from(effect.multiplier).pow(level), 'upgrade');
      }
    }
    this.baseEff = [];
    for (let i = 0; i < this.generators.length; i++) {
      const rate = (this.generators[i] as Generator).rate;
      this.baseEff.push(rate.mul(this.genUpgradeMult[i] as BigNum).mul(this.allUpgradeMult));
    }
    this.upgradesDirty = false;
    this.effDtFor = Number.NaN;
  }

  private applyMultiplier(target: EffectTarget, value: BigNum, into: 'upgrade' | 'modifier'): void {
    const upgrade = into === 'upgrade';
    if ('all' in target) {
      if (upgrade) this.allUpgradeMult = this.allUpgradeMult.mul(value);
      else this.modAll = this.modAll.mul(value);
    } else if ('generator' in target) {
      const index = this.generatorIndex.get(target.generator);
      if (index === undefined) return;
      const list = upgrade ? this.genUpgradeMult : this.modGen;
      list[index] = (list[index] as BigNum).mul(value);
    } else {
      const index = this.resourceIndex.get(target.resource);
      if (index === undefined) return;
      const list = upgrade ? this.resUpgradeMult : this.modRes;
      list[index] = (list[index] as BigNum).mul(value);
    }
  }

  private refreshModifiers(): void {
    if (this.modifiers.size === 0) return;
    this.modGen.fill(BigNum.ONE);
    this.modRes.fill(BigNum.ONE);
    this.modAll = BigNum.ONE;
    for (const modifier of this.modifiers.values()) {
      const value =
        typeof modifier.value === 'function'
          ? BigNum.from(modifier.value({ offline: this.inOffline }))
          : modifier.value;
      this.applyMultiplier(modifier.target, value, 'modifier');
    }
  }

  private effOf(i: number): BigNum {
    const base = this.baseEff[i] as BigNum;
    if (this.modifiers.size === 0) return base;
    return base.mul(this.modGen[i] as BigNum).mul(this.modAll);
  }

  private resMultOf(r: number): BigNum {
    const upgrades = this.resUpgradeMult[r] as BigNum;
    return this.modifiers.size === 0 ? upgrades : upgrades.mul(this.modRes[r] as BigNum);
  }

  private produce(dt: BigNum, cacheKey?: number): void {
    this.pendingRes.fill(BigNum.ZERO);
    if (this.hasChains) this.pendingGen.fill(BigNum.ZERO);
    const cached = cacheKey !== undefined && this.modifiers.size === 0;
    if (cached && this.effDtFor !== cacheKey) {
      this.effDt = [];
      for (let i = 0; i < this.generators.length; i++) this.effDt.push(this.effOf(i).mul(dt));
      this.effDtFor = cacheKey;
    }
    for (let i = 0; i < this.generators.length; i++) {
      const generator = this.generators[i] as Generator;
      const free = generator.free;
      const hasFree = !free.isZero();
      if (generator.bought.isZero() && !hasFree) continue;
      if (!generator.isActive) continue;
      const held = hasFree ? generator.bought.add(free) : generator.bought;
      const out = held.mul(cached ? (this.effDt[i] as BigNum) : this.effOf(i).mul(dt));
      const target = this.targetIndex[i] as number;
      if (this.targetsResource[i] === true) {
        this.pendingRes[target] = (this.pendingRes[target] as BigNum).add(out);
      } else {
        this.pendingGen[target] = (this.pendingGen[target] as BigNum).add(out);
      }
    }
  }

  private step(dtSeconds: number): void {
    this.ensureCaches();
    this.refreshModifiers();
    if (this.dtCache?.seconds !== dtSeconds) {
      this.dtCache = { seconds: dtSeconds, value: BigNum.from(dtSeconds) };
    }
    this.produce(this.dtCache.value, dtSeconds);
    for (let r = 0; r < this.resourceList.length; r++) {
      const pending = this.pendingRes[r] as BigNum;
      if (!pending.isZero())
        (this.resourceList[r] as Resource).credit(pending.mul(this.resMultOf(r)));
    }
    if (!this.hasChains) return;
    for (let i = 0; i < this.generators.length; i++) {
      const pending = this.pendingGen[i] as BigNum;
      if (pending.isZero()) continue;
      const generator = this.generators[i] as Generator;
      generator.setHeld(generator.bought, generator.free.add(pending));
    }
  }

  private creditAway(ms: number): void {
    this.ensureCaches();
    const before = this.resourceList.map(amountOf);
    this.refreshModifiers();
    const sources: FlowSource[] = [];
    for (let i = 0; i < this.generators.length; i++) {
      const generator = this.generators[i] as Generator;
      const isResource = this.targetsResource[i] === true;
      const target = this.targetIndex[i] as number;
      const coefficient = isResource ? this.effOf(i).mul(this.resMultOf(target)) : this.effOf(i);
      sources.push({
        initial: generator.count,
        coefficient: generator.isActive ? coefficient : BigNum.ZERO,
        target: { kind: isResource ? 'resource' : 'generator', index: target },
      });
    }
    const solved = solveFlows(sources, this.resourceList.length, ms / 1000, this.maxChain);
    if (solved) {
      for (let i = 0; i < solved.counts.length; i++) {
        const generator = this.generators[i] as Generator;
        const free = (solved.counts[i] as BigNum).sub(generator.bought);
        generator.setHeld(generator.bought, free.isNegative() ? BigNum.ZERO : free);
      }
      for (let r = 0; r < solved.gains.length; r++) {
        const gain = solved.gains[r] as BigNum;
        if (!gain.isZero()) (this.resourceList[r] as Resource).credit(gain);
      }
    } else {
      forEachOfflineStep(ms, this.stepSeconds, {
        ...(this.maxSteps === undefined ? {} : { maxSteps: this.maxSteps }),
      });
    }
    const gains = new Map<Resource, BigNum>();
    for (let r = 0; r < this.resourceList.length; r++) {
      const resource = this.resourceList[r] as Resource;
      gains.set(resource, resource.amount.sub(before[r] as BigNum));
    }
    this.offlineGains.invoke({ elapsedMs: ms, gains });
  }
}

function amountOf(resource: Resource): BigNum {
  return resource.amount;
}
