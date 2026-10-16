import type { AudioEngine } from './engine.ts';

/**
 * The part of `localStorage` the volume helpers use.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const DEFAULT_KEY = 'portojs.audio';

/**
 * Saves the engine's volumes (master, mute, every bus) as JSON. Storage that throws (private
 * mode, quota) is ignored: losing a volume setting is not worth a crash.
 */
export function saveVolumes(
  engine: AudioEngine,
  storage: KeyValueStorage,
  key: string = DEFAULT_KEY,
): void {
  try {
    storage.setItem(key, JSON.stringify(engine.exportVolumes()));
  } catch {
    return;
  }
}

/**
 * Applies volumes saved by {@link saveVolumes}. Returns whether anything valid was found.
 * Corrupt data is ignored.
 */
export function loadVolumes(
  engine: AudioEngine,
  storage: KeyValueStorage,
  key: string = DEFAULT_KEY,
): boolean {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return false;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return false;
    engine.importVolumes(data);
    return true;
  } catch {
    return false;
  }
}
