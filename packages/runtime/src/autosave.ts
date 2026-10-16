import type { OfflineReport, Scheduler } from '@portojs/core';
import { SaveCorruptedError, SaveVersionError, intervalScheduler } from '@portojs/core';
import type { Game } from './game.ts';
import { GameEvent } from './game-event.ts';
import type { SaveStorage } from './storage.ts';

/**
 * Options of an {@link Autosave}.
 */
export interface AutosaveOptions {
  /**
   * Storage key of the main save. Backups use `<key>.bak1`, `<key>.bak2` and so on. Default
   * `save`.
   */
  readonly key?: string;
  /**
   * Save every this many ms of real time while started. Default none: save on
   * {@link Autosave.request} and {@link Autosave.save} only.
   */
  readonly intervalMs?: number;
  /**
   * How long {@link Autosave.request} waits for more requests before saving. Default `1000`.
   */
  readonly debounceMs?: number;
  /**
   * Older saves to keep next to the main one. Default `2`.
   */
  readonly backups?: number;
  /**
   * Store saves in the compressed format. Default `false`.
   */
  readonly compress?: boolean;
  /**
   * Timer source, replaced in tests. Default `setInterval`.
   */
  readonly scheduler?: Scheduler;
}

/**
 * Where a loaded save came from.
 */
export interface AutosaveLoadResult {
  /**
   * `main` or `backup1`, `backup2`...
   */
  readonly source: string;
  /**
   * Offline progress credited by the load, if it was.
   */
  readonly report: OfflineReport | undefined;
  /**
   * Newer copies that were corrupted and skipped.
   */
  readonly skipped: number;
}

function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const named = error as { name?: unknown; code?: unknown };
  return named.name === 'QuotaExceededError' || named.code === 22 || named.code === 1014;
}

/**
 * Saves a game to a {@link SaveStorage} on a timer or on request, keeps rotating backups and
 * loads the newest save that is not corrupted.
 *
 * @example
 * const autosave = new Autosave(game, new WebSaveStorage(localStorage), { intervalMs: 30_000 });
 * await autosave.load();
 * autosave.start();
 * button.onclick = () => autosave.request();
 */
export class Autosave {
  /**
   * Fires after every successful write.
   */
  readonly saved = new GameEvent<{ at: number }>();
  /**
   * Fires when a write or an automatic save failed. The next one tries again.
   */
  readonly failed = new GameEvent<unknown>();

  private readonly key: string;
  private readonly backups: number;
  private readonly debounceMs: number;
  private readonly intervalMs: number | undefined;
  private readonly compress: boolean;
  private readonly scheduler: Scheduler;
  private stopInterval: (() => void) | undefined;
  private stopDebounce: (() => void) | undefined;
  private chain: Promise<void> = Promise.resolve();

  /**
   * @throws {RangeError} on invalid timing or backup options.
   */
  constructor(
    private readonly game: Game,
    private readonly storage: SaveStorage,
    options: AutosaveOptions = {},
  ) {
    this.key = options.key ?? 'save';
    this.backups = options.backups ?? 2;
    this.debounceMs = options.debounceMs ?? 1000;
    this.intervalMs = options.intervalMs;
    this.compress = options.compress ?? false;
    this.scheduler = options.scheduler ?? intervalScheduler;
    if (!Number.isInteger(this.backups) || this.backups < 0) {
      throw new RangeError('Autosave: backups must be an integer >= 0');
    }
    if (!(this.debounceMs >= 0) || !Number.isFinite(this.debounceMs)) {
      throw new RangeError('Autosave: debounceMs must be a finite number >= 0');
    }
    if (this.intervalMs !== undefined && !(this.intervalMs > 0)) {
      throw new RangeError('Autosave: intervalMs must be > 0');
    }
  }

  /**
   * `true` while the interval timer runs.
   */
  get running(): boolean {
    return this.stopInterval !== undefined;
  }

  /**
   * Starts saving every `intervalMs`. Does nothing without an interval or when already started.
   */
  start(): void {
    if (this.intervalMs === undefined || this.stopInterval !== undefined) return;
    this.stopInterval = this.scheduler.start(this.onInterval, this.intervalMs);
  }

  /**
   * Stops the interval and cancels a pending {@link Autosave.request}.
   */
  stop(): void {
    this.stopInterval?.();
    this.stopInterval = undefined;
    this.cancelDebounce();
  }

  /**
   * Asks for a save soon. Many requests within `debounceMs` become one save.
   */
  request(): void {
    if (this.stopDebounce !== undefined) return;
    this.stopDebounce = this.scheduler.start(this.onDebounce, this.debounceMs);
  }

  /**
   * Saves now if a request is pending, and waits for every write in flight. Call it when the
   * page is about to be hidden.
   */
  async flush(): Promise<void> {
    if (this.stopDebounce !== undefined) {
      this.cancelDebounce();
      await this.save();
      return;
    }
    await this.chain;
  }

  /**
   * Saves now. Writes never overlap: they run one after another.
   *
   * @throws if the storage rejects after the quota fallback.
   */
  save(): Promise<void> {
    const run = this.chain.then(this.write, this.write);
    this.chain = run.catch(ignore);
    return run;
  }

  /**
   * Loads the newest save that is intact: the main one, else the backups from newest to oldest.
   *
   * @returns what was loaded, or `undefined` when nothing is stored.
   * @throws {SaveCorruptedError} when saves exist but every copy is corrupted.
   * @throws {SaveVersionError} when a save is from a newer game version; older copies are not
   * tried, so progress is not silently lost.
   */
  async load(): Promise<AutosaveLoadResult | undefined> {
    let skipped = 0;
    for (let index = 0; index <= this.backups; index++) {
      const text = await this.storage.get(this.slot(index));
      if (text === null) continue;
      try {
        const report = this.game.load(text);
        return { source: index === 0 ? 'main' : `backup${index}`, report, skipped };
      } catch (error) {
        if (error instanceof SaveVersionError || !(error instanceof SaveCorruptedError))
          throw error;
        skipped += 1;
      }
    }
    if (skipped > 0) throw new SaveCorruptedError('Autosave: every stored save is corrupted');
    return undefined;
  }

  /**
   * Deletes the main save and all backups.
   */
  async clear(): Promise<void> {
    for (let index = 0; index <= this.backups; index++) await this.storage.remove(this.slot(index));
  }

  private slot(index: number): string {
    return index === 0 ? this.key : `${this.key}.bak${index}`;
  }

  private readonly onInterval = (): void => {
    this.save().catch(this.report);
  };

  private readonly onDebounce = (): void => {
    this.cancelDebounce();
    this.save().catch(this.report);
  };

  private readonly report = (error: unknown): void => {
    this.failed.invoke(error);
  };

  private cancelDebounce(): void {
    this.stopDebounce?.();
    this.stopDebounce = undefined;
  }

  private readonly write = async (): Promise<void> => {
    const text = this.game.exportSave(this.compress ? { compress: true } : undefined);
    try {
      await this.rotate();
      await this.storage.set(this.key, text);
    } catch (error) {
      if (!isQuotaError(error) || this.backups === 0) throw error;
      await this.dropBackups();
      await this.storage.set(this.key, text);
    }
    this.saved.invoke({ at: this.game.now() });
  };

  private async rotate(): Promise<void> {
    for (let index = this.backups; index >= 1; index--) {
      const older = await this.storage.get(this.slot(index - 1));
      if (older === null) await this.storage.remove(this.slot(index));
      else await this.storage.set(this.slot(index), older);
    }
  }

  private async dropBackups(): Promise<void> {
    for (let index = 1; index <= this.backups; index++) await this.storage.remove(this.slot(index));
  }
}

function ignore(): void {
  return;
}
