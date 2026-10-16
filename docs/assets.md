# Assets

`@portojs/assets` loads the files of a game by name: a manifest, bundles with progress, retry with backoff, a download limit, reference counting and cancellation.

```
pnpm add @portojs/assets
```

## A manifest and a bundle

```ts
import { AssetLoader } from '@portojs/assets';

const assets = new AssetLoader({
  baseUrl: '/assets/',
  manifest: {
    assets: {
      hero: { type: 'image', url: 'hero.png' },
      level1: { type: 'json', url: 'levels/1.json' },
      intro: { type: 'text', url: 'intro.txt' },
    },
    bundles: { boot: ['hero', 'intro'], level1: ['level1'] },
  },
});

await assets.loadBundle('boot', {
  onProgress: ({ loaded, total, ratio }) => bar.set(ratio),
});

const hero = assets.get<'image'>('hero'); // an ImageBitmap
```

Built-in types: `json`, `text`, `binary` (an `ArrayBuffer`) and `image` (decoded with `createImageBitmap`).

## References

Every successful `load` takes a reference, and `release` gives one back. When the last one goes, the asset is disposed (an image bitmap is closed) and forgotten, so a level can free its assets when it ends:

```ts
await assets.loadBundle('level1');
// ... play ...
assets.releaseBundle('level1');
```

Loading something that is already loaded, or in flight, shares it: one download, many references.

## Retry and limits

A network error or a 5xx status is retried (`retries`, default 2) after `retryDelayMs`, doubled each time. A 4xx status fails at once. At most `concurrency` downloads (default 6) run together.

## Cancelling

Pass an `AbortSignal` in the options of `load`, `loadMany` or `loadBundle`. The call rejects with an `AbortError`, and the download is stopped once nobody is waiting for it.

## Your own types

Register a loader and teach TypeScript the type:

```ts
declare module '@portojs/assets' {
  interface AssetTypes {
    atlas: Atlas;
  }
}

assets.register('atlas', {
  async load(context) {
    const data = await (await context.fetch()).json();
    const image = await context.load<'image'>(data.image); // another asset of the manifest
    return buildAtlas(data, image);
  },
});
```

`context.fetch()` has the retry policy and cancellation of the load. A loader can also define `dispose(asset)`.

## A loading screen

`Preloader` is a component that loads bundles when the game starts and reports progress across all of them:

```ts
const preloader = game.createObject('Preloader').addComponent(Preloader, {
  loader: assets,
  bundles: ['boot', 'level1'],
});
preloader.progressed.addListener(({ ratio }) => bar.set(ratio));
preloader.completed.addListener(() => startMenu());
preloader.failed.addListener((error) => showRetry(error));
```
