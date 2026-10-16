/**
 * Platform adapters for PortoJS: Telegram Mini Apps, TikTok mini games and the plain web, with cloud storage, haptics, lifecycle and a session helper.
 *
 * @module @portojs/platform
 */

export { webPlatform } from './platform.ts';
export type {
  Haptic,
  PageLifecycleTarget,
  Platform,
  PlatformStorage,
  PlatformUser,
  Unsubscribe,
  VisibilityTarget,
  WebPlatformOptions,
  WebStorageLike,
} from './platform.ts';
export { telegramPlatform } from './telegram.ts';
export type { TelegramPlatformOptions, TelegramWebApp } from './telegram.ts';
export { tiktokPlatform } from './tiktok.ts';
export type { TikTokApi, TikTokPlatformOptions } from './tiktok.ts';
export { bindPlatform } from './session.ts';
export type { BackgroundPolicy, Session, SessionOptions } from './session.ts';
