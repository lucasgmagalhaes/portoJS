import { definePlugin } from '../../core/plugin.js';
import type { Kernel, Plugin } from '../../core/plugin.js';
import { SaveCorruptedError, isJsonObject } from '../../core/save/index.js';
import type { JsonObject, JsonValue } from '../../core/save/index.js';

/**
 * Plugin name.
 */
export const REGISTRY_PLUGIN = 'registry';

/**
 * Events emitted by the {@link registry} plugin.
 */
export interface RegistryEvents {
  /**
   * A key was set or changed.
   */
  dataChanged: { readonly key: string; readonly value: JsonValue };
  /**
   * A key was removed.
   */
  dataRemoved: { readonly key: string };
}

/**
 * Methods the {@link registry} plugin adds to the game.
 */
export interface RegistryApi {
  /**
   * Reads a value, or `undefined` when the key is not set.
   */
  getData(key: string): JsonValue | undefined;
  /**
   * Stores a JSON value under `key` and emits `dataChanged`. Unchanged values emit nothing.
   */
  setData(key: string, value: JsonValue): void;
  /**
   * Whether a key is set.
   */
  hasData(key: string): boolean;
  /**
   * Removes a key. Returns whether it existed.
   */
  removeData(key: string): boolean;
  /**
   * All keys currently set, in insertion order.
   */
  dataKeys(): string[];
}

/**
 * Plugin that keeps free-form game data (tutorial flags, the player's name, settings, anything
 * that is not a resource) and saves it with the game. Values must be JSON.
 *
 * The registry is cleared by `game.reset()` and replaced by a loaded save.
 *
 * @example
 * game.setData('tutorialDone', true);
 * game.getData('tutorialDone'); // true
 */
export function registry(): Plugin<RegistryApi, RegistryEvents> {
  const setup = (kernel: Kernel<RegistryEvents>): RegistryApi => {
    const store = new Map<string, JsonValue>();

    kernel.registerSystem({
      id: REGISTRY_PLUGIN,
      serialize: () => {
        const out: JsonObject = {};
        for (const [key, value] of store) out[key] = value;
        return out;
      },
      deserialize: (data) => {
        store.clear();
        if (data === undefined) return;
        if (!isJsonObject(data)) {
          throw new SaveCorruptedError('registry: save entry must be an object');
        }
        for (const [key, value] of Object.entries(data)) store.set(key, value);
      },
    });

    return {
      getData: (key) => store.get(key),
      setData: (key, value) => {
        const same = store.has(key) && JSON.stringify(store.get(key)) === JSON.stringify(value);
        if (same) return;
        store.set(key, value);
        kernel.emit('dataChanged', { key, value });
      },
      hasData: (key) => store.has(key),
      removeData: (key) => {
        const existed = store.delete(key);
        if (existed) kernel.emit('dataRemoved', { key });
        return existed;
      },
      dataKeys: () => [...store.keys()],
    };
  };
  return definePlugin<RegistryApi, RegistryEvents>(REGISTRY_PLUGIN, setup);
}
