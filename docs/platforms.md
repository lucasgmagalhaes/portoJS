# Platforms: Telegram, TikTok and the web

Mini-games live inside other apps, and each one has its own storage, lifecycle events and haptics. `@portojs/platform` puts them behind one `Platform` interface, so the game code does not change.

```
pnpm add @portojs/platform
```

| Adapter                 | Storage                        | Lifecycle                   | Haptics                        |
| ----------------------- | ------------------------------ | --------------------------- | ------------------------------ |
| `webPlatform()`         | `localStorage`                 | Page Visibility API         | `navigator.vibrate`            |
| `telegramPlatform(app)` | Telegram `CloudStorage`        | `activated` / `deactivated` | `HapticFeedback`               |
| `tiktokPlatform(tt)`    | `tt.getStorage` / `setStorage` | `tt.onShow` / `tt.onHide`   | `vibrateShort` / `vibrateLong` |

```ts
import { bindPlatform, telegramPlatform } from '@portojs/platform';

const platform = telegramPlatform(window.Telegram.WebApp);
const session = await bindPlatform(game, platform);
```

`bindPlatform` does the usual wiring in one call:

- loads the save from the platform storage (a damaged save is reported through `onError` and never blocks play),
- tells the platform the game is ready and starts the loop,
- autosaves every 10 seconds (`autosaveMs`) as a compressed save,
- when the app goes to the background it saves and stops the game, and when it comes back the time away is credited as offline progress before the loop starts again.

## The interface

Every adapter has `storage` (`get`, `set`, `remove`, all promises of strings), `ready()`, `onSuspend`, `onResume`, `vibrate(kind)` and `user()`. Use them directly for your own screens, for example `platform.vibrate('success')` after a purchase.

## Telegram

Telegram allows 4096 characters per cloud-storage item, so `telegramPlatform` splits larger saves into chunks and reassembles them, and cleans up chunks that are no longer needed. Compressed saves (the default in `bindPlatform`) usually fit in one or two items. `user()` returns the id and name from `initDataUnsafe`.

## TikTok

`tiktokPlatform(tt)` uses the callback-style `tt` mini-game API. A missing key reads as "no save", because the API reports it as a failure. Pass `{ user }` if your game did the platform login.

## What is verified

The adapters are written against the documented shape of each platform's API and tested in plain Node with fakes of it: Telegram and TikTok storage, chunking, errors, lifecycle events, haptics and the session flow. **They have not been run inside the real Telegram or TikTok clients.** Try them in a test bot or a development build of your mini-game before shipping, and report differences.

## Background behaviour

`bindPlatform` saves when the app goes to the background. What happens to game time is a choice, with the `background` option:

| `background` | While away                                     | On return                                  |
| ------------ | ---------------------------------------------- | ------------------------------------------ |
| `offline`    | The loop stops.                                | The time away is credited as offline time. |
| `pause`      | The loop stops and game time is frozen.        | Nothing is credited.                       |
| `run`        | The loop keeps running (browsers may throttle) | Dropped time is credited by the game.      |

`offline` is the default. On the web, `webPlatform` treats `visibilitychange`, `pagehide` and `pageshow` all as suspend and resume, so a page put in the back-forward cache is saved too. Audio contexts that browsers suspend are resumed by `AudioManager` when the game resumes, and `engine.unlockOnGesture(window)` handles the first user gesture.

## Analytics, ads and purchases

Game code should not know which ad network or store sits behind it. `@portojs/platform` defines three small interfaces and ships adapters that do nothing, print, or keep things in memory; real providers (CrazyGames, Poki, Telegram Stars, a payment SDK...) are a class that implements the same interface.

```ts
import { AdGate, BufferedAnalytics, MemoryPurchases, SimulatedAds, noServices } from '@portojs/platform';

const analytics = new BufferedAnalytics(); // collects events until the SDK has loaded
analytics.track('level_start', { level: 1 });
loadSdk().then((sdk) => analytics.attach(sdk.asAnalytics()));
```

- `Analytics`: `track(event, props)`, optional `identify(userId)` and `flush()`. `noAnalytics`, `consoleAnalytics(log)`, `MemoryAnalytics` (for tests) and `BufferedAnalytics` are included. `typedAnalytics<Events>(analytics)` makes the compiler check event names and properties, so funnels and retention events stay consistent.
- `Ads`: `isAvailable(kind)`, `showInterstitial()` and `showRewarded()`, which resolve to `completed`, `skipped`, `unavailable` or `error`. Reward the player only for `completed`. `SimulatedAds` answers with the results you queue.
- `Purchases`: `products()`, `purchase(id)` and `restore()`. A purchase resolves to `purchased`, `cancelled`, `already-owned`, `unavailable` or `error`, with the store receipt; verify it on a server before granting anything valuable. `MemoryPurchases` is a working fake store.
- `Services` bundles the three and `noServices` is the default when nothing is configured.

`AdGate` keeps interstitials polite: call `gate.breakpoint()` at natural pauses and it only shows an ad when the cooldown has passed and enough pauses happened since the last one. `gate.rewarded()` is never limited (the player asked for it) and tells you whether to give the reward. Both report the result to your analytics.

No provider SDKs are bundled; they differ per platform and change often, so they belong in your game or in a separate adapter package.
