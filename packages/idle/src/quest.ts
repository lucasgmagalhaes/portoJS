import { SaveCorruptedError } from '@portojs/core';
import type { JsonValue } from '@portojs/core';
import { Component, GameEvent } from '@portojs/runtime';
import type { Game, GameObject } from '@portojs/runtime';

/**
 * One step of a {@link Quest}.
 */
export interface QuestStep {
  /**
   * Stable name of the step, used by UIs and analytics.
   */
  readonly id: string;
  /**
   * Text to show the player.
   */
  readonly description?: string;
  /**
   * Returns `true` once the goal of the step is met.
   */
  readonly condition: (game: Game) => boolean;
  /**
   * Progress from `0` to `1` for a progress bar. Optional; defaults to `0` until the goal is met.
   */
  readonly progress?: (game: Game) => number;
  /**
   * Runs once when the step is claimed (grant gold, give a boost). Not repeated after a load.
   */
  readonly reward?: (game: Game) => void;
  /**
   * Runs when the step is claimed and again after a save is loaded, for permanent effects such
   * as a production modifier. Make it idempotent.
   */
  readonly effect?: (game: Game) => void;
}

/**
 * Options for {@link Quest}.
 */
export interface QuestOptions {
  /**
   * The steps, in order. Only the current one is evaluated.
   */
  readonly steps: readonly QuestStep[];
  /**
   * Claim a step as soon as its condition holds. Default `false`: the player claims it.
   */
  readonly autoClaim?: boolean;
  /**
   * How often the current condition is evaluated, in ms of game time. Default `500`.
   */
  readonly checkIntervalMs?: number;
}

/**
 * Payload of the {@link Quest} events.
 */
export interface QuestClaim {
  readonly quest: Quest;
  readonly step: QuestStep;
  /**
   * Index of the step.
   */
  readonly index: number;
}

/**
 * A chain of goals with a reward each. The player works through the steps in order: when the
 * current condition holds the step is ready, and claiming it pays the reward and moves on.
 *
 * @example
 * const tutorial = game.createObject('Tutorial').addComponent(Quest, {
 *   steps: [
 *     { id: 'first-miner', condition: () => miner.bought.gte(1), reward: () => gold.add(100) },
 *     { id: 'ten-miners', condition: () => miner.bought.gte(10), reward: () => gold.add(1000) },
 *   ],
 * });
 * if (tutorial.canClaim) tutorial.claim();
 */
export class Quest extends Component {
  static override typeId = 'Quest';

  /**
   * Fired when the current step's condition first holds.
   */
  readonly ready = new GameEvent<QuestClaim>();

  /**
   * Fired after a step is claimed.
   */
  readonly claimed = new GameEvent<QuestClaim>();

  /**
   * Fired once the last step is claimed.
   */
  readonly finished = new GameEvent<Quest>();

  private readonly options: QuestOptions;
  private readonly interval: number;
  private position = 0;
  private isReady = false;
  private sinceCheck = 0;

  constructor(gameObject: GameObject, options: QuestOptions) {
    super(gameObject);
    this.options = options;
    this.interval = options.checkIntervalMs ?? 500;
    if (options.steps.length === 0) throw new RangeError('Quest: needs at least one step');
    if (!Number.isFinite(this.interval) || this.interval <= 0) {
      throw new RangeError('Quest: checkIntervalMs must be a positive number');
    }
    const ids = new Set<string>();
    for (const step of options.steps) {
      if (ids.has(step.id)) throw new RangeError(`Quest: duplicate step id "${step.id}"`);
      ids.add(step.id);
    }
  }

  /**
   * Index of the current step, equal to the step count when the quest is finished.
   */
  get index(): number {
    return this.position;
  }

  /**
   * Number of steps.
   */
  get length(): number {
    return this.options.steps.length;
  }

  /**
   * The step the player is working on, or `undefined` when the quest is finished.
   */
  get current(): QuestStep | undefined {
    return this.options.steps[this.position];
  }

  /**
   * Whether every step has been claimed.
   */
  get isFinished(): boolean {
    return this.position >= this.options.steps.length;
  }

  /**
   * Whether the current step's goal is met and it can be claimed.
   */
  get canClaim(): boolean {
    return this.evaluate();
  }

  /**
   * Progress of the current step from `0` to `1`; `1` when the quest is finished.
   */
  get progress(): number {
    const step = this.current;
    if (step === undefined || this.evaluate()) return 1;
    const value = step.progress?.(this.game) ?? 0;
    return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  }

  /**
   * Whether the step with this id has been claimed.
   */
  isClaimed(id: string): boolean {
    for (let i = 0; i < this.position; i++) if (this.options.steps[i]?.id === id) return true;
    return false;
  }

  /**
   * Pays the current step's reward and moves to the next one.
   *
   * @returns `false` and changes nothing when the goal is not met yet or the quest is finished.
   */
  claim(): boolean {
    const step = this.current;
    if (step === undefined || !this.evaluate()) return false;
    const index = this.position;
    this.position += 1;
    this.isReady = false;
    this.sinceCheck = 0;
    step.reward?.(this.game);
    step.effect?.(this.game);
    this.claimed.invoke({ quest: this, step, index });
    if (this.isFinished) this.finished.invoke(this);
    else if (this.options.autoClaim === true) this.claim();
    return true;
  }

  override fixedUpdate(deltaTime: number): void {
    if (this.isFinished) return;
    this.sinceCheck += deltaTime * 1000;
    if (this.sinceCheck < this.interval) return;
    this.sinceCheck = 0;
    if (this.evaluate() && this.options.autoClaim === true) this.claim();
  }

  override onSave(): JsonValue {
    return this.position;
  }

  override onLoad(data: JsonValue | undefined): void {
    this.position = 0;
    this.isReady = false;
    this.sinceCheck = 0;
    if (data === undefined) return;
    if (
      typeof data !== 'number' ||
      !Number.isInteger(data) ||
      data < 0 ||
      data > this.options.steps.length
    ) {
      throw new SaveCorruptedError('Quest: invalid step index');
    }
    this.position = data;
    for (let i = 0; i < data; i++) this.options.steps[i]?.effect?.(this.game);
  }

  private evaluate(): boolean {
    const step = this.current;
    if (step === undefined) return false;
    const met = step.condition(this.game);
    if (met && !this.isReady) {
      this.isReady = true;
      this.ready.invoke({ quest: this, step, index: this.position });
    }
    return met;
  }
}
