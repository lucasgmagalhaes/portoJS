import { SaveCorruptedError, isJsonObject } from '@portojs/core';
import type { JsonObject, JsonValue } from '@portojs/core';
import { Component, GameEvent } from '@portojs/runtime';

/**
 * Free-form game data that is saved with the game: tutorial flags, the player's name, settings,
 * anything that is not a resource. Values must be JSON. It is cleared by `game.reset()` and
 * replaced by a loaded save.
 *
 * @example
 * const data = game.createObject('Data').addComponent(DataStore);
 * data.set('tutorialDone', true);
 * data.get('tutorialDone');
 */
export class DataStore extends Component {
  static override typeId = 'DataStore';

  /**
   * Fired when a key is set or changed.
   */
  readonly changed = new GameEvent<{ readonly key: string; readonly value: JsonValue }>();

  /**
   * Fired when a key is removed.
   */
  readonly removed = new GameEvent<{ readonly key: string }>();

  private readonly values = new Map<string, JsonValue>();

  /**
   * Reads a value, or `undefined` when the key is not set.
   */
  get(key: string): JsonValue | undefined {
    return this.values.get(key);
  }

  /**
   * Stores a JSON value under `key`. Unchanged values emit nothing.
   */
  set(key: string, value: JsonValue): void {
    const same =
      this.values.has(key) && JSON.stringify(this.values.get(key)) === JSON.stringify(value);
    if (same) return;
    this.values.set(key, value);
    this.changed.invoke({ key, value });
  }

  /**
   * Whether a key is set.
   */
  has(key: string): boolean {
    return this.values.has(key);
  }

  /**
   * Removes a key. Returns whether it existed.
   */
  remove(key: string): boolean {
    const existed = this.values.delete(key);
    if (existed) this.removed.invoke({ key });
    return existed;
  }

  /**
   * All keys currently set, in insertion order.
   */
  keys(): string[] {
    return [...this.values.keys()];
  }

  override onSave(): JsonValue {
    const out: JsonObject = {};
    for (const [key, value] of this.values) out[key] = value;
    return out;
  }

  override onLoad(data: JsonValue | undefined): void {
    this.values.clear();
    if (data === undefined) return;
    if (!isJsonObject(data))
      throw new SaveCorruptedError('DataStore: save entry must be an object');
    for (const [key, value] of Object.entries(data)) this.values.set(key, value);
  }
}
