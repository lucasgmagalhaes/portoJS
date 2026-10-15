import type { BigNumLike } from '../core/bignum/index.js';
import { SaveCorruptedError } from '../core/save/index.js';
import type { JsonValue } from '../core/save/index.js';
import { Component, GameEvent } from '../runtime/index.js';
import type { GameObject } from '../runtime/index.js';
import { Economy } from './economy.js';
import type { ModifierContext } from './economy.js';
import type { TargetedMultiplier } from './shared.js';

/**
 * Options for {@link Boost}.
 */
export interface BoostOptions {
  /**
   * Multipliers applied while the boost is running.
   */
  readonly effects: readonly TargetedMultiplier[];
  /**
   * How long it lasts, in ms of game time.
   */
  readonly durationMs: number;
  /**
   * What activating an already running boost does: `'refresh'` restarts the full duration
   * (default), `'extend'` adds the duration to what is left, `'ignore'` does nothing.
   */
  readonly onReactivate?: 'refresh' | 'extend' | 'ignore';
}

/**
 * A time-limited multiplier: "2x production for 30 seconds".
 *
 * Timers advance with game steps. They **pause while the player is away**, and a boost does not
 * apply to offline gains; this keeps offline progress a closed form and means a player cannot
 * lose a boost's duration by closing the game.
 *
 * @example
 * const frenzy = game.createObject('Frenzy').addComponent(Boost, {
 *   durationMs: 30_000,
 *   effects: [{ resource: gold, multiplier: 2 }],
 * });
 * frenzy.activate();
 */
export class Boost extends Component {
  static override typeId = 'Boost';

  /**
   * Fired when the boost is activated (or refreshed or extended).
   */
  readonly started = new GameEvent<Boost>();

  /**
   * Fired when the boost runs out or is cancelled.
   */
  readonly ended = new GameEvent<Boost>();

  private readonly options: BoostOptions;
  private left = 0;

  constructor(gameObject: GameObject, options: BoostOptions) {
    super(gameObject);
    this.options = options;
    if (!Number.isFinite(options.durationMs) || options.durationMs <= 0) {
      throw new RangeError('Boost: durationMs must be a positive number');
    }
  }

  override awake(): void {
    const economy = Economy.of(this.game);
    const effects = this.options.effects;
    for (let i = 0; i < effects.length; i++) {
      const effect = effects[i] as TargetedMultiplier;
      economy.setModifier(this.modifierId(i), effect, this.whileRunning(effect));
    }
  }

  override onDestroy(): void {
    const economy = Economy.existing(this.game);
    for (let i = 0; i < this.options.effects.length; i++)
      economy?.removeModifier(this.modifierId(i));
  }

  /**
   * Whether the boost is running.
   */
  get running(): boolean {
    return this.left > 0;
  }

  /**
   * Time left in ms (`0` when not running).
   */
  get remainingMs(): number {
    return this.left;
  }

  /**
   * Activates the boost. Returns `false` if it was already running and is set to `'ignore'`.
   */
  activate(): boolean {
    const mode = this.options.onReactivate ?? 'refresh';
    if (this.running && mode === 'ignore') return false;
    const duration = this.options.durationMs;
    this.left = this.running && mode === 'extend' ? this.left + duration : duration;
    this.started.invoke(this);
    return true;
  }

  /**
   * Ends the boost early. Returns whether it was running.
   */
  cancel(): boolean {
    if (!this.running) return false;
    this.left = 0;
    this.ended.invoke(this);
    return true;
  }

  override fixedUpdate(deltaTime: number): void {
    if (!this.running) return;
    this.left -= deltaTime * 1000;
    if (this.left > 0) return;
    this.left = 0;
    this.ended.invoke(this);
  }

  override onSave(): JsonValue | undefined {
    return this.running ? this.left : undefined;
  }

  override onLoad(data: JsonValue | undefined): void {
    this.left = 0;
    if (data === undefined) return;
    if (typeof data !== 'number' || !Number.isFinite(data) || data < 0) {
      throw new SaveCorruptedError('Boost: invalid remaining time');
    }
    this.left = data;
  }

  private modifierId(index: number): string {
    return `boost:${this.gameObject.name}:${index}`;
  }

  private readonly whileRunning =
    (effect: TargetedMultiplier) =>
    ({ offline }: ModifierContext): BigNumLike =>
      !offline && this.running ? effect.multiplier : 1;
}
