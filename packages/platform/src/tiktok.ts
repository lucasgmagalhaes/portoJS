import type { Haptic, Platform, PlatformStorage, PlatformUser, Unsubscribe } from './platform.ts';

/**
 * The part of the tt global of TikTok mini games the adapter uses: callback-style storage, show
 * and hide events, and vibration. The real object satisfies it.
 */
export interface TikTokApi {
  getStorage(options: {
    key: string;
    success(result: { data: unknown }): void;
    fail(error: unknown): void;
  }): void;
  setStorage(options: {
    key: string;
    data: string;
    success(): void;
    fail(error: unknown): void;
  }): void;
  removeStorage(options: { key: string; success(): void; fail(error: unknown): void }): void;
  onShow(listener: () => void): void;
  offShow(listener: () => void): void;
  onHide(listener: () => void): void;
  offHide(listener: () => void): void;
  vibrateShort?(options?: Record<string, never>): void;
  vibrateLong?(options?: Record<string, never>): void;
}

/**
 * Options of {@link tiktokPlatform}.
 */
export interface TikTokPlatformOptions {
  /**
   * The signed-in player, if your game already did the platform login.
   */
  readonly user?: PlatformUser;
}

function failure(error: unknown): Error {
  const detail = error instanceof Error ? error.message : JSON.stringify(error);
  return new Error(`TikTok storage: ${detail}`);
}

function tiktokStorage(api: TikTokApi): PlatformStorage {
  return {
    get(key) {
      const executor = (resolve: (value: string | undefined) => void): void => {
        const success = (result: { data: unknown }): void => {
          resolve(typeof result.data === 'string' && result.data !== '' ? result.data : undefined);
        };
        const fail = (): void => {
          resolve(undefined);
        };
        api.getStorage({ key, success, fail });
      };
      return new Promise(executor);
    },
    set(key, value) {
      const executor = (resolve: () => void, reject: (error: Error) => void): void => {
        const fail = (error: unknown): void => {
          reject(failure(error));
        };
        api.setStorage({ key, data: value, success: resolve, fail });
      };
      return new Promise(executor);
    },
    remove(key) {
      const executor = (resolve: () => void): void => {
        api.removeStorage({ key, success: resolve, fail: resolve });
      };
      return new Promise(executor);
    },
  };
}

/**
 * The adapter for a TikTok mini game, on the tt API those games run with: storage, the show and
 * hide events, and vibration. A missing key reads as no save, because the API reports it as a
 * failure.
 *
 * It is built against that API documented shape and tested with a fake of it; it has not been
 * run inside TikTok.
 *
 * @param api the tt global.
 * @param options the player, when you have it.
 *
 * @example
 * const platform = tiktokPlatform(tt);
 */
export function tiktokPlatform(api: TikTokApi, options: TikTokPlatformOptions = {}): Platform {
  return {
    name: 'tiktok',
    storage: tiktokStorage(api),
    ready: () => undefined,
    onSuspend: (listener): Unsubscribe => {
      api.onHide(listener);
      return () => {
        api.offHide(listener);
      };
    },
    onResume: (listener): Unsubscribe => {
      api.onShow(listener);
      return () => {
        api.offShow(listener);
      };
    },
    vibrate: (kind: Haptic = 'light') => {
      try {
        if (kind === 'heavy' || kind === 'error') api.vibrateLong?.();
        else api.vibrateShort?.();
      } catch {
        return;
      }
    },
    user: (): PlatformUser | undefined => options.user,
  };
}
