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
export {
  BufferedAnalytics,
  MemoryAnalytics,
  consoleAnalytics,
  noAds,
  noAnalytics,
  noPurchases,
  noServices,
  typedAnalytics,
} from './services.ts';
export type {
  AdResult,
  Ads,
  Analytics,
  BufferedAnalyticsOptions,
  EventProps,
  Product,
  PurchaseResult,
  PurchaseStatus,
  Purchases,
  Services,
} from './services.ts';
export { AdGate } from './ad-gate.ts';
export type { AdGateOptions } from './ad-gate.ts';
export { MemoryPurchases, SimulatedAds } from './memory-store.ts';
export { createManifest, createPwaFiles, createServiceWorker } from './pwa.ts';
export type {
  ManifestIcon,
  ManifestOptions,
  PwaFilesOptions,
  ServiceWorkerOptions,
} from './pwa.ts';
export { InstallPrompt, registerServiceWorker } from './pwa-client.ts';
export type {
  InstallOutcome,
  InstallTarget,
  RegisterOptions,
  ServiceWorkerHost,
  ServiceWorkerRegistrationLike,
  WorkerLike,
} from './pwa-client.ts';
