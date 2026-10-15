import { BigNum } from '../core/bignum/index.js';
import { SaveCorruptedError } from '../core/save/index.js';
import type { JsonValue } from '../core/save/index.js';
import { Component, GameEvent } from '../runtime/index.js';
import type { GameObject } from '../runtime/index.js';
import { compileCost } from './cost.js';
import type { CostFunctions } from './cost.js';
import { Economy } from './economy.js';
import type { ResourceCost } from './generator.js';
import { affordable } from './shared.js';
import type { TargetedMultiplier } from './shared.js';

/**
 * Options for {@link Upgrade}.
 */
export interface UpgradeOptions {
  /**
   * Price of the next level, based on the current level.
   */
  readonly cost: ResourceCost;
  /**
   * Highest level. Default `1` (one-time upgrade). Use `Infinity` for no limit.
   */
  readonly maxLevel?: number;
  /**
   * Multipliers granted, each raised to the current level.
   */
  readonly effects: readonly TargetedMultiplier[];
}

/**
 * Payload of {@link Upgrade.purchased}.
 */
export interface UpgradePurchase {
  readonly upgrade: Upgrade;
  /**
   * Level reached.
   */
  readonly level: number;
  /**
   * Price paid.
   */
  readonly cost: BigNum;
}

/**
 * A purchasable boost with levels, such as "miners produce twice as much".
 *
 * @example
 * game.createObject('Pickaxe').addComponent(Upgrade, {
 *   cost: { resource: gold, base: 50, growth: 1 },
 *   effects: [{ generator: miner, multiplier: 2 }],
 * });
 */
export class Upgrade extends Component {
  static override typeId = 'Upgrade';

  /**
   * Fired after a successful purchase.
   */
  readonly purchased = new GameEvent<UpgradePurchase>();

  /**
   * Highest level.
   */
  readonly maxLevel: number;

  /**
   * Multipliers granted, each raised to the current level.
   */
  readonly effects: readonly TargetedMultiplier[];

  private readonly options: UpgradeOptions;
  private readonly costFns: CostFunctions;
  private currentLevel = 0;

  constructor(gameObject: GameObject, options: UpgradeOptions) {
    super(gameObject);
    this.options = options;
    this.maxLevel = options.maxLevel ?? 1;
    this.effects = options.effects;
    this.costFns = compileCost(options.cost);
  }

  override awake(): void {
    Economy.of(this.game);
  }

  /**
   * Current level.
   */
  get level(): number {
    return this.currentLevel;
  }

  /**
   * Price of the next level, or `undefined` when maxed.
   */
  get cost(): BigNum | undefined {
    return this.isMaxed ? undefined : this.costFns.unit(BigNum.from(this.currentLevel));
  }

  /**
   * Whether the highest level has been reached.
   */
  get isMaxed(): boolean {
    return this.currentLevel >= this.maxLevel;
  }

  /**
   * Whether the next level can be bought now.
   */
  canBuy(): boolean {
    const price = this.cost;
    if (price === undefined || !Economy.of(this.game).allows(this)) return false;
    return affordable(price, this.options.cost.resource.amount);
  }

  /**
   * Buys the next level. Returns `false` if maxed, forbidden by a guard, or unaffordable.
   */
  buy(): boolean {
    const price = this.cost;
    const economy = Economy.of(this.game);
    if (price === undefined || !economy.allows(this)) return false;
    const wallet = this.options.cost.resource;
    if (!affordable(price, wallet.amount)) return false;
    wallet.pay(price);
    this.currentLevel += 1;
    economy.invalidate();
    const purchase: UpgradePurchase = { upgrade: this, level: this.currentLevel, cost: price };
    this.purchased.invoke(purchase);
    economy.purchased.invoke({ kind: 'upgrade', ...purchase });
    return true;
  }

  /**
   * Sets the level without paying. Used by resets.
   *
   * @internal
   */
  setLevel(level: number): void {
    this.currentLevel = level;
    Economy.of(this.game).invalidate();
  }

  override onSave(): JsonValue {
    return this.currentLevel;
  }

  override onLoad(data: JsonValue | undefined): void {
    this.setLevel(0);
    if (data === undefined) return;
    const valid =
      typeof data === 'number' && Number.isInteger(data) && data >= 0 && data <= this.maxLevel;
    if (!valid) throw new SaveCorruptedError('Upgrade: invalid level');
    this.setLevel(data);
  }
}
