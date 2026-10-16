import { Emitter } from '@portojs/core';
import type { Listener, Unsubscribe } from '@portojs/core';
import { binaryLoader, imageLoader, jsonLoader, textLoader } from './builtin.ts';
import { AssetError, UnknownAssetError, abortError } from './errors.ts';
import { Limiter } from './limiter.ts';
import type {
  AssetEntry,
  AssetFetcher,
  AssetLoaderDefinition,
  AssetManifest,
  AssetType,
  AssetTypes,
  FetchResponse,
  LoadProgress,
  LoaderContext,
} from './types.ts';

/**
 * Options of an {@link AssetLoader}.
 */
export interface AssetLoaderOptions {
  /**
   * Prefix added to every URL, for example `'/assets/'`. Default none.
   */
  readonly baseUrl?: string;
  /**
   * Replaces `fetch`.
   */
  readonly fetch?: AssetFetcher;
  /**
   * Extra attempts after a network error or a 5xx status. Default `2`.
   */
  readonly retries?: number;
  /**
   * Wait before the first retry, doubled each time. Default `250` ms.
   */
  readonly retryDelayMs?: number;
  /**
   * Replaces the wait between retries, for tests.
   */
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * Downloads in flight at once. Default `6`.
   */
  readonly concurrency?: number;
  /**
   * A manifest to define right away.
   */
  readonly manifest?: AssetManifest;
}

/**
 * Options of a single load call.
 */
export interface LoadOptions {
  /**
   * Cancels the wait for this call. The download itself stops once nobody waits for it.
   */
  readonly signal?: AbortSignal;
}

/**
 * Options of {@link AssetLoader.loadMany} and {@link AssetLoader.loadBundle}.
 */
export interface LoadManyOptions extends LoadOptions {
  /**
   * Called once at the start and after each asset finishes.
   */
  readonly onProgress?: (progress: LoadProgress) => void;
}

/**
 * Events of an {@link AssetLoader}.
 */
export interface AssetLoaderEvents {
  /**
   * An asset finished loading.
   */
  loaded: { name: string; type: AssetType };
  /**
   * An asset failed after all retries.
   */
  failed: { name: string; error: Error };
  /**
   * An asset was released for the last time and freed.
   */
  disposed: { name: string };
}

class Slot {
  readonly controller = new AbortController();
  promise: Promise<void> = Promise.resolve();
  waiters = 0;
  refs = 0;
  value: unknown = undefined;
  ready = false;

  constructor(
    readonly name: string,
    readonly definition: AssetEntry,
  ) {}
}

class AbortWatch {
  readonly promise: Promise<never>;
  private reject: (reason: unknown) => void = noop;

  constructor(private readonly signal: AbortSignal) {
    this.promise = new Promise(this.capture);
    signal.addEventListener('abort', this.onAbort, { once: true });
  }

  stop(): void {
    this.signal.removeEventListener('abort', this.onAbort);
  }

  private readonly capture = (_resolve: unknown, reject: (reason: unknown) => void): void => {
    this.reject = reject;
  };

  private readonly onAbort = (): void => {
    this.reject(abortError());
  };
}

class Progress {
  private loaded = 0;

  constructor(
    private readonly total: number,
    private readonly listener: ((progress: LoadProgress) => void) | undefined,
  ) {}

  report(name: string | undefined): void {
    this.listener?.({
      loaded: this.loaded,
      total: this.total,
      ratio: this.total === 0 ? 1 : this.loaded / this.total,
      name,
    });
  }

  readonly finish = (name: string): void => {
    this.loaded += 1;
    this.report(name);
  };
}

function noop(): void {
  return;
}

function timer(ms: number): (resolve: () => void) => void {
  return (resolve) => {
    setTimeout(resolve, ms);
  };
}

function sleepFor(ms: number): Promise<void> {
  return new Promise(timer(ms));
}

/**
 * Loads the assets of a game by name: a manifest, bundles with progress, retry with backoff,
 * a download limit, reference counting and cancellation.
 *
 * @example
 * const assets = new AssetLoader({
 *   baseUrl: '/assets/',
 *   manifest: {
 *     assets: { hero: { type: 'image', url: 'hero.png' }, level: { type: 'json', url: 'l1.json' } },
 *     bundles: { level1: ['hero', 'level'] },
 *   },
 * });
 * await assets.loadBundle('level1', { onProgress: ({ ratio }) => bar.set(ratio) });
 * const hero = assets.get<'image'>('hero');
 */
export class AssetLoader {
  private readonly bus = new Emitter<AssetLoaderEvents>();
  private readonly loaders = new Map<string, AssetLoaderDefinition<unknown>>();
  private readonly definitions = new Map<string, AssetEntry>();
  private readonly bundles = new Map<string, readonly string[]>();
  private readonly slots = new Map<string, Slot>();
  private readonly limiter: Limiter;
  private readonly baseUrl: string;
  private readonly fetcher: AssetFetcher;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  /**
   * @throws {RangeError} on invalid retry or concurrency options.
   */
  constructor(options: AssetLoaderOptions = {}) {
    this.baseUrl = options.baseUrl ?? '';
    this.fetcher = options.fetch ?? fetch;
    this.retries = options.retries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 250;
    this.sleep = options.sleep ?? sleepFor;
    const concurrency = options.concurrency ?? 6;
    if (!Number.isInteger(this.retries) || this.retries < 0) {
      throw new RangeError('AssetLoader: retries must be an integer >= 0');
    }
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError('AssetLoader: concurrency must be an integer >= 1');
    }
    this.limiter = new Limiter(concurrency);
    this.register('json', jsonLoader);
    this.register('text', textLoader);
    this.register('binary', binaryLoader);
    this.register('image', imageLoader);
    if (options.manifest !== undefined) this.define(options.manifest);
  }

  /**
   * Adds (or replaces) the loader of an asset type.
   */
  register<K extends AssetType>(type: K, loader: AssetLoaderDefinition<AssetTypes[K]>): void {
    this.loaders.set(type, loader);
  }

  /**
   * Adds the assets and bundles of a manifest to the ones already known.
   *
   * @throws {UnknownAssetError} if a bundle names an asset that is not defined.
   */
  define(manifest: AssetManifest): void {
    for (const [bundle, members] of Object.entries(manifest.bundles ?? {})) {
      for (const name of members) {
        if (!(name in manifest.assets) && !this.definitions.has(name)) {
          throw new UnknownAssetError(name, `bundle "${bundle}" refers to an undefined asset`);
        }
      }
    }
    for (const [name, entry] of Object.entries(manifest.assets)) this.definitions.set(name, entry);
    for (const [bundle, members] of Object.entries(manifest.bundles ?? {})) {
      this.bundles.set(bundle, members);
    }
  }

  /**
   * Subscribes to an event. Returns a function that unsubscribes.
   */
  on<K extends keyof AssetLoaderEvents>(
    event: K,
    listener: Listener<AssetLoaderEvents[K]>,
  ): Unsubscribe {
    return this.bus.on(event, listener);
  }

  /**
   * Whether the asset is loaded and can be read with {@link AssetLoader.get}.
   */
  has(name: string): boolean {
    return this.slots.get(name)?.ready === true;
  }

  /**
   * Loads an asset and takes a reference to it. Loading an asset that is already loaded or in
   * flight shares it. Pair every successful `load` with a {@link AssetLoader.release}.
   *
   * @throws {UnknownAssetError} if the name is not in the manifest.
   * @throws {AssetError} if loading fails after all retries.
   */
  async load<K extends AssetType = AssetType>(
    name: string,
    options: LoadOptions = {},
  ): Promise<AssetTypes[K]> {
    const definition = this.definitions.get(name);
    if (definition === undefined) throw new UnknownAssetError(name, 'it is not in the manifest');
    if (options.signal?.aborted === true) throw abortError();
    let slot = this.slots.get(name);
    if (slot === undefined) {
      slot = new Slot(name, definition);
      slot.promise = this.run(slot);
      this.slots.set(name, slot);
    }
    await this.wait(slot, options.signal);
    slot.refs += 1;
    return slot.value as AssetTypes[K];
  }

  /**
   * Loads several assets in parallel, up to the download limit. Resolves when all are loaded and
   * rejects with the first failure; the others keep loading, so release them with
   * {@link AssetLoader.release} if you give up.
   */
  async loadMany(names: readonly string[], options: LoadManyOptions = {}): Promise<void> {
    const progress = new Progress(names.length, options.onProgress);
    progress.report(undefined);
    const tasks: Promise<void>[] = [];
    for (const name of names) tasks.push(this.loadAndReport(name, options, progress));
    await Promise.all(tasks);
  }

  /**
   * Loads every asset of a bundle.
   *
   * @throws {UnknownAssetError} if the bundle is not defined.
   */
  async loadBundle(bundle: string, options: LoadManyOptions = {}): Promise<void> {
    const members = this.bundles.get(bundle);
    if (members === undefined) throw new UnknownAssetError(bundle, 'no such bundle');
    await this.loadMany(members, options);
  }

  /**
   * Reads a loaded asset. The type argument only narrows the TypeScript type, as in
   * `get<'image'>('hero')`.
   *
   * @throws {UnknownAssetError} if it has not been loaded.
   */
  get<K extends AssetType = AssetType>(name: string): AssetTypes[K] {
    const slot = this.slots.get(name);
    if (slot?.ready !== true) throw new UnknownAssetError(name, 'it is not loaded');
    return slot.value as AssetTypes[K];
  }

  /**
   * Gives back one reference taken by {@link AssetLoader.load}. The asset is disposed and
   * forgotten when the last reference goes.
   */
  release(name: string): void {
    const slot = this.slots.get(name);
    if (slot === undefined || slot.refs === 0) return;
    slot.refs -= 1;
    if (slot.refs === 0) this.forget(slot);
  }

  /**
   * Releases one reference of every member of a bundle.
   */
  releaseBundle(bundle: string): void {
    for (const name of this.bundles.get(bundle) ?? []) this.release(name);
  }

  /**
   * Number of references currently held on an asset.
   */
  referenceCount(name: string): number {
    return this.slots.get(name)?.refs ?? 0;
  }

  /**
   * Disposes everything and cancels downloads in flight.
   */
  dispose(): void {
    for (const slot of [...this.slots.values()]) {
      slot.controller.abort();
      this.forget(slot);
    }
    this.bus.clear();
  }

  private async loadAndReport(
    name: string,
    options: LoadManyOptions,
    progress: Progress,
  ): Promise<void> {
    await this.load(name, options);
    progress.finish(name);
  }

  private async run(slot: Slot): Promise<void> {
    try {
      const value = await this.limiter.run(this.produce, slot);
      if (this.isCancelled(slot)) {
        this.loaders.get(slot.definition.type)?.dispose?.(value);
        throw abortError();
      }
      slot.value = value;
      slot.ready = true;
    } catch (error) {
      if (this.slots.get(slot.name) === slot) this.slots.delete(slot.name);
      if (slot.controller.signal.aborted) throw abortError();
      const wrapped =
        error instanceof AssetError
          ? error
          : new AssetError(slot.name, slot.definition.url, String(error), { cause: error });
      this.bus.emit('failed', { name: slot.name, error: wrapped });
      throw wrapped;
    }
    this.bus.emit('loaded', { name: slot.name, type: slot.definition.type });
  }

  private readonly produce = async (slot: Slot): Promise<unknown> => {
    const loader = this.loaders.get(slot.definition.type);
    if (loader === undefined) {
      throw new AssetError(
        slot.name,
        slot.definition.url,
        `no loader for "${slot.definition.type}"`,
      );
    }
    const url = this.baseUrl + slot.definition.url;
    const context: LoaderContext = {
      url,
      signal: slot.controller.signal,
      fetch: (override) => this.fetchWithRetry(slot, override ?? url),
      load: (name) => this.loadDependency(name),
    };
    return loader.load(context);
  };

  private async loadDependency<K extends AssetType>(name: string): Promise<AssetTypes[K]> {
    return this.load<K>(name);
  }

  private async fetchWithRetry(slot: Slot, url: string): Promise<FetchResponse> {
    for (let attempt = 0; ; attempt++) {
      if (slot.controller.signal.aborted) throw abortError();
      try {
        const response = await this.fetcher(url, { signal: slot.controller.signal });
        if (response.ok) return response;
        if (response.status < 500) {
          throw new AssetError(slot.name, url, `HTTP ${response.status}`);
        }
        if (attempt >= this.retries) {
          throw new AssetError(
            slot.name,
            url,
            `HTTP ${response.status} after ${attempt + 1} attempts`,
          );
        }
      } catch (error) {
        if (this.isCancelled(slot)) throw abortError();
        if (error instanceof AssetError) throw error;
        if (attempt >= this.retries) {
          throw new AssetError(slot.name, url, `${String(error)} after ${attempt + 1} attempts`, {
            cause: error,
          });
        }
      }
      await this.sleep(this.retryDelayMs * 2 ** attempt);
    }
  }

  private isCancelled(slot: Slot): boolean {
    return slot.controller.signal.aborted;
  }

  private async wait(slot: Slot, signal: AbortSignal | undefined): Promise<void> {
    slot.waiters += 1;
    const watch = signal === undefined ? undefined : new AbortWatch(signal);
    try {
      if (watch === undefined) await slot.promise;
      else await Promise.race([slot.promise, watch.promise]);
    } finally {
      watch?.stop();
      slot.waiters -= 1;
      if (slot.waiters === 0 && !slot.ready && signal?.aborted === true) {
        slot.controller.abort();
        if (this.slots.get(slot.name) === slot) this.slots.delete(slot.name);
      }
    }
  }

  private forget(slot: Slot): void {
    if (this.slots.get(slot.name) === slot) this.slots.delete(slot.name);
    if (!slot.ready) return;
    slot.ready = false;
    this.loaders.get(slot.definition.type)?.dispose?.(slot.value);
    this.bus.emit('disposed', { name: slot.name });
  }
}
