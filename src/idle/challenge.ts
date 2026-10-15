import type { BigNumLike } from '../core/bignum/index.js';
import { SaveCorruptedError, isJsonObject } from '../core/save/index.js';
import type { JsonValue } from '../core/save/index.js';
import { Component, GameEvent } from '../runtime/index.js';
import type { Game, GameObject } from '../runtime/index.js';
import { Economy } from './economy.js';
import type { ResetKeep, TargetedMultiplier } from './shared.js';

/**
 * Options for {@link Challenge}.
 */
export interface ChallengeOptions {
  /**
   * Returns `true` when the player has beaten the challenge. Checked while it is running.
   */
  readonly goal: (game: Game) => boolean;
  /**
   * Handicaps applied only while the challenge is running (for example `0.1` to cut output).
   */
  readonly handicaps?: readonly TargetedMultiplier[];
  /**
   * Bonuses applied permanently once the challenge has been completed.
   */
  readonly rewards?: readonly TargetedMultiplier[];
  /**
   * What survives the reset when the challenge starts or is abandoned. Default: nothing.
   */
  readonly keep?: ResetKeep;
  /**
   * How often the goal is polled, in ms of game time. Default `500`.
   */
  readonly checkIntervalMs?: number;
}

/**
 * A challenge run: restart with a handicap, and earn a permanent reward by reaching a goal
 * anyway. Only one challenge runs at a time in a game. Handicaps and rewards are applied as
 * economy modifiers, so they affect steps and offline progress alike, and they follow saves
 * automatically.
 *
 * @example
 * const slow = game.createObject('SlowGold').addComponent(Challenge, {
 *   goal: () => gold.earned.gte(1e6),
 *   handicaps: [{ resource: gold, multiplier: 0.1 }],
 *   rewards: [{ resource: gold, multiplier: 2 }],
 * });
 * slow.begin();
 */
export class Challenge extends Component {
  static override typeId = 'Challenge';

  /**
   * Fired when the challenge starts (the run was reset).
   */
  readonly started = new GameEvent<Challenge>();

  /**
   * Fired when the challenge is beaten. `firstTime` is `false` on repeat completions.
   */
  readonly completed = new GameEvent<{
    readonly challenge: Challenge;
    readonly firstTime: boolean;
  }>();

  /**
   * Fired when the running challenge is abandoned.
   */
  readonly exited = new GameEvent<Challenge>();

  private readonly options: ChallengeOptions;
  private readonly interval: number;
  private runningFlag = false;
  private completedFlag = false;
  private sinceCheck = 0;

  constructor(gameObject: GameObject, options: ChallengeOptions) {
    super(gameObject);
    this.options = options;
    this.interval = options.checkIntervalMs ?? 500;
    if (!Number.isFinite(this.interval) || this.interval <= 0) {
      throw new RangeError('Challenge: checkIntervalMs must be a positive number');
    }
  }

  /**
   * The challenge running in a game, if any.
   */
  static current(game: Game): Challenge | undefined {
    for (const challenge of game.findObjectsOfType(Challenge)) {
      if (challenge.runningFlag) return challenge;
    }
    return undefined;
  }

  override awake(): void {
    const economy = Economy.of(this.game);
    const handicaps = this.options.handicaps ?? [];
    for (let i = 0; i < handicaps.length; i++) {
      const handicap = handicaps[i] as TargetedMultiplier;
      economy.setModifier(this.modifierId('handicap', i), handicap, this.whenRunning(handicap));
    }
    const rewards = this.options.rewards ?? [];
    for (let i = 0; i < rewards.length; i++) {
      const reward = rewards[i] as TargetedMultiplier;
      economy.setModifier(this.modifierId('reward', i), reward, this.whenCompleted(reward));
    }
  }

  override onDestroy(): void {
    const economy = Economy.existing(this.game);
    const count = (this.options.handicaps ?? []).length;
    for (let i = 0; i < count; i++) economy?.removeModifier(this.modifierId('handicap', i));
    const rewardCount = (this.options.rewards ?? []).length;
    for (let i = 0; i < rewardCount; i++) economy?.removeModifier(this.modifierId('reward', i));
  }

  /**
   * Whether this challenge is the one running now.
   */
  get isRunning(): boolean {
    return this.runningFlag;
  }

  /**
   * Whether it has been beaten at least once.
   */
  get isCompleted(): boolean {
    return this.completedFlag;
  }

  /**
   * Starts the challenge: resets the run (keeping what `keep` lists) and applies the handicaps.
   * Returns `false` if a challenge is already running.
   */
  begin(): boolean {
    if (Challenge.current(this.game) !== undefined) return false;
    this.runningFlag = true;
    this.sinceCheck = 0;
    this.resetRun();
    this.started.invoke(this);
    return true;
  }

  /**
   * Abandons the challenge and resets the run. Returns `false` if it is not running.
   */
  abandon(): boolean {
    if (!this.runningFlag) return false;
    this.runningFlag = false;
    this.resetRun();
    this.exited.invoke(this);
    return true;
  }

  override fixedUpdate(deltaTime: number): void {
    if (!this.runningFlag) return;
    this.sinceCheck += deltaTime * 1000;
    if (this.sinceCheck < this.interval) return;
    this.sinceCheck = 0;
    if (!this.options.goal(this.game)) return;
    const firstTime = !this.completedFlag;
    this.completedFlag = true;
    this.runningFlag = false;
    this.completed.invoke({ challenge: this, firstTime });
  }

  override onSave(): JsonValue {
    return { running: this.runningFlag, completed: this.completedFlag };
  }

  override onLoad(data: JsonValue | undefined): void {
    this.runningFlag = false;
    this.completedFlag = false;
    this.sinceCheck = 0;
    if (data === undefined) return;
    const valid =
      isJsonObject(data) &&
      typeof data['running'] === 'boolean' &&
      typeof data['completed'] === 'boolean';
    if (!valid) throw new SaveCorruptedError('Challenge: invalid state');
    this.runningFlag = data['running'] as boolean;
    this.completedFlag = data['completed'] as boolean;
  }

  private resetRun(): void {
    Economy.of(this.game).resetRun(this.options.keep);
  }

  private modifierId(kind: string, index: number): string {
    return `challenge:${this.gameObject.name}:${kind}:${index}`;
  }

  private readonly whenRunning = (entry: TargetedMultiplier) => (): BigNumLike =>
    this.runningFlag ? entry.multiplier : 1;

  private readonly whenCompleted = (entry: TargetedMultiplier) => (): BigNumLike =>
    this.completedFlag ? entry.multiplier : 1;
}
