import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  InstallPrompt,
  createManifest,
  createPwaFiles,
  createServiceWorker,
  registerServiceWorker,
} from '../src/index.ts';
import type { ServiceWorkerHost, WorkerLike } from '../src/index.ts';

describe('createManifest', () => {
  it('fills the defaults a game wants', () => {
    const manifest = createManifest({
      name: 'My Game',
      icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }],
    });
    expect(manifest).toMatchObject({
      name: 'My Game',
      short_name: 'My Game',
      start_url: './',
      display: 'fullscreen',
      background_color: '#000000',
      theme_color: '#000000',
      icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }],
    });
    expect(manifest).not.toHaveProperty('description');
  });

  it('takes the options and refuses to be uninstallable', () => {
    const manifest = createManifest({
      name: 'A',
      shortName: 'a',
      description: 'd',
      display: 'standalone',
      orientation: 'landscape',
      backgroundColor: '#112233',
      themeColor: '#445566',
      icons: [{ src: 'm.png', sizes: '512x512', purpose: 'maskable' }],
    });
    expect(manifest).toMatchObject({ short_name: 'a', description: 'd', theme_color: '#445566' });
    expect(() => createManifest({ name: 'A', icons: [] })).toThrow(RangeError);
  });
});

describe('createPwaFiles', () => {
  it('writes a manifest and a worker that precaches the build, without maps and itself', () => {
    const files = createPwaFiles({
      manifest: { name: 'G', icons: [{ src: 'i.png', sizes: '192x192' }] },
      version: 'abc',
      files: ['index.html', 'assets/app.js', 'assets/app.js.map', 'sw.js', 'manifest.webmanifest'],
    });
    expect(Object.keys(files).sort()).toEqual(['manifest.webmanifest', 'sw.js']);
    expect(JSON.parse(files['manifest.webmanifest'] ?? '{}')).toMatchObject({ name: 'G' });
    const worker = files['sw.js'] ?? '';
    expect(worker).toContain('"portojs-abc"');
    expect(worker).toContain('"./assets/app.js"');
    expect(worker).not.toContain('app.js.map');
    expect(worker).not.toContain('"./sw.js"');
  });
});

type Listener = (event: unknown) => void;

function absolute(url: string): string {
  return new URL(url, 'https://game.test/').href;
}

function runWorker(source: string, fetchImpl: (url: string) => Promise<{ ok: boolean; clone(): unknown }>) {
  const listeners = new Map<string, Listener>();
  const stores = new Map<string, Map<string, unknown>>([['portojs-old', new Map()], ['other', new Map()]]);
  const state = { skipped: false, claimed: false };
  const caches = {
    open: (name: string) => {
      const store = stores.get(name) ?? new Map<string, unknown>();
      stores.set(name, store);
      return Promise.resolve({
        addAll: (urls: string[]) => {
          for (const url of urls) store.set(absolute(url), `cached:${absolute(url)}`);
          return Promise.resolve();
        },
        put: (request: { url: string }, value: unknown) => {
          store.set(absolute(request.url), value);
          return Promise.resolve();
        },
      });
    },
    keys: () => Promise.resolve([...stores.keys()]),
    delete: (name: string) => Promise.resolve(stores.delete(name)),
    match: (request: string | { url: string }) => {
      const key = absolute(typeof request === 'string' ? request : request.url);
      for (const store of stores.values()) if (store.has(key)) return Promise.resolve(store.get(key));
      return Promise.resolve(undefined);
    },
  };
  const self = {
    location: { origin: 'https://game.test' },
    clients: { claim: () => { state.claimed = true; return Promise.resolve(); } },
    skipWaiting: () => { state.skipped = true; },
    addEventListener: (type: string, listener: Listener) => void listeners.set(type, listener),
  };
  runInNewContext(source, { self, caches, fetch: (request: string | { url: string }) => fetchImpl(typeof request === 'string' ? request : request.url), URL, Promise });
  const waited: Promise<unknown>[] = [];
  const fire = (type: string, event: Record<string, unknown>): { response?: Promise<unknown> } => {
    const result: { response?: Promise<unknown> } = {};
    listeners.get(type)?.({
      ...event,
      waitUntil: (p: Promise<unknown>) => void waited.push(p),
      respondWith: (p: Promise<unknown>) => { result.response = p; },
    });
    return result;
  };
  return { fire, waited, stores, state };
}

describe('createServiceWorker', () => {
  const source = createServiceWorker({ version: 'v2', precache: ['./', './game.js'] });
  const network = (url: string) =>
    Promise.resolve({ ok: !url.includes('missing'), clone: () => `net:${url}` });

  it('is valid JavaScript that precaches on install and drops old caches on activate', async () => {
    const worker = runWorker(source, network);
    worker.fire('install', {});
    await Promise.all(worker.waited);
    expect([...(worker.stores.get('portojs-v2')?.keys() ?? [])]).toEqual([
      'https://game.test/',
      'https://game.test/game.js',
      'https://game.test/index.html',
    ]);
    worker.fire('activate', {});
    await Promise.all(worker.waited);
    expect([...worker.stores.keys()].sort()).toEqual(['other', 'portojs-v2']);
    expect(worker.state.claimed).toBe(true);
  });

  it('waits for SKIP_WAITING', () => {
    const worker = runWorker(source, network);
    worker.fire('message', { data: 'nope' });
    expect(worker.state.skipped).toBe(false);
    worker.fire('message', { data: 'SKIP_WAITING' });
    expect(worker.state.skipped).toBe(true);
  });

  it('serves cached files, fetches and keeps new ones, and ignores other origins and methods', async () => {
    const worker = runWorker(source, network);
    worker.fire('install', {});
    await Promise.all(worker.waited);
    const get = (url: string, extra: Record<string, unknown> = {}) =>
      worker.fire('fetch', { request: { url, method: 'GET', mode: 'cors', ...extra } });
    expect(await get('https://game.test/game.js').response).toBe('cached:https://game.test/game.js');
    const fresh = get('https://game.test/new.png');
    expect(await (fresh.response as Promise<{ ok: boolean }>)).toMatchObject({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(worker.stores.get('portojs-v2')?.get('https://game.test/new.png')).toBe('net:https://game.test/new.png');
    expect(get('https://cdn.test/x.js').response).toBeUndefined();
    expect(get('https://game.test/x', { method: 'POST' }).response).toBeUndefined();
  });

  it('falls back to the cached page when a navigation fails offline', async () => {
    const worker = runWorker(source, () => Promise.reject(new Error('offline')));
    worker.fire('install', {});
    await Promise.all(worker.waited);
    const nav = worker.fire('fetch', { request: { url: 'https://game.test/play', method: 'GET', mode: 'navigate' } });
    expect(await nav.response).toBe('cached:https://game.test/index.html');
  });
});

class FakeWorker implements WorkerLike {
  state = 'installing';
  messages: unknown[] = [];
  private listener: (() => void) | undefined;
  postMessage(message: unknown): void {
    this.messages.push(message);
  }
  addEventListener(_type: 'statechange', listener: () => void): void {
    this.listener = listener;
  }
  become(state: string): void {
    this.state = state;
    this.listener?.();
  }
}

function fakeHost(controller: unknown) {
  const registration = {
    waiting: null as WorkerLike | null,
    installing: null as WorkerLike | null,
    updateFound: undefined as (() => void) | undefined,
    addEventListener(_type: 'updatefound', listener: () => void) {
      registration.updateFound = listener;
    },
  };
  let controllerChange: (() => void) | undefined;
  const host: ServiceWorkerHost = {
    controller,
    register: () => Promise.resolve(registration),
    addEventListener: (_type, listener) => void (controllerChange = listener),
  };
  return { host, registration, changeController: () => controllerChange?.() };
}

describe('registerServiceWorker', () => {
  it('does nothing without a service worker host and reports failures', async () => {
    expect(await registerServiceWorker('sw.js', undefined)).toBe(false);
    const errors: unknown[] = [];
    const host: ServiceWorkerHost = {
      controller: null,
      register: () => Promise.reject(new Error('denied')),
      addEventListener: () => undefined,
    };
    expect(await registerServiceWorker('sw.js', host, { onError: (e) => void errors.push(e) })).toBe(false);
    expect(errors).toHaveLength(1);
  });

  it('says the game is offline-ready after the first install', async () => {
    const { host, registration } = fakeHost(null);
    let ready = 0;
    await registerServiceWorker('sw.js', host, { onOfflineReady: () => void ready++ });
    const worker = new FakeWorker();
    registration.installing = worker;
    registration.updateFound?.();
    worker.become('installed');
    expect(ready).toBe(1);
  });

  it('offers an update and reloads after it is applied', async () => {
    const { host, registration, changeController } = fakeHost({});
    let apply: (() => void) | undefined;
    let reloads = 0;
    await registerServiceWorker('sw.js', host, {
      onUpdateReady: (fn) => void (apply = fn),
      reload: () => void reloads++,
    });
    const worker = new FakeWorker();
    registration.installing = worker;
    registration.updateFound?.();
    worker.become('installing');
    expect(apply).toBeUndefined();
    worker.become('installed');
    changeController();
    expect(reloads).toBe(0);
    apply?.();
    expect(worker.messages).toEqual(['SKIP_WAITING']);
    changeController();
    expect(reloads).toBe(1);
  });

  it('announces an update that was already waiting', async () => {
    const { host, registration } = fakeHost({});
    registration.waiting = new FakeWorker();
    let offered = false;
    await registerServiceWorker('sw.js', host, { onUpdateReady: () => void (offered = true) });
    expect(offered).toBe(true);
  });
});

class FakeWindow {
  listeners = new Map<string, (event: never) => void>();
  addEventListener(type: string, listener: (event: never) => void): void {
    this.listeners.set(type, listener);
  }
  emit(type: string, event: unknown = {}): void {
    (this.listeners.get(type) as (event: unknown) => void)(event);
  }
}

describe('InstallPrompt', () => {
  function installEvent(outcome: string) {
    return {
      prevented: false,
      prompted: false,
      preventDefault() { this.prevented = true; },
      prompt() { this.prompted = true; return Promise.resolve(); },
      userChoice: Promise.resolve({ outcome }),
    };
  }

  it('keeps the event until the player taps, then reports the choice', async () => {
    const win = new FakeWindow();
    const prompt = new InstallPrompt(win);
    let changes = 0;
    prompt.onChange = () => void changes++;
    expect(prompt.available).toBe(false);
    expect(await prompt.prompt()).toBe('unavailable');
    const event = installEvent('accepted');
    win.emit('beforeinstallprompt', event);
    expect(event.prevented).toBe(true);
    expect(prompt.available).toBe(true);
    expect(await prompt.prompt()).toBe('accepted');
    expect(event.prompted).toBe(true);
    expect(prompt.available).toBe(false);
    expect(changes).toBe(2);
  });

  it('reports dismissal and the installed event', async () => {
    const win = new FakeWindow();
    const prompt = new InstallPrompt(win);
    win.emit('beforeinstallprompt', installEvent('dismissed'));
    expect(await prompt.prompt()).toBe('dismissed');
    win.emit('beforeinstallprompt', installEvent('accepted'));
    win.emit('appinstalled');
    expect(prompt.installed).toBe(true);
    expect(prompt.available).toBe(false);
    expect(await prompt.prompt()).toBe('unavailable');
  });
});
