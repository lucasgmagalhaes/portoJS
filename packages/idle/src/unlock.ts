import { SaveCorruptedError } from '@portojs/core';
import type { JsonValue } from '@portojs/core';
import { Component, GameEvent } from '@portojs/runtime';
import type { Game, GameObject } from '@portojs/runtime';
import { Economy } from './economy.ts';
import type { Generator } from './generator.ts';
import type { Upgrade } from './upgrade.ts';

/**
 * Options for {@link Unlock}.
 */
export interface UnlockOptions {
  /**
   * Returns `true` once the player has earned the unlock. Checked while it is locked.
   */
  readonly condition: (game: Game) => boolean;
  /**
   * Generators and upgrades that cannot be bought until this unlock is earned.
   */
  readonly gates: readonly (Generator | Upgrade)[];
  /**
   * How often a locked condition is polled, in ms of game time. Default `500`.
   */
  readonly checkIntervalMs?: number;
}

/**
 * Hides generators and upgrades until a condition is met. Unlocks are permanent: they survive
 * prestige and run resets, and they are saved.
 *
 * It gates purchases through the economy's guard hook, so `canBuy`, `buy` and `maxAffordable`
 * all respect it.
 *
 * @example
 * game.createObject('DeepMining').addComponent(Unlock, {
 *   condition: () => miner.bought.gte(10),
 *   gates: [drill],
 * });
 */
export class Unlock extends Component {
  static override typeId = 'Unlock';

  /**
   * Fired when the unlock is earned.
   */
  readonly earned = new GameEvent<Unlock>();

  private readonly options: UnlockOptions;
  private readonly interval: number;
  private time: number | undefined;
  private sinceCheck = 0;

  constructor(gameObject: GameObject, options: UnlockOptions) {
    super(gameObject);
    this.options = options;
    this.interval = options.checkIntervalMs ?? 500;
    if (!Number.isFinite(this.interval) || this.interval <= 0) {
      throw new RangeError('Unlock: checkIntervalMs must be a positive number');
    }
  }

  override awake(): void {
    Economy.of(this.game).setPurchaseGuard(this.guardName(), this.allowsPurchase);
  }

  override onDestroy(): void {
    Economy.existing(this.game)?.removePurchaseGuard(this.guardName());
  }

  /**
   * Whether it has been earned. Evaluates the condition on demand while locked.
   */
  get isUnlocked(): boolean {
    return this.check();
  }

  /**
   * Clock time (ms) when it was earned, or `undefined` while locked.
   */
  get unlockedAt(): number | undefined {
    return this.time;
  }

  /**
   * Evaluates the condition now. Returns whether the unlock is earned (now or before).
   */
  check(): boolean {
    if (this.time !== undefined) return true;
    if (!this.options.condition(this.game)) return false;
    this.time = this.game.now();
    this.earned.invoke(this);
    return true;
  }

  override fixedUpdate(deltaTime: number): void {
    if (this.time !== undefined) return;
    this.sinceCheck += deltaTime * 1000;
    if (this.sinceCheck < this.interval) return;
    this.sinceCheck = 0;
    this.check();
  }

  override onSave(): JsonValue | undefined {
    return this.time;
  }

  override onLoad(data: JsonValue | undefined): void {
    this.time = undefined;
    this.sinceCheck = 0;
    if (data === undefined) return;
    if (typeof data !== 'number' || !Number.isFinite(data)) {
      throw new SaveCorruptedError('Unlock: invalid timestamp');
    }
    this.time = data;
  }

  private guardName(): string {
    return `unlock:${this.gameObject.name}`;
  }

  private readonly allowsPurchase = (target: Generator | Upgrade): boolean =>
    !this.options.gates.includes(target) || this.check();
}
