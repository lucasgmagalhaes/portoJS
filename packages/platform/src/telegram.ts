import type { Haptic, Platform, PlatformStorage, PlatformUser, Unsubscribe } from './platform.ts';

/**
 * The part of the Telegram WebApp object (window.Telegram.WebApp) the adapter uses. The real
 * object satisfies it.
 */
export interface TelegramWebApp {
  ready(): void;
  expand?(): void;
  readonly initDataUnsafe?: {
    readonly user?: {
      readonly id: number;
      readonly first_name?: string;
      readonly username?: string;
    };
  };
  readonly CloudStorage: {
    getItem(key: string, callback: (error: string | null, value?: string) => void): void;
    setItem(
      key: string,
      value: string,
      callback?: (error: string | null, stored?: boolean) => void,
    ): void;
    removeItem(key: string, callback?: (error: string | null, removed?: boolean) => void): void;
  };
  readonly HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
  onEvent(type: 'activated' | 'deactivated', handler: () => void): void;
  offEvent(type: 'activated' | 'deactivated', handler: () => void): void;
}

/**
 * Options of {@link telegramPlatform}.
 */
export interface TelegramPlatformOptions {
  /**
   * Characters per cloud-storage item before a value is split. Telegram allows 4096. Default
   * 4000.
   */
  readonly chunkSize?: number;
}

const CHUNK_MARKER = '@@chunks:';

function failure(error: string): Error {
  return new Error(`Telegram CloudStorage: ${error}`);
}

function readItem(app: TelegramWebApp, key: string): Promise<string | undefined> {
  const executor = (
    resolve: (value: string | undefined) => void,
    reject: (error: Error) => void,
  ): void => {
    const done = (error: string | null, value?: string): void => {
      if (error !== null) reject(failure(error));
      else resolve(value === undefined || value === '' ? undefined : value);
    };
    app.CloudStorage.getItem(key, done);
  };
  return new Promise(executor);
}

function writeItem(app: TelegramWebApp, key: string, value: string): Promise<void> {
  const executor = (resolve: () => void, reject: (error: Error) => void): void => {
    const done = (error: string | null, stored?: boolean): void => {
      if (error !== null) reject(failure(error));
      else if (stored === false) reject(failure(`could not store ${key}`));
      else resolve();
    };
    app.CloudStorage.setItem(key, value, done);
  };
  return new Promise(executor);
}

function deleteItem(app: TelegramWebApp, key: string): Promise<void> {
  const executor = (resolve: () => void, reject: (error: Error) => void): void => {
    const done = (error: string | null): void => {
      if (error !== null) reject(failure(error));
      else resolve();
    };
    app.CloudStorage.removeItem(key, done);
  };
  return new Promise(executor);
}

function chunkKey(key: string, index: number): string {
  return `${key}_c${index}`;
}

function chunkCount(stored: string | undefined): number {
  if (stored === undefined || !stored.startsWith(CHUNK_MARKER)) return 0;
  const count = Number(stored.slice(CHUNK_MARKER.length));
  return Number.isInteger(count) && count > 0 ? count : 0;
}

function cloudStorage(app: TelegramWebApp, chunkSize: number): PlatformStorage {
  return {
    async get(key) {
      const stored = await readItem(app, key);
      const count = chunkCount(stored);
      if (count === 0) return stored;
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const part = await readItem(app, chunkKey(key, i));
        if (part === undefined) return undefined;
        parts.push(part);
      }
      return parts.join('');
    },
    async set(key, value) {
      const previous = chunkCount(await readItem(app, key));
      let used = 0;
      if (value.length <= chunkSize) {
        await writeItem(app, key, value);
      } else {
        for (let start = 0; start < value.length; start += chunkSize) {
          await writeItem(app, chunkKey(key, used), value.slice(start, start + chunkSize));
          used += 1;
        }
        await writeItem(app, key, `${CHUNK_MARKER}${used}`);
      }
      for (let i = used; i < previous; i++) await deleteItem(app, chunkKey(key, i));
    },
    async remove(key) {
      const previous = chunkCount(await readItem(app, key));
      for (let i = 0; i < previous; i++) await deleteItem(app, chunkKey(key, i));
      await deleteItem(app, key);
    },
  };
}

/**
 * The adapter for a Telegram Mini App. Saves go to the Telegram cloud storage, so they follow the
 * player across devices; values over the item limit are split into chunks transparently. The
 * game is suspended and resumed with the app deactivated and activated events.
 *
 * It is built against the documented Telegram WebApp API and tested with a fake of it; it has
 * not been run inside Telegram.
 *
 * @param app window.Telegram.WebApp.
 * @param options chunking.
 *
 * @example
 * const platform = telegramPlatform(window.Telegram.WebApp);
 * platform.ready();
 */
export function telegramPlatform(
  app: TelegramWebApp,
  options: TelegramPlatformOptions = {},
): Platform {
  const chunkSize = options.chunkSize ?? 4000;
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 4096) {
    throw new RangeError('telegramPlatform: chunkSize must be an integer from 1 to 4096');
  }

  const listen = (type: 'activated' | 'deactivated', listener: () => void): Unsubscribe => {
    app.onEvent(type, listener);
    return () => {
      app.offEvent(type, listener);
    };
  };

  return {
    name: 'telegram',
    storage: cloudStorage(app, chunkSize),
    ready: () => {
      app.ready();
      app.expand?.();
    },
    onSuspend: (listener) => listen('deactivated', listener),
    onResume: (listener) => listen('activated', listener),
    vibrate: (kind: Haptic = 'light') => {
      try {
        if (kind === 'success' || kind === 'error') app.HapticFeedback?.notificationOccurred(kind);
        else app.HapticFeedback?.impactOccurred(kind);
      } catch {
        return;
      }
    },
    user: (): PlatformUser | undefined => {
      const user = app.initDataUnsafe?.user;
      if (user === undefined) return undefined;
      const name = user.username ?? user.first_name;
      return name === undefined ? { id: String(user.id) } : { id: String(user.id), name };
    },
  };
}
