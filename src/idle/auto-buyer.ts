import type { BigNum } from '../core/bignum/index.js';
import { SaveCorruptedError, isJsonObject } from '../core/save/index.js';
import type { JsonValue } from '../core/save/index.js';
import { Component, GameEvent } from '../runtime/index.js';
import type { GameObject } from '../runtime/index.js';
import type { Generator } from './generator.js';
import type { BulkAmount } from './shared.js';

/**
 * Options for {@link AutoBuyer}.
 */
export interface AutoBuyerOptions {
  /**
   * The generator it buys.
   */
  readonly target: Generator;
  /**
   * How much to buy each time: a count or `'max'`. Default `'max'`.
   */
  readonly amount?: BulkAmount;
  /**
   * Time between purchases, in ms of game time. Default `1000`.
   */
  readonly everyMs?: number;
  /**
   * Whether it starts switched on in a new game. Default `false`.
   */
  readonly enabled?: boolean;
}

/**
 * Payload of {@link AutoBuyer.bought}.
 */
export interface AutoBuy {
  readonly autoBuyer: AutoBuyer;
  readonly amount: BigNum;
}

/**
 * Buys a generator for the player on a timer. Switch it on and off with the standard
 * `enabled` property of a component.
 *
 * Auto-buyers act on game steps only. They do **not** act while the player is away, because
 * offline progress is computed as a closed form with no purchases in it, which keeps it
 * predictable and cheap. Purchases respect any purchase guard, such as an unlock.
 *
 * @example
 * const bot = game.createObject('MinerBot').addComponent(AutoBuyer, {
 *   target: miner,
 *   everyMs: 2000,
 * });
 * bot.enabled = true;
 */
export class AutoBuyer extends Component {
  static override typeId = 'AutoBuyer';

  /**
   * Fired after a purchase.
   */
  readonly bought = new GameEvent<AutoBuy>();

  private readonly options: AutoBuyerOptions;
  private readonly everyMs: number;
  private readonly initiallyEnabled: boolean;
  private elapsedMs = 0;

  constructor(gameObject: GameObject, options: AutoBuyerOptions) {
    super(gameObject);
    this.options = options;
    this.everyMs = options.everyMs ?? 1000;
    if (!Number.isFinite(this.everyMs) || this.everyMs <= 0) {
      throw new RangeError('AutoBuyer: everyMs must be a positive number');
    }
    this.initiallyEnabled = options.enabled ?? false;
    this.enabled = this.initiallyEnabled;
  }

  override onEnable(): void {
    this.elapsedMs = 0;
  }

  override fixedUpdate(deltaTime: number): void {
    this.elapsedMs += deltaTime * 1000;
    if (this.elapsedMs < this.everyMs) return;
    this.elapsedMs %= this.everyMs;
    const amount = this.options.target.buy(this.options.amount ?? 'max');
    if (!amount.isZero()) this.bought.invoke({ autoBuyer: this, amount });
  }

  override onSave(): JsonValue {
    return { enabled: this.enabled, elapsed: this.elapsedMs };
  }

  override onLoad(data: JsonValue | undefined): void {
    this.enabled = this.initiallyEnabled;
    this.elapsedMs = 0;
    if (data === undefined) return;
    const valid =
      isJsonObject(data) &&
      typeof data['enabled'] === 'boolean' &&
      typeof data['elapsed'] === 'number' &&
      Number.isFinite(data['elapsed']) &&
      data['elapsed'] >= 0;
    if (!valid) throw new SaveCorruptedError('AutoBuyer: invalid state');
    this.enabled = data['enabled'] as boolean;
    this.elapsedMs = data['elapsed'] as number;
  }
}
