import { SaveCorruptedError } from '../core/save/index.js';
import type { JsonValue } from '../core/save/index.js';
import { Component, GameEvent } from '../runtime/index.js';
import type { Game, GameObject } from '../runtime/index.js';

/**
 * Options for {@link Achievement}.
 */
export interface AchievementOptions {
  /**
   * Returns `true` once the achievement is earned. Checked while it is still locked.
   */
  readonly condition: (game: Game) => boolean;
  /**
   * Runs when the achievement unlocks, and again after a save is loaded so permanent effects (a
   * production modifier, for example) are restored. Make it idempotent.
   */
  readonly effect?: (game: Game) => void;
  /**
   * How often the condition is evaluated, in ms of game time. Default `1000`.
   */
  readonly checkIntervalMs?: number;
}

/**
 * An achievement defined by a condition over the game state.
 *
 * @example
 * const rich = game.createObject('Rich').addComponent(Achievement, {
 *   condition: () => gold.amount.gte(1e6),
 * });
 * rich.unlocked.addListener(() => console.log('Rich!'));
 */
export class Achievement extends Component {
  static override typeId = 'Achievement';

  /**
   * Fired when the achievement unlocks.
   */
  readonly unlocked = new GameEvent<Achievement>();

  private readonly options: AchievementOptions;
  private readonly interval: number;
  private time: number | undefined;
  private sinceCheck = 0;

  constructor(gameObject: GameObject, options: AchievementOptions) {
    super(gameObject);
    this.options = options;
    this.interval = options.checkIntervalMs ?? 1000;
    if (!Number.isFinite(this.interval) || this.interval <= 0) {
      throw new RangeError('Achievement: checkIntervalMs must be a positive number');
    }
  }

  /**
   * Whether it has been unlocked.
   */
  get isUnlocked(): boolean {
    return this.time !== undefined;
  }

  /**
   * Clock time (ms) when it unlocked, or `undefined` while locked.
   */
  get unlockedAt(): number | undefined {
    return this.time;
  }

  /**
   * Evaluates the condition now. Returns `true` if this call unlocked it.
   */
  check(): boolean {
    if (this.time !== undefined || !this.options.condition(this.game)) return false;
    this.time = this.game.now();
    this.options.effect?.(this.game);
    this.unlocked.invoke(this);
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
      throw new SaveCorruptedError('Achievement: invalid timestamp');
    }
    this.time = data;
    this.options.effect?.(this.game);
  }
}
