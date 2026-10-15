import { fnv1a, fromBase64, isJsonObject, stableStringify, toBase64 } from './codec.ts';
import type { JsonObject } from './codec.ts';
import { SaveCorruptedError, SaveVersionError } from './errors.ts';

/**
 * A serialized game state with metadata and an integrity checksum.
 */
export interface SaveData {
  /**
   * Schema version of `data`. Integer >= 1.
   */
  readonly version: number;
  /**
   * Clock time (ms) when the save was created. Used as the offline reference point.
   */
  readonly savedAt: number;
  /**
   * Game state, one entry per system.
   */
  readonly data: JsonObject;
  /**
   * Checksum over `version`, `savedAt` and `data`.
   */
  readonly checksum: string;
}

/**
 * Upgrades the data of a save by exactly one version.
 */
export type Migration = (data: JsonObject) => JsonObject;

/**
 * Migration table. The entry at key `n` upgrades version `n` to `n + 1`, so going from
 * version 1 to 3 runs `migrations[1]` then `migrations[2]`.
 */
export type Migrations = Readonly<Record<number, Migration>>;

function checksumOf(version: number, savedAt: number, data: JsonObject): string {
  return fnv1a(stableStringify({ version, savedAt, data }));
}

/**
 * Builds a {@link SaveData} and computes its checksum.
 */
export function createSave(version: number, savedAt: number, data: JsonObject): SaveData {
  return { version, savedAt, data, checksum: checksumOf(version, savedAt, data) };
}

/**
 * Validates untrusted input (an object or a JSON string) and returns it as {@link SaveData}.
 *
 * @throws {SaveCorruptedError} if the shape is wrong or the checksum does not match.
 */
export function parseSave(input: unknown): SaveData {
  let value = input;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      throw new SaveCorruptedError('Save is not valid JSON');
    }
  }
  if (!isJsonObject(value)) throw new SaveCorruptedError('Save must be an object');
  const { version, savedAt, data, checksum } = value;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SaveCorruptedError('Save has an invalid version');
  }
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) {
    throw new SaveCorruptedError('Save has an invalid timestamp');
  }
  if (!isJsonObject(data)) throw new SaveCorruptedError('Save has no data object');
  if (typeof checksum !== 'string') throw new SaveCorruptedError('Save has no checksum');
  if (checksum !== checksumOf(version, savedAt, data)) {
    throw new SaveCorruptedError('Save checksum mismatch (data was modified or damaged)');
  }
  return { version, savedAt, data, checksum };
}

/**
 * Serializes a save to a Base64 string that is safe to copy, paste or store.
 */
export function exportSave(save: SaveData): string {
  return toBase64(JSON.stringify(save));
}

/**
 * Reads a string produced by {@link exportSave}.
 *
 * @throws {SaveCorruptedError} if the string is damaged or fails validation.
 */
export function importSave(encoded: string): SaveData {
  return parseSave(fromBase64(encoded.trim()));
}

/**
 * Brings a save up to `currentVersion` by running the chained `migrations`.
 * A save that is already current is returned untouched.
 *
 * @throws {SaveVersionError} if the save is newer than `currentVersion`, a step is missing,
 * or a migration does not return an object.
 */
export function migrateSave(
  save: SaveData,
  currentVersion: number,
  migrations: Migrations = {},
): SaveData {
  if (save.version > currentVersion) {
    throw new SaveVersionError(
      `Save version ${save.version} is newer than the supported version ${currentVersion}`,
    );
  }
  let version = save.version;
  let data = save.data;
  while (version < currentVersion) {
    const step = migrations[version];
    if (step === undefined) {
      throw new SaveVersionError(`No migration from save version ${version} to ${version + 1}`);
    }
    const next = step(data);
    if (!isJsonObject(next)) {
      throw new SaveVersionError(`Migration from version ${version} did not return an object`);
    }
    data = next;
    version += 1;
  }
  return version === save.version ? save : createSave(version, save.savedAt, data);
}
