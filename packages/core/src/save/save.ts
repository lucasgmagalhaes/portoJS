import {
  base64ToBytes,
  bytesToBase64,
  fnv1a,
  fromBase64,
  isJsonObject,
  stableStringify,
  toBase64,
} from './codec.ts';
import type { JsonObject } from './codec.ts';
import { SaveCorruptedError, SaveVersionError } from './errors.ts';
import { lzwCompress, lzwDecompress } from './lzw.ts';

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
 * Prefix of a compressed export. It is not a Base64 character, so the two formats never clash.
 */
const COMPRESSED_PREFIX = '~';

/**
 * Options of {@link exportSave}.
 */
export interface ExportOptions {
  /**
   * Compress the save (LZW, then Base64, prefixed with `~`). Typically several times smaller for
   * big saves. {@link importSave} reads both formats. Default `false`.
   */
  compress?: boolean;
}

/**
 * Serializes a save to a Base64 string that is safe to copy, paste or store.
 */
export function exportSave(save: SaveData, options: ExportOptions = {}): string {
  const json = JSON.stringify(save);
  if (options.compress !== true) return toBase64(json);
  return COMPRESSED_PREFIX + bytesToBase64(lzwCompress(new TextEncoder().encode(json)));
}

/**
 * Reads a string produced by {@link exportSave}, compressed or not.
 *
 * @param encoded the exported string.
 * @param maxChars largest decompressed save accepted, in bytes. Default 10,000,000.
 * @throws {SaveCorruptedError} if the string is damaged or fails validation.
 */
export function importSave(encoded: string, maxChars = 10_000_000): SaveData {
  const text = encoded.trim();
  if (!text.startsWith(COMPRESSED_PREFIX)) return parseSave(fromBase64(text));
  const bytes = lzwDecompress(base64ToBytes(text.slice(COMPRESSED_PREFIX.length)), maxChars);
  try {
    return parseSave(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof SaveCorruptedError) throw error;
    throw new SaveCorruptedError('Compressed save is not valid text');
  }
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
