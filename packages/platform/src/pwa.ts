/**
 * An icon of the installed app.
 */
export interface ManifestIcon {
  readonly src: string;
  /**
   * For example `192x192`.
   */
  readonly sizes: string;
  readonly type?: string;
  /**
   * `maskable` icons may be cropped to the OS shape. Default `any`.
   */
  readonly purpose?: 'any' | 'maskable' | 'monochrome';
}

/**
 * Options of {@link createManifest}.
 */
export interface ManifestOptions {
  readonly name: string;
  /**
   * Name under the icon. Default: `name`.
   */
  readonly shortName?: string;
  readonly description?: string;
  /**
   * Page opened from the icon. Default `./`.
   */
  readonly startUrl?: string;
  /**
   * Default `fullscreen`, the usual choice for games.
   */
  readonly display?: 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser';
  readonly orientation?: 'any' | 'landscape' | 'portrait';
  readonly backgroundColor?: string;
  readonly themeColor?: string;
  readonly icons: readonly ManifestIcon[];
}

/**
 * The web app manifest as a plain object; `JSON.stringify` it into `manifest.webmanifest`.
 */
export function createManifest(options: ManifestOptions): Record<string, unknown> {
  if (options.icons.length === 0) {
    throw new RangeError('createManifest: at least one icon is needed to be installable');
  }
  return {
    name: options.name,
    short_name: options.shortName ?? options.name,
    ...(options.description !== undefined ? { description: options.description } : {}),
    start_url: options.startUrl ?? './',
    scope: './',
    display: options.display ?? 'fullscreen',
    orientation: options.orientation ?? 'any',
    background_color: options.backgroundColor ?? '#000000',
    theme_color: options.themeColor ?? options.backgroundColor ?? '#000000',
    icons: options.icons.map(toManifestIcon),
  };
}

function toManifestIcon(icon: ManifestIcon): Record<string, string> {
  return {
    src: icon.src,
    sizes: icon.sizes,
    ...(icon.type !== undefined ? { type: icon.type } : {}),
    purpose: icon.purpose ?? 'any',
  };
}

/**
 * Options of {@link createServiceWorker}.
 */
export interface ServiceWorkerOptions {
  /**
   * Names the cache. Change it on every release (the build hash or version) so the old files are
   * dropped and the new ones fetched.
   */
  readonly version: string;
  /**
   * Files stored on install so the game starts offline: the page, scripts, styles and assets.
   * Paths are relative to where the worker is served.
   */
  readonly precache: readonly string[];
  /**
   * Page served when a navigation fails offline. Default `./index.html`.
   */
  readonly fallback?: string;
}

/**
 * Source code of a service worker that makes the game work offline.
 *
 * Precached files are served from the cache; other same-origin GET requests are fetched and
 * kept for next time; page navigations try the network first and fall back to the cached page.
 * The worker waits for the page to say `SKIP_WAITING` (see {@link registerServiceWorker}) so an
 * update never replaces files in the middle of a game.
 */
export function createServiceWorker(options: ServiceWorkerOptions): string {
  const cache = `portojs-${options.version}`;
  const fallback = options.fallback ?? './index.html';
  return `const CACHE = ${JSON.stringify(cache)};
const PRECACHE = ${JSON.stringify([...options.precache, fallback])};
const FALLBACK = ${JSON.stringify(fallback)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith('portojs-') && key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(FALLBACK)));
    return;
  }
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
`;
}

/**
 * Options of {@link createPwaFiles}.
 */
export interface PwaFilesOptions {
  readonly manifest: ManifestOptions;
  /**
   * Cache version: the build hash or the package version.
   */
  readonly version: string;
  /**
   * Every file of the build output, relative to it (what a bundler reports). The worker itself
   * and the manifest are left out of the list.
   */
  readonly files: readonly string[];
  readonly fallback?: string;
}

/**
 * Everything a build step must write next to the game to make it installable and offline:
 * `manifest.webmanifest` and `sw.js`. Link the manifest from the page with
 * `<link rel="manifest" href="manifest.webmanifest">`.
 */
export function createPwaFiles(options: PwaFilesOptions): Record<string, string> {
  const precache: string[] = [];
  for (const file of options.files) {
    if (file === 'sw.js' || file === 'manifest.webmanifest' || file.endsWith('.map')) continue;
    precache.push(`./${file}`);
  }
  return {
    'manifest.webmanifest': JSON.stringify(createManifest(options.manifest), null, 2),
    'sw.js': createServiceWorker({
      version: options.version,
      precache: ['./', ...precache],
      ...(options.fallback !== undefined ? { fallback: options.fallback } : {}),
    }),
  };
}
