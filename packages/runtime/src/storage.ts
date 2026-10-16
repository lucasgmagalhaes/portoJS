/**
 * Where saves are kept. All operations are async so a store can be `localStorage`, IndexedDB, a
 * file or a server behind one interface.
 */
export interface SaveStorage {
  /**
   * The stored text, or `null` when the key is not there.
   */
  get(key: string): Promise<string | null>;
  /**
   * Stores text under a key, replacing what was there.
   */
  set(key: string, value: string): Promise<void>;
  /**
   * Deletes a key. Does nothing when it is not there.
   */
  remove(key: string): Promise<void>;
}

/**
 * Keeps saves in memory. Useful for tests and for games that do not persist.
 */
export class MemorySaveStorage implements SaveStorage {
  private readonly values = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }

  remove(key: string): Promise<void> {
    this.values.delete(key);
    return Promise.resolve();
  }

  /**
   * The keys currently stored.
   */
  keys(): string[] {
    return [...this.values.keys()];
  }
}

/**
 * The part of the Web Storage API that {@link WebSaveStorage} needs.
 */
export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Keeps saves in `localStorage` (or `sessionStorage`, or anything shaped like them). Writes that
 * fail, for example because the quota is full, reject.
 *
 * @example
 * const storage = new WebSaveStorage(localStorage);
 */
export class WebSaveStorage implements SaveStorage {
  constructor(private readonly store: WebStorageLike) {}

  get(key: string): Promise<string | null> {
    try {
      return Promise.resolve(this.store.getItem(key));
    } catch (error) {
      return fail(error);
    }
  }

  set(key: string, value: string): Promise<void> {
    try {
      this.store.setItem(key, value);
      return Promise.resolve();
    } catch (error) {
      return fail(error);
    }
  }

  remove(key: string): Promise<void> {
    try {
      this.store.removeItem(key);
      return Promise.resolve();
    } catch (error) {
      return fail(error);
    }
  }
}

function fail(error: unknown): Promise<never> {
  return Promise.reject(
    error instanceof Error ? error : new Error(String(error), { cause: error }),
  );
}

/**
 * Options of {@link IndexedDbSaveStorage}.
 */
export interface IndexedDbSaveStorageOptions {
  /**
   * Database name. Default `portojs`.
   */
  readonly database?: string;
  /**
   * Object store name. Default `saves`.
   */
  readonly store?: string;
  /**
   * Replaces `indexedDB`, for tests.
   */
  readonly factory?: IDBFactory;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise(wait(request));
}

function wait<T>(
  request: IDBRequest<T>,
): (resolve: (value: T) => void, reject: (e: unknown) => void) => void {
  return (resolve, reject) => {
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => reject(request.error);
  };
}

/**
 * Keeps saves in IndexedDB, which holds far more than `localStorage` and does not block the
 * page while it writes.
 *
 * @example
 * const storage = new IndexedDbSaveStorage({ database: 'my-game' });
 */
export class IndexedDbSaveStorage implements SaveStorage {
  private database: Promise<IDBDatabase> | undefined;
  private readonly name: string;
  private readonly storeName: string;
  private readonly factory: IDBFactory;

  constructor(options: IndexedDbSaveStorageOptions = {}) {
    this.name = options.database ?? 'portojs';
    this.storeName = options.store ?? 'saves';
    this.factory = options.factory ?? indexedDB;
  }

  async get(key: string): Promise<string | null> {
    const store = await this.objectStore('readonly');
    const value: unknown = await requestToPromise(store.get(key));
    return typeof value === 'string' ? value : null;
  }

  async set(key: string, value: string): Promise<void> {
    const store = await this.objectStore('readwrite');
    await requestToPromise(store.put(value, key));
  }

  async remove(key: string): Promise<void> {
    const store = await this.objectStore('readwrite');
    await requestToPromise(store.delete(key));
  }

  /**
   * Closes the connection. A later call opens it again.
   */
  async close(): Promise<void> {
    const database = this.database;
    this.database = undefined;
    (await database)?.close();
  }

  private async objectStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const database = await this.open();
    return database.transaction(this.storeName, mode).objectStore(this.storeName);
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= requestToPromise(this.openRequest());
    return this.database;
  }

  private openRequest(): IDBOpenDBRequest {
    const request = this.factory.open(this.name, 1);
    request.onupgradeneeded = (): void => {
      if (!request.result.objectStoreNames.contains(this.storeName)) {
        request.result.createObjectStore(this.storeName);
      }
    };
    return request;
  }
}
