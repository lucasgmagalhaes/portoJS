import type { BigNum, BigNumLike } from '../../core/bignum/index.js';
import type { CostCurve } from './cost.js';

/**
 * A price: a {@link CostCurve} paid in one resource.
 */
export type CostDef<R extends string> = CostCurve & {
  /**
   * Resource that pays for it.
   */
  readonly resource: R;
};

/**
 * Declares a currency-like quantity.
 */
export interface ResourceDef {
  /**
   * Amount at the start of a new game. Default `0`.
   */
  readonly initial?: BigNumLike;
}

/**
 * Declares something that produces over time and can be bought in bulk.
 */
export interface GeneratorDef<R extends string, G extends string> {
  /**
   * How the price scales with the number bought.
   */
  readonly cost: CostDef<R>;
  /**
   * What it produces. A resource id yields that resource; `{ generator: id }` makes it feed
   * another generator's count instead (tiered "dimension" style chains).
   */
  readonly produces: R | { readonly generator: G };
  /**
   * Output per second per unit held, before multipliers.
   */
  readonly rate: BigNumLike;
  /**
   * Units owned at the start of a new game. Default `0`.
   */
  readonly initial?: BigNumLike;
}

/**
 * What a multiplier applies to.
 */
export type EffectTarget<R extends string, G extends string> =
  { readonly generator: G } | { readonly resource: R } | { readonly all: true };

/**
 * A multiplier granted by an upgrade; applied as `multiplier ^ level`.
 */
export type UpgradeEffect<R extends string, G extends string> = EffectTarget<R, G> & {
  readonly multiplier: BigNumLike;
};

/**
 * Declares a purchasable boost.
 */
export interface UpgradeDef<R extends string, G extends string> {
  /**
   * Price of the next level, based on the current level.
   */
  readonly cost: CostDef<R>;
  /**
   * Highest level. Default `1` (one-time upgrade). Use `Infinity` for no limit.
   */
  readonly maxLevel?: number;
  /**
   * Multipliers granted, each raised to the current level.
   */
  readonly effects: readonly UpgradeEffect<R, G>[];
}

/**
 * Settings for how offline production is computed when no closed form applies.
 */
export interface ResourcesOfflineOptions {
  /**
   * Longest generator chain solved in closed form. Default `64`.
   */
  readonly maxChain?: number;
  /**
   * Step budget for the simulation fallback. Default `1000`.
   */
  readonly maxSteps?: number;
}

/**
 * Configuration of the {@link resources} plugin.
 */
export interface ResourcesConfig<R extends string, G extends string, U extends string> {
  /**
   * Resources by id.
   */
  readonly resources: { readonly [K in R]: ResourceDef };
  /**
   * Generators by id.
   */
  readonly generators?: { readonly [K in G]: GeneratorDef<NoInfer<R>, NoInfer<G>> };
  /**
   * Upgrades by id.
   */
  readonly upgrades?: { readonly [K in U]: UpgradeDef<NoInfer<R>, NoInfer<G>> };
  /**
   * Offline computation tuning.
   */
  readonly offline?: ResourcesOfflineOptions;
}

/**
 * How many units to buy: an exact count or as many as affordable.
 */
export type BulkAmount = number | 'max';

/**
 * What {@link ResourcesApi.resetRun} keeps. Everything else returns to its initial state.
 */
export interface ResetKeep<R extends string, G extends string, U extends string> {
  readonly resources?: readonly R[];
  readonly generators?: readonly G[];
  readonly upgrades?: readonly U[];
}

/**
 * Payload of the `purchase` event for generators.
 */
export interface GeneratorPurchase<R extends string, G extends string> {
  readonly kind: 'generator';
  readonly id: G;
  /**
   * Units bought.
   */
  readonly amount: BigNum;
  /**
   * Total price paid.
   */
  readonly cost: BigNum;
  /**
   * Resource spent.
   */
  readonly resource: R;
}

/**
 * Payload of the `purchase` event for upgrades.
 */
export interface UpgradePurchase<R extends string, U extends string> {
  readonly kind: 'upgrade';
  readonly id: U;
  /**
   * Level reached.
   */
  readonly level: number;
  /**
   * Price paid.
   */
  readonly cost: BigNum;
  /**
   * Resource spent.
   */
  readonly resource: R;
}

/**
 * Events emitted by the {@link resources} plugin.
 */
export interface ResourcesEvents<R extends string, G extends string, U extends string> {
  /**
   * A generator or upgrade was bought.
   */
  purchase: GeneratorPurchase<R, G> | UpgradePurchase<R, U>;
  /**
   * Away-time production was credited. `elapsedMs` is the credited span.
   */
  offlineGains: { readonly elapsedMs: number; readonly gains: Readonly<Record<R, BigNum>> };
}

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
 * What a purchase guard is asked about.
 */
export type PurchaseTarget<G extends string, U extends string> =
  { readonly kind: 'generator'; readonly id: G } | { readonly kind: 'upgrade'; readonly id: U };

/**
 * Return `false` to forbid buying the target right now.
 */
export type PurchaseGuard<G extends string, U extends string> = (
  target: PurchaseTarget<G, U>,
) => boolean;

/**
 * Methods the {@link resources} plugin adds to the game.
 */
export interface ResourcesApi<R extends string, G extends string, U extends string> {
  /**
   * Ids of all resources.
   */
  readonly resourceIds: readonly R[];
  /**
   * Ids of all generators.
   */
  readonly generatorIds: readonly G[];
  /**
   * Ids of all upgrades.
   */
  readonly upgradeIds: readonly U[];

  /**
   * Current amount held.
   */
  amount(resource: R): BigNum;
  /**
   * Total gained since the run started (production and {@link ResourcesApi.add}; not refunds).
   */
  earned(resource: R): BigNum;
  /**
   * Current production per second, multipliers included.
   */
  rate(resource: R): BigNum;
  /**
   * Adds `amount` (>= 0), e.g. for a click. Counts as earned.
   */
  add(resource: R, amount: BigNumLike): void;
  /**
   * Removes `amount` if available. Returns `false` and changes nothing otherwise.
   */
  spend(resource: R, amount: BigNumLike): boolean;

  /**
   * Units held, including those produced by other generators.
   */
  count(generator: G): BigNum;
  /**
   * Units bought (what prices scale with).
   */
  bought(generator: G): BigNum;
  /**
   * Price of buying `amount` now. For `'max'`, the price of the affordable batch (or of one unit if none).
   */
  cost(generator: G, amount?: BulkAmount): BigNum;
  /**
   * Whether `amount` can be bought now. For `'max'`, whether at least one can.
   */
  canBuy(generator: G, amount?: BulkAmount): boolean;
  /**
   * Most units that can be bought now.
   */
  maxAffordable(generator: G): BigNum;
  /**
   * Buys `amount` (default `1`). A number is all-or-nothing: if it is unaffordable nothing
   * is bought. `'max'` buys as many as affordable.
   *
   * @returns the number of units actually bought (`0` if none).
   * @throws {RangeError} if `amount` is not a positive integer or `'max'`.
   */
  buy(generator: G, amount?: BulkAmount): BigNum;

  /**
   * Current level of an upgrade.
   */
  upgradeLevel(upgrade: U): number;
  /**
   * Price of the next level, or `undefined` when maxed.
   */
  upgradeCost(upgrade: U): BigNum | undefined;
  /**
   * Whether the next level can be bought now.
   */
  canBuyUpgrade(upgrade: U): boolean;
  /**
   * Buys the next level. Returns `false` if maxed or unaffordable.
   */
  buyUpgrade(upgrade: U): boolean;

  /**
   * Total multiplier currently applied to a target (upgrades and modifiers).
   */
  multiplier(target: EffectTarget<R, G>): BigNum;
  /**
   * Registers (or replaces) a named multiplier from outside, e.g. a prestige bonus. Pass a
   * function to have it re-read every tick; it also receives whether away-time is being
   * credited, so time-limited modifiers can step aside offline.
   */
  setModifier(
    id: string,
    target: EffectTarget<R, G>,
    multiplier: BigNumLike | ((context: ModifierContext) => BigNumLike),
  ): void;
  /**
   * Removes a modifier. Returns whether it existed.
   */
  removeModifier(id: string): boolean;

  /**
   * Registers (or replaces) a named guard that can forbid purchases, e.g. until something is
   * unlocked. A purchase happens only if every guard allows it; guarded targets report
   * `canBuy` false and `maxAffordable` zero.
   */
  setPurchaseGuard(name: string, guard: PurchaseGuard<G, U>): void;
  /**
   * Removes a guard. Returns whether it existed.
   */
  removePurchaseGuard(name: string): boolean;

  /**
   * Returns the run to its starting state, keeping what `keep` lists. Run totals
   * ({@link ResourcesApi.earned}) restart from zero. This is the hook prestige uses.
   */
  resetRun(keep?: ResetKeep<R, G, U>): void;
}
