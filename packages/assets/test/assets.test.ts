import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '@portojs/runtime';
import { ManualClock } from '@portojs/core';
import {
  AssetError,
  AssetLoader,
  Preloader,
  UnknownAssetError,
  imageLoader,
} from '../src/index.ts';
import type { AssetFetcher, AssetManifest } from '../src/index.ts';

type Reply = { status?: number; body?: string; fail?: boolean };

class FakeServer {
  readonly calls: string[] = [];
  readonly signals: (AbortSignal | undefined)[] = [];
  active = 0;
  maxActive = 0;
  gate: Promise<void> | undefined;
  private readonly replies = new Map<string, Reply[]>();

  reply(url: string, ...replies: Reply[]): this {
    this.replies.set(url, replies);
    return this;
  }

  readonly fetch: AssetFetcher = async (url, init) => {
    this.calls.push(url);
    this.signals.push(init?.signal);
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      if (this.gate !== undefined) await this.gate;
      const queue = this.replies.get(url) ?? [{ status: 404 }];
      const reply = queue.length > 1 ? (queue.shift() as Reply) : (queue[0] as Reply);
      if (reply.fail === true) throw new TypeError('network down');
      return new Response(reply.body ?? '', { status: reply.status ?? 200 });
    } finally {
      this.active -= 1;
    }
  };
}

const manifest: AssetManifest = {
  assets: {
    config: { type: 'json', url: 'config.json' },
    intro: { type: 'text', url: 'intro.txt' },
    blob: { type: 'binary', url: 'data.bin' },
  },
  bundles: { boot: ['config', 'intro'], all: ['config', 'intro', 'blob'] },
};

function setup(overrides: Partial<ConstructorParameters<typeof AssetLoader>[0]> = {}): {
  server: FakeServer;
  assets: AssetLoader;
  sleeps: number[];
} {
  const server = new FakeServer()
    .reply('/a/config.json', { body: '{"level":3}' })
    .reply('/a/intro.txt', { body: 'hello' })
    .reply('/a/data.bin', { body: 'abc' });
  const sleeps: number[] = [];
  const assets = new AssetLoader({
    baseUrl: '/a/',
    fetch: server.fetch,
    manifest,
    retryDelayMs: 10,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    ...overrides,
  });
  return { server, assets, sleeps };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loading', () => {
  it('loads json, text and binary assets under the base URL', async () => {
    const { assets, server } = setup();
    expect(await assets.load('config')).toEqual({ level: 3 });
    expect(await assets.load<'text'>('intro')).toBe('hello');
    const bytes = await assets.load<'binary'>('blob');
    expect(new TextDecoder().decode(bytes)).toBe('abc');
    expect(server.calls).toEqual(['/a/config.json', '/a/intro.txt', '/a/data.bin']);
    expect(assets.has('config')).toBe(true);
    expect(assets.get('config')).toEqual({ level: 3 });
    expect(assets.has('nope')).toBe(false);
  });

  it('shares one download between concurrent and repeated loads', async () => {
    const { assets, server } = setup();
    const [a, b] = await Promise.all([assets.load('config'), assets.load('config')]);
    expect(a).toBe(b);
    await assets.load('config');
    expect(server.calls).toEqual(['/a/config.json']);
    expect(assets.referenceCount('config')).toBe(3);
  });

  it('rejects unknown assets and bundles, and reads before loading', async () => {
    const { assets } = setup();
    await expect(assets.load('missing')).rejects.toBeInstanceOf(UnknownAssetError);
    await expect(assets.loadBundle('missing')).rejects.toBeInstanceOf(UnknownAssetError);
    expect(() => assets.get('config')).toThrow(UnknownAssetError);
    expect(() => assets.define({ assets: {}, bundles: { b: ['ghost'] } })).toThrow(
      UnknownAssetError,
    );
  });

  it('validates its options', () => {
    expect(() => new AssetLoader({ retries: -1 })).toThrow(RangeError);
    expect(() => new AssetLoader({ concurrency: 0 })).toThrow(RangeError);
  });

  it('reports a type without a loader', async () => {
    const { assets } = setup();
    assets.define({ assets: { odd: { type: 'weird' as never, url: 'x' } } });
    await expect(assets.load('odd')).rejects.toBeInstanceOf(AssetError);
  });
});

describe('retry', () => {
  it('retries server errors and network errors with doubling delays', async () => {
    const { assets, server, sleeps } = setup();
    server.reply('/a/config.json', { status: 503 }, { fail: true }, { body: '{"ok":true}' });
    expect(await assets.load('config')).toEqual({ ok: true });
    expect(server.calls).toHaveLength(3);
    expect(sleeps).toEqual([10, 20]);
  });

  it('does not retry a client error', async () => {
    const { assets, server, sleeps } = setup();
    server.reply('/a/config.json', { status: 404 });
    await expect(assets.load('config')).rejects.toThrow(/HTTP 404/);
    expect(server.calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('gives up after the retries and lets the asset be loaded again later', async () => {
    const { assets, server } = setup({ retries: 1 });
    const failures: string[] = [];
    assets.on('failed', ({ name }) => failures.push(name));
    server.reply('/a/config.json', { status: 500 });
    await expect(assets.load('config')).rejects.toThrow(/after 2 attempts/);
    expect(failures).toEqual(['config']);
    expect(assets.has('config')).toBe(false);
    server.reply('/a/config.json', { body: '{"back":1}' });
    expect(await assets.load('config')).toEqual({ back: 1 });
  });

  it('wraps a persistent network error with its cause', async () => {
    const { assets, server } = setup({ retries: 0 });
    server.reply('/a/config.json', { fail: true });
    const error = await assets.load('config').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AssetError);
    expect((error as AssetError).cause).toBeInstanceOf(TypeError);
  });
});

describe('bundles and progress', () => {
  it('loads a bundle and reports progress', async () => {
    const { assets } = setup();
    const seen: number[] = [];
    const names: (string | undefined)[] = [];
    await assets.loadBundle('all', {
      onProgress: ({ ratio, name }) => {
        seen.push(ratio);
        names.push(name);
      },
    });
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(1);
    expect(seen).toHaveLength(4);
    expect(names[0]).toBeUndefined();
    expect(new Set(names.slice(1))).toEqual(new Set(['config', 'intro', 'blob']));
  });

  it('reports a full ratio for an empty load', async () => {
    const { assets } = setup();
    let ratio = -1;
    await assets.loadMany([], { onProgress: (p) => (ratio = p.ratio) });
    expect(ratio).toBe(1);
  });

  it('limits parallel downloads', async () => {
    const { assets, server } = setup({ concurrency: 2 });
    let open: () => void = () => undefined;
    server.gate = new Promise<void>((resolve) => (open = resolve));
    const loading = assets.loadBundle('all');
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(server.maxActive).toBe(2);
    open();
    await loading;
    expect(server.maxActive).toBe(2);
    expect(server.calls).toHaveLength(3);
  });
});

describe('references and disposal', () => {
  it('disposes an asset when its last reference is released', async () => {
    const { assets } = setup();
    const disposed: string[] = [];
    const events: string[] = [];
    assets.on('disposed', ({ name }) => events.push(name));
    assets.register('text', {
      load: async (context) => (await context.fetch()).text(),
      dispose: (value) => disposed.push(value),
    });
    await assets.load('intro');
    await assets.load('intro');
    assets.release('intro');
    expect(assets.has('intro')).toBe(true);
    assets.release('intro');
    expect(assets.has('intro')).toBe(false);
    expect(disposed).toEqual(['hello']);
    expect(events).toEqual(['intro']);
    assets.release('intro');
    assets.release('never-loaded');
  });

  it('releases a whole bundle', async () => {
    const { assets } = setup();
    await assets.loadBundle('boot');
    assets.releaseBundle('boot');
    expect(assets.has('config')).toBe(false);
    expect(assets.has('intro')).toBe(false);
  });

  it('reloads after being released', async () => {
    const { assets, server } = setup();
    await assets.load('config');
    assets.release('config');
    await assets.load('config');
    expect(server.calls).toHaveLength(2);
  });

  it('disposes everything and cancels downloads on dispose', async () => {
    const { assets, server } = setup();
    await assets.load('intro');
    let open: () => void = () => undefined;
    server.gate = new Promise<void>((resolve) => (open = resolve));
    const pending = assets.load('config').catch((e: unknown) => e);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assets.dispose();
    open();
    expect(await pending).toBeInstanceOf(Error);
    expect(assets.has('intro')).toBe(false);
  });
});

describe('cancellation', () => {
  it('rejects at once with an already aborted signal', async () => {
    const { assets, server } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(assets.load('config', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(server.calls).toEqual([]);
  });

  it('aborts the download when its only waiter gives up', async () => {
    const { assets, server } = setup();
    let open: () => void = () => undefined;
    server.gate = new Promise<void>((resolve) => (open = resolve));
    const controller = new AbortController();
    const loading = assets.load('config', { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    expect(server.signals[0]?.aborted).toBe(true);
    open();
    server.gate = undefined;
    expect(await assets.load('config')).toEqual({ level: 3 });
  });

  it('keeps downloading while another caller still waits', async () => {
    const { assets, server } = setup();
    let open: () => void = () => undefined;
    server.gate = new Promise<void>((resolve) => (open = resolve));
    const controller = new AbortController();
    const impatient = assets.load('config', { signal: controller.signal }).catch((e: unknown) => e);
    const patient = assets.load('config');
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    expect(await impatient).toMatchObject({ name: 'AbortError' });
    open();
    expect(await patient).toEqual({ level: 3 });
    expect(server.calls).toHaveLength(1);
  });
});

describe('custom loaders', () => {
  it('lets a loader load another asset and use the retrying fetch', async () => {
    const { assets, server } = setup();
    server.reply('/a/sheet.json', { body: '{"image":"intro"}' });
    assets.define({ assets: { sheet: { type: 'json', url: 'sheet.json' } } });
    assets.register('json', {
      async load(context) {
        const data = (await (await context.fetch()).json()) as { image?: string };
        const image = data.image === undefined ? undefined : await context.load<'text'>(data.image);
        return { data, image };
      },
    });
    expect(await assets.load('sheet')).toEqual({ data: { image: 'intro' }, image: 'hello' });
  });
});

describe('image loader', () => {
  it('decodes with createImageBitmap and closes the bitmap on release', async () => {
    const close = vi.fn();
    const bitmap = { close } as unknown as ImageBitmap;
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const { assets, server } = setup();
    server.reply('/a/hero.png', { body: 'png' });
    assets.define({ assets: { hero: { type: 'image', url: 'hero.png' } } });
    expect(await assets.load<'image'>('hero')).toBe(bitmap);
    assets.release('hero');
    expect(close).toHaveBeenCalledOnce();
  });

  it('explains when createImageBitmap is missing', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const { assets, server } = setup();
    server.reply('/a/hero.png', { body: 'png' });
    assets.define({ assets: { hero: { type: 'image', url: 'hero.png' } } });
    await expect(assets.load('hero')).rejects.toThrow(/createImageBitmap/);
    expect(imageLoader.dispose).toBeTypeOf('function');
  });
});

describe('Preloader', () => {
  it('loads bundles in order and reports progress across them', async () => {
    const { assets } = setup();
    const game = new Game({ clock: new ManualClock(0) });
    const preloader = game
      .createObject('Preloader')
      .addComponent(Preloader, { loader: assets, bundles: ['boot', 'all'] });
    const ratios: number[] = [];
    preloader.progressed.addListener(({ ratio }) => ratios.push(ratio));
    const done = new Promise<void>((resolve) => preloader.completed.addListener(resolve));
    game.advance(100);
    await done;
    expect(preloader.isDone).toBe(true);
    expect(preloader.progress.ratio).toBe(1);
    expect(ratios.at(-1)).toBe(1);
    expect(assets.has('blob')).toBe(true);
  });

  it('reports a failure', async () => {
    const { assets, server } = setup({ retries: 0 });
    server.reply('/a/config.json', { status: 404 });
    const game = new Game({ clock: new ManualClock(0) });
    const preloader = game
      .createObject('Preloader')
      .addComponent(Preloader, { loader: assets, bundles: ['boot'] });
    const failed = new Promise<Error>((resolve) => preloader.failed.addListener(resolve));
    game.advance(100);
    expect((await failed).message).toMatch(/HTTP 404/);
    expect(preloader.isDone).toBe(false);
  });
});
