import { BigNum } from '../core/bignum/index.js';
import type { BigNumLike } from '../core/bignum/index.js';
import { SaveCorruptedError, isJsonObject } from '../core/save/index.js';
import type { JsonObject, JsonValue } from '../core/save/index.js';
import { Component, GameEvent } from '../runtime/index.js';
import type { GameObject } from '../runtime/index.js';
import { compileCost } from './cost.js';
import type { CostCurve, CostFunctions } from './cost.js';
import { Economy } from './economy.js';
import type { Resource } from './resource.js';
import { affordable, readBig, wholeCount } from './shared.js';
import type { BulkAmount } from './shared.js';

/**
 * A price: a {@link CostCurve} paid in one resource.
 */
export type ResourceCost = CostCurve & {
  /**
   * The resource that pays for it.
   */
  readonly resource: Resource;
};

/**
 * Options for {@link Generator}.
 */
export interface GeneratorOptions {
  /**
   * How the price scales with the number bought.
   */
  readonly cost: ResourceCost;
  /**
   * What it produces: a resource, or another generator whose count it increases (tiered chains).
   */
  readonly produces: Resource | Generator;
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
 * Payload of {@link Generator.purchased}.
 */
export interface GeneratorPurchase {
  readonly generator: Generator;
  /**
   * Units bought.
   */
  readonly amount: BigNum;
  /**
   * Total price paid.
   */
  readonly cost: BigNum;
}

interface Snapshot {
  readonly bought: BigNum;
  readonly free: BigNum;
  readonly json: JsonObject;
}

/**
 * Something that produces over time and can be bought in bulk, like a miner producing gold.
 * Production itself is computed by the {@link Economy}, which a generator creates on demand.
 *
 * @example
 * const miner = game.createObject('Miner').addComponent(Generator, {
 *   cost: { resource: gold, base: 10, growth: 1.15 },
 *   produces: gold,
 *   rate: 1,
 * });
 * miner.buy('max');
 */
export class Generator extends Component {
  static override typeId = 'Generator';

  /**
   * Fired after a successful purchase.
   */
  readonly purchased = new GameEvent<GeneratorPurchase>();

  /**
   * What this generator produces.
   */
  readonly produces: Resource | Generator;

  /**
   * Output per second per unit held, before multipliers.
   */
  readonly rate: BigNum;

  /**
   * The resource that pays for purchases.
   */
  readonly costResource: Resource;

  private readonly costFns: CostFunctions;
  private readonly initialBought: BigNum;
  private boughtUnits: BigNum;
  private freeUnits: BigNum = BigNum.ZERO;
  private snapshot: Snapshot | undefined;

  constructor(gameObject: GameObject, options: GeneratorOptions) {
    super(gameObject);
    this.produces = options.produces;
    this.rate = BigNum.from(options.rate);
    this.costResource = options.cost.resource;
    this.costFns = compileCost(options.cost);
    this.initialBought = BigNum.from(options.initial ?? 0).floor();
    this.boughtUnits = this.initialBought;
  }

  override awake(): void {
    Economy.of(this.game);
  }

  /**
   * Units held, including those produced by other generators.
   */
  get count(): BigNum {
    return this.freeUnits.isZero() ? this.boughtUnits : this.boughtUnits.add(this.freeUnits);
  }

  /**
   * Units bought (what prices scale with).
   */
  get bought(): BigNum {
    return this.boughtUnits;
  }

  /**
   * Units produced by other generators.
   */
  get free(): BigNum {
    return this.freeUnits;
  }

  /**
   * Price of the next single unit.
   */
  get nextCost(): BigNum {
    return this.costFns.unit(this.boughtUnits);
  }

  /**
   * Most units that can be bought right now (`0` while a purchase guard forbids it).
   */
  get maxAffordable(): BigNum {
    if (!Economy.of(this.game).allows(this)) return BigNum.ZERO;
    return this.costFns.max(this.boughtUnits, this.costResource.amount);
  }

  /**
   * Price of buying `amount` now. For `'max'`, the price of the affordable batch (or of one unit
   * when none is affordable).
   */
  costOf(amount: BulkAmount = 1): BigNum {
    if (amount === 'max') {
      const batch = this.costFns.max(this.boughtUnits, this.costResource.amount);
      return this.costFns.total(this.boughtUnits, batch.isZero() ? BigNum.ONE : batch);
    }
    return this.costFns.total(this.boughtUnits, wholeCount(amount));
  }

  /**
   * Whether `amount` can be bought now. For `'max'`, whether at least one can.
   */
  canBuy(amount: BulkAmount = 1): boolean {
    if (!Economy.of(this.game).allows(this)) return false;
    if (amount === 'max') return this.costFns.max(this.boughtUnits, this.costResource.amount).gt(0);
    return affordable(this.costOf(amount), this.costResource.amount);
  }

  /**
   * Buys `amount` (default `1`). A number is all-or-nothing: if it is unaffordable nothing is
   * bought. `'max'` buys as many as affordable.
   *
   * @returns the number of units actually bought (`0` if none).
   * @throws {RangeError} if `amount` is not a positive integer or `'max'`.
   */
  buy(amount: BulkAmount = 1): BigNum {
    const economy = Economy.of(this.game);
    const count =
      amount === 'max'
        ? this.costFns.max(this.boughtUnits, this.costResource.amount)
        : wholeCount(amount);
    if (!economy.allows(this) || count.isZero()) return BigNum.ZERO;
    const price = this.costFns.total(this.boughtUnits, count);
    if (!affordable(price, this.costResource.amount)) return BigNum.ZERO;
    this.costResource.pay(price);
    this.boughtUnits = this.boughtUnits.add(count);
    const purchase: GeneratorPurchase = { generator: this, amount: count, cost: price };
    this.purchased.invoke(purchase);
    economy.purchased.invoke({ kind: 'generator', ...purchase });
    return count;
  }

  /**
   * Sets the held units. Used by the economy for production and resets.
   *
   * @internal
   */
  setHeld(bought: BigNum, free: BigNum): void {
    this.boughtUnits = bought;
    this.freeUnits = free;
  }

  /**
   * Returns to the starting units, or keeps the current ones.
   *
   * @internal
   */
  resetRun(keep: boolean): void {
    if (keep) return;
    this.boughtUnits = this.initialBought;
    this.freeUnits = BigNum.ZERO;
  }

  override onSave(): JsonValue {
    const snap = this.snapshot;
    if (snap !== undefined && snap.bought === this.boughtUnits && snap.free === this.freeUnits) {
      return snap.json;
    }
    const json: JsonObject = {
      bought: this.boughtUnits.toJSON(),
      free: this.freeUnits.toJSON(),
    };
    this.snapshot = { bought: this.boughtUnits, free: this.freeUnits, json };
    return json;
  }

  override onLoad(data: JsonValue | undefined): void {
    this.boughtUnits = this.initialBought;
    this.freeUnits = BigNum.ZERO;
    if (data === undefined) return;
    if (!isJsonObject(data)) {
      throw new SaveCorruptedError('Generator: save entry must be an object');
    }
    this.boughtUnits = readBig(data['bought'], 'Generator.bought').floor();
    this.freeUnits = readBig(data['free'], 'Generator.free');
  }
}
