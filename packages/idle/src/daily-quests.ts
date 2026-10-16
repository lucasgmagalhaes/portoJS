import { SaveCorruptedError, isJsonObject } from '@portojs/core';
import type { JsonValue } from '@portojs/core';
import { Component, GameEvent } from '@portojs/runtime';
import type { Game, GameObject } from '@portojs/runtime';
import { dayNumber, nextDayStart } from './daily-streak.ts';

/**
 * A quest that can be picked for a day.
 */
export interface DailyQuestDefinition {
  /**
   * Stable name, used in saves. Keep it when you change the text.
   */
  readonly id: string;
  /**
   * Text to show the player.
   */
  readonly description?: string;
  /**
   * How much progress completes it, for example `50` for "mine 50 times".
   */
  readonly target: number;
  /**
   * Chance relative to the others when the day's quests are drawn. Default `1`.
   */
  readonly weight?: number;
  /**
   * Pays the reward when the player claims it.
   */
  readonly reward?: (game: Game) => void;
}

/**
 * Options of {@link DailyQuests}.
 */
export interface DailyQuestsOptions {
  /**
   * Every quest that can come up. Each day draws {@link DailyQuestsOptions.count} of them.
   */
  readonly pool: readonly DailyQuestDefinition[];
  /**
   * Quests per day. Default `3`, at most the size of the pool.
   */
  readonly count?: number;
  /**
   * Minutes east of UTC for the day boundaries. Default `0`. See `DailyStreak`.
   */
  readonly utcOffsetMinutes?: number;
  /**
   * Changes the draw. Two games with the same seed and day get the same quests. Default `0`.
   */
  readonly seed?: number;
}

/**
 * A quest of today, with the player's progress.
 */
export interface DailyQuestState {
  readonly definition: DailyQuestDefinition;
  readonly progress: number;
  /**
   * Whether the target was reached.
   */
  readonly complete: boolean;
  /**
   * Whether the reward was claimed.
   */
  readonly claimed: boolean;
}

interface Slot {
  readonly definition: DailyQuestDefinition;
  progress: number;
  claimed: boolean;
}

function generator(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function snapshot(slot: Slot): DailyQuestState {
  return {
    definition: slot.definition,
    progress: slot.progress,
    complete: slot.progress >= slot.definition.target,
    claimed: slot.claimed,
  };
}

/**
 * A few quests that change every day, drawn from a pool. The draw depends only on the day (and a
 * seed), so it is the same on every device. Report progress with {@link DailyQuests.add} from
 * your game code, and let the player claim the rewards.
 *
 * @example
 * const daily = game.createObject('Daily').addComponent(DailyQuests, {
 *   pool: [
 *     { id: 'mine', description: 'Mine 50 times', target: 50, reward: () => gold.add(500) },
 *     { id: 'buy', description: 'Buy 5 miners', target: 5, reward: () => gems.add(2) },
 *     { id: 'earn', description: 'Earn 10K gold', target: 10_000, weight: 2, reward: () => gems.add(1) },
 *   ],
 *   count: 2,
 * });
 * onMine(() => daily.add('mine'));
 * for (const quest of daily.quests) render(quest);
 */
export class DailyQuests extends Component {
  static override typeId = 'DailyQuests';

  /**
   * Fired when a new day's quests are drawn.
   */
  readonly refreshed = new GameEvent<readonly DailyQuestState[]>();

  /**
   * Fired when a quest reaches its target.
   */
  readonly completed = new GameEvent<DailyQuestState>();

  /**
   * Fired after a reward is claimed.
   */
  readonly claimed = new GameEvent<DailyQuestState>();

  private readonly options: DailyQuestsOptions;
  private readonly offset: number;
  private readonly size: number;
  private slots: Slot[] = [];
  private currentDay: number | undefined;
  private sinceCheck = 0;

  /**
   * @throws {RangeError} for an empty pool, duplicate ids, a bad target or weight, or a `count`
   * outside `1` to the pool size.
   */
  constructor(gameObject: GameObject, options: DailyQuestsOptions) {
    super(gameObject);
    this.options = options;
    this.offset = options.utcOffsetMinutes ?? 0;
    this.size = options.count ?? Math.min(3, options.pool.length);
    if (options.pool.length === 0) throw new RangeError('DailyQuests: the pool is empty');
    if (!Number.isInteger(this.size) || this.size < 1 || this.size > options.pool.length) {
      throw new RangeError('DailyQuests: count must be from 1 to the size of the pool');
    }
    const ids = new Set<string>();
    for (const quest of options.pool) {
      if (ids.has(quest.id)) throw new RangeError(`DailyQuests: duplicate id "${quest.id}"`);
      ids.add(quest.id);
      if (!(quest.target > 0) || !Number.isFinite(quest.target)) {
        throw new RangeError(`DailyQuests: "${quest.id}" needs a target > 0`);
      }
      if (quest.weight !== undefined && !(quest.weight > 0)) {
        throw new RangeError(`DailyQuests: "${quest.id}" needs a weight > 0`);
      }
    }
  }

  /**
   * Today's quests with their progress.
   */
  get quests(): readonly DailyQuestState[] {
    this.refresh();
    return this.slots.map(snapshot);
  }

  /**
   * The day number the quests belong to.
   */
  get day(): number {
    this.refresh();
    return this.currentDay ?? 0;
  }

  /**
   * Ms of game clock until new quests are drawn, for a countdown.
   */
  get msUntilReset(): number {
    return nextDayStart(this.game.now(), this.offset) - this.game.now();
  }

  /**
   * Adds progress to a quest of today. Progress stops at the target.
   *
   * @returns `false` when today has no quest with that id (it may not have been drawn).
   * @throws {RangeError} if `amount` is negative or not finite.
   */
  add(id: string, amount = 1): boolean {
    if (!(amount >= 0) || !Number.isFinite(amount)) {
      throw new RangeError('DailyQuests.add: amount must be a finite number >= 0');
    }
    this.refresh();
    const slot = this.slots.find(slotWithId(id));
    if (slot === undefined) return false;
    const before = slot.progress >= slot.definition.target;
    slot.progress = Math.min(slot.definition.target, slot.progress + amount);
    if (!before && slot.progress >= slot.definition.target) this.completed.invoke(snapshot(slot));
    return true;
  }

  /**
   * Pays the reward of a completed quest.
   *
   * @returns `false` if there is no such quest today, it is not complete, or already claimed.
   */
  claim(id: string): boolean {
    this.refresh();
    const slot = this.slots.find(slotWithId(id));
    if (slot === undefined || slot.claimed || slot.progress < slot.definition.target) return false;
    slot.claimed = true;
    slot.definition.reward?.(this.game);
    this.claimed.invoke(snapshot(slot));
    return true;
  }

  /**
   * Claims every completed quest.
   *
   * @returns how many were claimed.
   */
  claimAll(): number {
    let count = 0;
    for (const slot of [...this.slots]) if (this.claim(slot.definition.id)) count += 1;
    return count;
  }

  /**
   * Draws new quests if the day changed since they were drawn. Called for you when you read
   * `quests` or report progress, and every second of game time.
   *
   * @returns `true` if new quests were drawn.
   */
  refresh(): boolean {
    const today = dayNumber(this.game.now(), this.offset);
    if (today === this.currentDay) return false;
    this.currentDay = today;
    this.slots = this.draw(today);
    this.refreshed.invoke(this.slots.map(snapshot));
    return true;
  }

  override fixedUpdate(deltaTime: number): void {
    this.sinceCheck += deltaTime;
    if (this.sinceCheck < 1) return;
    this.sinceCheck = 0;
    this.refresh();
  }

  override onSave(): JsonValue {
    return {
      day: this.currentDay ?? null,
      quests: this.slots.map(entryOf),
    };
  }

  override onLoad(data: JsonValue | undefined): void {
    this.slots = [];
    this.currentDay = undefined;
    this.sinceCheck = 0;
    if (data === undefined) return;
    if (!isJsonObject(data))
      throw new SaveCorruptedError('DailyQuests: save entry must be an object');
    const day = data['day'];
    const saved = data['quests'];
    if (day === null) return;
    if (typeof day !== 'number' || !Number.isInteger(day) || !Array.isArray(saved)) {
      throw new SaveCorruptedError('DailyQuests: day and quests are invalid');
    }
    const slots: Slot[] = [];
    for (const entry of saved) {
      if (!Array.isArray(entry) || entry.length !== 3) {
        throw new SaveCorruptedError('DailyQuests: a quest entry is invalid');
      }
      const [id, progress, claimed] = entry;
      if (typeof id !== 'string' || typeof progress !== 'number' || !(progress >= 0)) {
        throw new SaveCorruptedError('DailyQuests: a quest entry is invalid');
      }
      const definition = this.options.pool.find(definitionWithId(id));
      if (definition === undefined) continue;
      slots.push({
        definition,
        progress: Math.min(definition.target, progress),
        claimed: claimed === 1,
      });
    }
    this.currentDay = day;
    this.slots = slots;
    this.refresh();
  }

  private draw(day: number): Slot[] {
    const random = generator(Math.imul(day, 2654435761) ^ (this.options.seed ?? 0));
    const remaining = [...this.options.pool];
    const chosen: Slot[] = [];
    while (chosen.length < this.size) {
      let total = 0;
      for (const quest of remaining) total += quest.weight ?? 1;
      let roll = random() * total;
      let index = 0;
      for (const [position, quest] of remaining.entries()) {
        roll -= quest.weight ?? 1;
        index = position;
        if (roll < 0) break;
      }
      const [picked] = remaining.splice(index, 1);
      if (picked !== undefined) chosen.push({ definition: picked, progress: 0, claimed: false });
    }
    return chosen;
  }
}

function slotWithId(id: string): (slot: Slot) => boolean {
  return (slot) => slot.definition.id === id;
}

function definitionWithId(id: string): (definition: DailyQuestDefinition) => boolean {
  return (definition) => definition.id === id;
}

function entryOf(slot: Slot): JsonValue {
  return [slot.definition.id, slot.progress, slot.claimed ? 1 : 0];
}
