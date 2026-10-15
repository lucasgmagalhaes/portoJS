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
