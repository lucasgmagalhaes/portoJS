import type { Game } from '@portojs/runtime';
import type { Platform } from './platform.ts';

/**
 * What the game does while the app is in the background:
 *
 * - `offline`: stop the loop and, on return, credit the time away as offline progress (default).
 * - `pause`: stop the loop and freeze game time; the time away is not credited.
 * - `run`: keep the loop running (the browser may throttle it, and dropped time is credited as
 *   offline progress by the game itself).
 *
 * In every case the game saves when it goes to the background.
 */
export type BackgroundPolicy = 'offline' | 'pause' | 'run';

/**
 * Options of {@link bindPlatform}.
 */
export interface SessionOptions {
  /**
   * Storage key of the save. Default `portojs-save`.
   */
  readonly key?: string;
  /**
   * Autosave every this many milliseconds while the game runs. Default 10000; `0` turns the timer
   * off (the game still saves when it is suspended).
   */
  readonly autosaveMs?: number;
  /**
   * Store compressed saves, which are several times smaller. Default `true`.
   */
  readonly compress?: boolean;
  /**
   * What happens in the background. Default `offline`.
   */
  readonly background?: BackgroundPolicy;
  /**
   * Called when a save cannot be read or written. The game carries on, so a damaged save never
   * blocks play.
   */
  readonly onError?: (error: unknown) => void;
}

/**
 * A game bound to a platform.
 */
export interface Session {
  /**
   * Saves now.
   */
  save(): Promise<void>;
  /**
   * Stops autosaving and listening. The game keeps its state; call `game.dispose()` to end it.
   */
  dispose(): void;
}

/**
 * Connects a game to its platform: loads the save from the platform storage, tells the platform
 * the game is ready, starts the loop, autosaves, and handles the app going to the background. On
 * suspend the game saves and stops; on resume the time away is credited as offline progress and
 * the loop starts again.
 *
 * @example
 * const platform = telegramPlatform(window.Telegram.WebApp);
 * const session = await bindPlatform(game, platform);
 */
export async function bindPlatform(
  game: Game,
  platform: Platform,
  options: SessionOptions = {},
): Promise<Session> {
  const key = options.key ?? 'portojs-save';
  const autosaveMs = options.autosaveMs ?? 10_000;
  const compress = options.compress ?? true;
  const background = options.background ?? 'offline';
  const report = (error: unknown): void => {
    options.onError?.(error);
  };

  const save = async (): Promise<void> => {
    try {
      await platform.storage.set(key, game.exportSave({ compress }));
    } catch (error) {
      report(error);
    }
  };

  try {
    const stored = await platform.storage.get(key);
    if (stored !== undefined) game.importSave(stored);
  } catch (error) {
    report(error);
  }

  let suspendedAt: number | undefined;
  const suspend = (): void => {
    if (suspendedAt !== undefined) return;
    suspendedAt = game.now();
    if (background !== 'run') game.stop();
    void save();
  };
  const resume = (): void => {
    if (suspendedAt === undefined) return;
    const away = game.now() - suspendedAt;
    suspendedAt = undefined;
    if (background === 'offline' && away > 0) game.simulateOffline(away);
    game.start();
  };
  const autosave = (): void => {
    void save();
  };

  const stopSuspend = platform.onSuspend(suspend);
  const stopResume = platform.onResume(resume);
  const timer = autosaveMs > 0 ? setInterval(autosave, autosaveMs) : undefined;
  platform.ready();
  game.start();

  return {
    save,
    dispose(): void {
      if (timer !== undefined) clearInterval(timer);
      stopSuspend();
      stopResume();
    },
  };
}
