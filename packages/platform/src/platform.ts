/**
 * Stops a listener.
 */
export type Unsubscribe = () => void;

/**
 * Strength of a haptic tap.
 */
export type Haptic = 'light' | 'medium' | 'heavy' | 'success' | 'error';

/**
 * Where a game keeps its save. Values are strings, so a save string fits as it is.
 */
export interface PlatformStorage {
  /**
   * Reads a value, or `undefined` when there is none.
   */
  get(key: string): Promise<string | undefined>;
  /**
   * Writes a value.
   */
  set(key: string, value: string): Promise<void>;
  /**
   * Deletes a value. Does nothing when it is missing.
   */
  remove(key: string): Promise<void>;
}

/**
 * The player, when the platform says who they are.
 */
export interface PlatformUser {
  /**
   * Stable id on that platform, as a string.
   */
  readonly id: string;
  /**
   * Display name, when known.
   */
  readonly name?: string;
}

/**
 * What a game needs from the place it runs in: saving, lifecycle and feedback. Every adapter
 * implements it, so game code does not change between the web, Telegram and TikTok.
 */
export interface Platform {
  /**
   * Which platform this is: `web`, `telegram` or `tiktok`.
   */
  readonly name: string;
  /**
   * Persistent storage, backed by the platform's own (cloud) storage.
   */
  readonly storage: PlatformStorage;
  /**
   * Tells the platform the game has loaded and can be shown.
   */
  ready(): void;
  /**
   * Runs `listener` when the game goes to the background or the player leaves.
   */
  onSuspend(listener: () => void): Unsubscribe;
  /**
   * Runs `listener` when the game comes back to the foreground.
   */
  onResume(listener: () => void): Unsubscribe;
  /**
   * A short haptic tap, where the device supports it. Never throws.
   */
  vibrate(kind?: Haptic): void;
  /**
   * The signed-in player, or `undefined`.
   */
  user(): PlatformUser | undefined;
}

/**
 * The part of `Storage` (`localStorage`) the web adapter uses.
 */
export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The part of `document` the web adapter uses to notice the page going to the background.
 */
export interface VisibilityTarget {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/**
 * Options of {@link webPlatform}.
 */
export interface WebPlatformOptions {
  /**
   * Where to save. Default `localStorage`.
   */
  readonly storage?: WebStorageLike;
  /**
   * Where visibility changes come from. Default `document`.
   */
  readonly document?: VisibilityTarget;
  /**
   * Haptics. Default `navigator.vibrate`.
   */
  readonly vibrate?: (pattern: number) => unknown;
}

const WEB_VIBRATION_MS: Readonly<Record<Haptic, number>> = {
  light: 10,
  medium: 20,
  heavy: 40,
  success: 15,
  error: 60,
};

function defaultVibrate(pattern: number): unknown {
  const nav = (globalThis as { navigator?: { vibrate?: (pattern: number) => unknown } }).navigator;
  return nav?.vibrate?.(pattern);
}

/**
 * The adapter for a plain web page: `localStorage`, the Page Visibility API and
 * `navigator.vibrate`. It is also what you want in tests, with fakes injected.
 *
 * @example
 * const platform = webPlatform();
 */
export function webPlatform(options: WebPlatformOptions = {}): Platform {
  const storage = options.storage ?? globalThis.localStorage;
  const page = options.document ?? globalThis.document;
  const buzz = options.vibrate ?? defaultVibrate;

  const subscribe = (visible: boolean, listener: () => void): Unsubscribe => {
    const onChange = (): void => {
      if ((page.visibilityState === 'visible') === visible) listener();
    };
    page.addEventListener('visibilitychange', onChange);
    return () => {
      page.removeEventListener('visibilitychange', onChange);
    };
  };

  return {
    name: 'web',
    storage: {
      get: (key) => Promise.resolve(storage.getItem(key) ?? undefined),
      set: (key, value) => {
        storage.setItem(key, value);
        return Promise.resolve();
      },
      remove: (key) => {
        storage.removeItem(key);
        return Promise.resolve();
      },
    },
    ready: () => undefined,
    onSuspend: (listener) => subscribe(false, listener),
    onResume: (listener) => subscribe(true, listener),
    vibrate: (kind = 'light') => {
      try {
        buzz(WEB_VIBRATION_MS[kind]);
      } catch {
        return;
      }
    },
    user: () => undefined,
  };
}
