import { BigNum } from '../core/bignum/index.js';
import type { BigNumLike } from '../core/bignum/index.js';
import { SaveCorruptedError, isJsonObject } from '../core/save/index.js';
import type { JsonValue } from '../core/save/index.js';
import { Component } from '../runtime/index.js';
import type { GameObject } from '../runtime/index.js';
import { Economy } from './economy.js';
import { affordable, readBig } from './shared.js';

/**
 * Options for {@link Resource}.
 */
export interface ResourceOptions {
  /**
   * Amount at the start of a new game. Default `0`.
   */
  readonly initial?: BigNumLike;
}

/**
 * A currency-like quantity such as gold. Add it to an object, then point generators and
 * upgrades at it.
 *
 * @example
 * const gold = game.createObject('Gold').addComponent(Resource, { initial: 10 });
 * gold.add(5);
 * gold.amount.toString();
 */
export class Resource extends Component {
  static override typeId = 'Resource';

  /**
   * Amount at the start of a new game or after a reset.
   */
  readonly initial: BigNum;

  private current: BigNum;
  private total: BigNum = BigNum.ZERO;

  constructor(gameObject: GameObject, options: ResourceOptions = {}) {
    super(gameObject);
    this.initial = BigNum.from(options.initial ?? 0);
    this.current = this.initial;
  }

  /**
   * Amount currently held.
   */
  get amount(): BigNum {
    return this.current;
  }

  /**
   * Total gained since the run started (production and {@link Resource.add}; not refunds).
   */
  get earned(): BigNum {
    return this.total;
  }

  /**
   * Production per second, multipliers included. `0` until a generator exists.
   */
  get rate(): BigNum {
    return Economy.existing(this.game)?.rateOf(this) ?? BigNum.ZERO;
  }

  /**
   * Adds `amount` (>= 0), for example for a click. Counts as earned.
   *
   * @throws {RangeError} if `amount` is negative.
   */
  add(amount: BigNumLike): void {
    const value = BigNum.from(amount);
    if (value.isNegative()) throw new RangeError('Resource.add needs an amount >= 0');
    this.credit(value);
  }

  /**
   * Removes `amount` if available. Returns `false` and changes nothing otherwise.
   *
   * @throws {RangeError} if `amount` is negative.
   */
  spend(amount: BigNumLike): boolean {
    const value = BigNum.from(amount);
    if (value.isNegative()) throw new RangeError('Resource.spend needs an amount >= 0');
    if (!affordable(value, this.current)) return false;
    this.pay(value);
    return true;
  }

  /**
   * Whether at least `amount` is held.
   */
  canAfford(amount: BigNumLike): boolean {
    return affordable(BigNum.from(amount), this.current);
  }

  /**
   * Adds to the balance and the run total. Used by production.
   *
   * @internal
   */
  credit(amount: BigNum): void {
    this.current = this.current.add(amount);
    this.total = this.total.add(amount);
  }

  /**
   * Removes a price from the balance without going below zero.
   *
   * @internal
   */
  pay(price: BigNum): void {
    this.current = price.gte(this.current) ? BigNum.ZERO : this.current.sub(price);
  }

  /**
   * Returns to the starting balance and clears the run total, optionally keeping the balance.
   *
   * @internal
   */
  resetRun(keepBalance: boolean): void {
    const balance = this.current;
    this.current = keepBalance ? balance : this.initial;
    this.total = BigNum.ZERO;
  }

  override onSave(): JsonValue {
    return { amount: this.current.toJSON(), earned: this.total.toJSON() };
  }

  override onLoad(data: JsonValue | undefined): void {
    this.current = this.initial;
    this.total = BigNum.ZERO;
    if (data === undefined) return;
    if (!isJsonObject(data)) throw new SaveCorruptedError('Resource: save entry must be an object');
    this.current = readBig(data['amount'], 'Resource.amount');
    this.total = readBig(data['earned'], 'Resource.earned');
  }
}
