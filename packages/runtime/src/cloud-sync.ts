import { SaveCorruptedError, createSave, exportSave, importSave } from '@portojs/core';
import type { SaveData } from '@portojs/core';
import type { SaveStorage } from './storage.ts';

/**
 * How two different saves are reconciled. The built-in ones:
 *
 * - `newest`: the save made last wins (by `savedAt`).
 * - `furthest`: the save with the higher `progress(save)` wins; ties go to the newest.
 *
 * Or a function that gets both and returns `'local'`, `'cloud'`, or a new save made by merging
 * them, which is then written to both sides (its checksum is recomputed, so you only need to set
 * `version`, `savedAt` and `data`).
 */
export type ConflictPolicy =
  'newest' | 'furthest' | ((local: SaveData, cloud: SaveData) => 'local' | 'cloud' | SaveData);

/**
 * Options of {@link CloudSync}.
 */
export interface CloudSyncOptions {
  /**
   * The storage key on both sides. Default `save`.
   */
  readonly key?: string;
  /**
   * What to do when both sides hold different saves. Default `newest`.
   */
  readonly policy?: ConflictPolicy;
  /**
   * How far along a save is, for the `furthest` policy: for example the total gold earned, or the
   * number of levels done. Required with `furthest`.
   */
  readonly progress?: (save: SaveData) => number;
}

/**
 * What a {@link CloudSync.sync} did.
 */
export interface SyncResult {
  /**
   * - `none`: nothing to do (both empty, or already the same).
   * - `uploaded`: the cloud got the local save.
   * - `downloaded`: the local storage got the cloud save.
   * - `merged`: a merged save was written to both.
   */
  readonly action: 'none' | 'uploaded' | 'downloaded' | 'merged';
  /**
   * Whether the two sides held different saves that had to be reconciled.
   */
  readonly conflict: boolean;
}

function compareNewest(local: SaveData, cloud: SaveData): 'local' | 'cloud' {
  return cloud.savedAt > local.savedAt ? 'cloud' : 'local';
}

function readOrUndefined(text: string): SaveData | undefined {
  try {
    return importSave(text);
  } catch (error) {
    if (error instanceof SaveCorruptedError) return undefined;
    throw error;
  }
}

/**
 * Keeps the save in local storage and in the cloud in step. Run {@link CloudSync.sync} at start
 * (and after loading, if the cloud won, call `game.load` with the local text), and again after
 * saving. Any {@link SaveStorage} can be the cloud: your server, a platform's cloud storage.
 *
 * Only the `savedAt` and your `progress` function are compared; the saves are never opened by the
 * game here, so a save from a newer game version is still synced.
 *
 * @example
 * const sync = new CloudSync(localStore, serverStore, {
 *   policy: 'furthest',
 *   progress: (save) => levelsDone(save),
 * });
 * const { action } = await sync.sync();
 * if (action === 'downloaded') game.load((await localStore.get('save')) ?? '');
 */
export class CloudSync {
  private readonly key: string;
  private readonly policy: ConflictPolicy;
  private readonly progress: ((save: SaveData) => number) | undefined;

  /**
   * @throws {RangeError} if the `furthest` policy has no `progress` function.
   */
  constructor(
    private readonly local: SaveStorage,
    private readonly cloud: SaveStorage,
    options: CloudSyncOptions = {},
  ) {
    this.key = options.key ?? 'save';
    this.policy = options.policy ?? 'newest';
    this.progress = options.progress;
    if (this.policy === 'furthest' && this.progress === undefined) {
      throw new RangeError('CloudSync: the furthest policy needs a progress function');
    }
  }

  /**
   * Compares the two sides and copies the winner over the loser.
   *
   * @throws {SaveCorruptedError} if both sides hold damaged data.
   */
  async sync(): Promise<SyncResult> {
    const localText = await this.local.get(this.key);
    const cloudText = await this.cloud.get(this.key);
    if (localText === null && cloudText === null) return { action: 'none', conflict: false };
    if (cloudText === null) return this.upload(localText as string, false);
    if (localText === null) return this.download(cloudText, false);
    if (localText === cloudText) return { action: 'none', conflict: false };

    const local = readOrUndefined(localText);
    const cloud = readOrUndefined(cloudText);
    if (local === undefined && cloud === undefined) {
      throw new SaveCorruptedError('CloudSync: both the local and the cloud save are damaged');
    }
    if (cloud === undefined) return this.upload(localText, true);
    if (local === undefined) return this.download(cloudText, true);

    const verdict = this.decide(local, cloud);
    if (verdict === 'local') return this.upload(localText, true);
    if (verdict === 'cloud') return this.download(cloudText, true);
    const merged = exportSave(createSave(verdict.version, verdict.savedAt, verdict.data));
    await this.local.set(this.key, merged);
    await this.cloud.set(this.key, merged);
    return { action: 'merged', conflict: true };
  }

  private decide(local: SaveData, cloud: SaveData): 'local' | 'cloud' | SaveData {
    if (typeof this.policy === 'function') return this.policy(local, cloud);
    if (this.policy === 'newest' || this.progress === undefined) return compareNewest(local, cloud);
    const behind = this.progress(local) - this.progress(cloud);
    if (behind > 0) return 'local';
    if (behind < 0) return 'cloud';
    return compareNewest(local, cloud);
  }

  private async upload(text: string, conflict: boolean): Promise<SyncResult> {
    await this.cloud.set(this.key, text);
    return { action: 'uploaded', conflict };
  }

  private async download(text: string, conflict: boolean): Promise<SyncResult> {
    await this.local.set(this.key, text);
    return { action: 'downloaded', conflict };
  }
}
