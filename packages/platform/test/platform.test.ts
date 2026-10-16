import { ManualClock } from '@portojs/core';
import { Generator, Resource } from '@portojs/idle';
import { Game } from '@portojs/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindPlatform, telegramPlatform, tiktokPlatform, webPlatform } from '../src/index.ts';
import type { TelegramWebApp, TikTokApi, VisibilityTarget } from '../src/index.ts';

class FakeDocument extends EventTarget implements VisibilityTarget {
  visibilityState = 'visible';

  change(state: string): void {
    this.visibilityState = state;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

class FakeStorage {
  readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

function makeTelegram(failWith?: string) {
  const items = new Map<string, string>();
  const handlers = new Map<string, Set<() => void>>();
  const calls: string[] = [];
  const app: TelegramWebApp = {
    ready: () => calls.push('ready'),
    expand: () => calls.push('expand'),
    initDataUnsafe: { user: { id: 42, first_name: 'Ana', username: 'ana_dev' } },
    CloudStorage: {
      getItem: (key, callback) => callback(failWith ?? null, items.get(key) ?? ''),
      setItem: (key, value, callback) => {
        if (value.length > 4096) {
          callback?.('VALUE_INVALID');
          return;
        }
        items.set(key, value);
        callback?.(failWith ?? null, true);
      },
      removeItem: (key, callback) => {
        items.delete(key);
        callback?.(null, true);
      },
    },
    HapticFeedback: {
      impactOccurred: (style) => calls.push(`impact:${style}`),
      notificationOccurred: (type) => calls.push(`notify:${type}`),
    },
    onEvent: (type, handler) => {
      const set = handlers.get(type) ?? new Set();
      set.add(handler);
      handlers.set(type, set);
    },
    offEvent: (type, handler) => {
      handlers.get(type)?.delete(handler);
    },
  };
  const fire = (type: string): void => {
    for (const handler of [...(handlers.get(type) ?? [])]) handler();
  };
  return { app, items, calls, fire, handlers };
}

afterEach(() => {
  vi.useRealTimers();
});

class FakeWindow extends EventTarget {}

describe('webPlatform page lifecycle', () => {
  it('also suspends on pagehide and resumes on pageshow', () => {
    const win = new FakeWindow();
    const platform = webPlatform({
      storage: new FakeStorage(),
      document: new FakeDocument(),
      window: win,
    });
    const log: string[] = [];
    const offSuspend = platform.onSuspend(() => log.push('suspend'));
    const offResume = platform.onResume(() => log.push('resume'));
    win.dispatchEvent(new Event('pagehide'));
    win.dispatchEvent(new Event('pageshow'));
    offSuspend();
    offResume();
    win.dispatchEvent(new Event('pagehide'));
    win.dispatchEvent(new Event('pageshow'));
    expect(log).toEqual(['suspend', 'resume']);
  });
});

describe('webPlatform defaults', () => {
  it('falls back to the globals when nothing is injected', () => {
    const platform = webPlatform({ storage: new FakeStorage(), document: new FakeDocument() });
    expect(() => platform.vibrate()).not.toThrow();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      value: { vibrate: () => true },
      configurable: true,
    });
    expect(() => platform.vibrate('light')).not.toThrow();
    if (original !== undefined) Object.defineProperty(globalThis, 'navigator', original);
  });
});

describe('webPlatform', () => {
  it('stores strings, follows page visibility and vibrates', async () => {
    const storage = new FakeStorage();
    const page = new FakeDocument();
    const buzzed: number[] = [];
    const platform = webPlatform({
      storage,
      document: page,
      vibrate: (pattern) => buzzed.push(pattern),
    });
    expect(platform.name).toBe('web');
    expect(await platform.storage.get('k')).toBeUndefined();
    await platform.storage.set('k', 'value');
    expect(await platform.storage.get('k')).toBe('value');
    await platform.storage.remove('k');
    expect(storage.items.size).toBe(0);

    const log: string[] = [];
    const offSuspend = platform.onSuspend(() => log.push('suspend'));
    const offResume = platform.onResume(() => log.push('resume'));
    page.change('hidden');
    page.change('visible');
    offSuspend();
    offResume();
    page.change('hidden');
    expect(log).toEqual(['suspend', 'resume']);

    platform.vibrate();
    platform.vibrate('heavy');
    expect(buzzed).toEqual([10, 40]);
    expect(platform.user()).toBeUndefined();
    expect(() => platform.ready()).not.toThrow();
  });

  it('never throws from vibrate', () => {
    const platform = webPlatform({
      storage: new FakeStorage(),
      document: new FakeDocument(),
      vibrate: () => {
        throw new Error('unsupported');
      },
    });
    expect(() => platform.vibrate('error')).not.toThrow();
  });
});

describe('telegramPlatform', () => {
  it('stores small values directly', async () => {
    const { app, items } = makeTelegram();
    const platform = telegramPlatform(app);
    expect(await platform.storage.get('save')).toBeUndefined();
    await platform.storage.set('save', 'abc');
    expect(items.get('save')).toBe('abc');
    expect(await platform.storage.get('save')).toBe('abc');
    await platform.storage.remove('save');
    expect(items.size).toBe(0);
  });

  it('splits big values into chunks, reads them back and cleans up leftovers', async () => {
    const { app, items } = makeTelegram();
    const platform = telegramPlatform(app, { chunkSize: 10 });
    const big = 'abcdefghij'.repeat(4) + 'xyz';
    await platform.storage.set('save', big);
    expect(items.get('save')).toBe('@@chunks:5');
    expect(await platform.storage.get('save')).toBe(big);

    await platform.storage.set('save', 'short');
    expect(items.get('save')).toBe('short');
    expect([...items.keys()]).toEqual(['save']);

    await platform.storage.set('save', big);
    await platform.storage.set('save', 'y'.repeat(25));
    expect(items.get('save')).toBe('@@chunks:3');
    expect(items.has('save_c3')).toBe(false);
    await platform.storage.remove('save');
    expect(items.size).toBe(0);
  });

  it('returns nothing when a chunk is missing and rejects storage errors', async () => {
    const { app, items } = makeTelegram();
    const platform = telegramPlatform(app, { chunkSize: 5 });
    await platform.storage.set('save', 'abcdefghijkl');
    items.delete('save_c1');
    expect(await platform.storage.get('save')).toBeUndefined();

    items.set('save', '@@chunks:nonsense');
    expect(await platform.storage.get('save')).toBe('@@chunks:nonsense');

    const broken = telegramPlatform(makeTelegram('QUOTA').app);
    await expect(broken.storage.get('k')).rejects.toThrow('QUOTA');
    await expect(broken.storage.set('k', 'v')).rejects.toThrow('QUOTA');
    const refusing = makeTelegram();
    refusing.app.CloudStorage.setItem = (_key, _value, callback) => callback?.(null, false);
    await expect(telegramPlatform(refusing.app).storage.set('k', 'v')).rejects.toThrow(
      'could not store',
    );
    const removing = makeTelegram();
    removing.app.CloudStorage.removeItem = (_key, callback) => callback?.('NOPE');
    await expect(telegramPlatform(removing.app).storage.remove('k')).rejects.toThrow('NOPE');
  });

  it('maps lifecycle, haptics and the user', () => {
    const { app, calls, fire, handlers } = makeTelegram();
    const platform = telegramPlatform(app);
    platform.ready();
    expect(calls).toEqual(['ready', 'expand']);
    const log: string[] = [];
    const offSuspend = platform.onSuspend(() => log.push('suspend'));
    const offResume = platform.onResume(() => log.push('resume'));
    fire('deactivated');
    fire('activated');
    offSuspend();
    offResume();
    fire('deactivated');
    expect(log).toEqual(['suspend', 'resume']);
    expect(handlers.get('deactivated')?.size).toBe(0);

    calls.length = 0;
    platform.vibrate();
    platform.vibrate('heavy');
    platform.vibrate('success');
    platform.vibrate('error');
    expect(calls).toEqual(['impact:light', 'impact:heavy', 'notify:success', 'notify:error']);
    expect(platform.user()).toEqual({ id: '42', name: 'ana_dev' });
  });

  it('copes with a minimal WebApp and validates the chunk size', () => {
    const { app } = makeTelegram();
    const bare: TelegramWebApp = {
      ready: app.ready,
      CloudStorage: app.CloudStorage,
      onEvent: app.onEvent,
      offEvent: app.offEvent,
    };
    const platform = telegramPlatform(bare);
    expect(() => platform.ready()).not.toThrow();
    expect(() => platform.vibrate()).not.toThrow();
    expect(platform.user()).toBeUndefined();
    const anonymous: TelegramWebApp = { ...bare, initDataUnsafe: { user: { id: 7 } } };
    expect(telegramPlatform(anonymous).user()).toEqual({ id: '7' });
    expect(() => telegramPlatform(app, { chunkSize: 0 })).toThrow(RangeError);
    expect(() => telegramPlatform(app, { chunkSize: 5000 })).toThrow(RangeError);
    const throwing: TelegramWebApp = {
      ...bare,
      HapticFeedback: {
        impactOccurred: () => {
          throw new Error('no haptics');
        },
        notificationOccurred: () => undefined,
      },
    };
    expect(() => telegramPlatform(throwing).vibrate()).not.toThrow();
  });
});

function makeTikTok() {
  const items = new Map<string, unknown>();
  const listeners = { show: new Set<() => void>(), hide: new Set<() => void>() };
  const calls: string[] = [];
  const api: TikTokApi = {
    getStorage: ({ key, success, fail }) => {
      if (items.has(key)) success({ data: items.get(key) });
      else fail({ errMsg: 'not found' });
    },
    setStorage: ({ key, data, success }) => {
      items.set(key, data);
      success();
    },
    removeStorage: ({ key, success }) => {
      items.delete(key);
      success();
    },
    onShow: (listener) => listeners.show.add(listener),
    offShow: (listener) => listeners.show.delete(listener),
    onHide: (listener) => listeners.hide.add(listener),
    offHide: (listener) => listeners.hide.delete(listener),
    vibrateShort: () => calls.push('short'),
    vibrateLong: () => calls.push('long'),
  };
  return { api, items, listeners, calls };
}

describe('tiktokPlatform', () => {
  it('reads a missing key as no save, and stores and removes values', async () => {
    const { api, items } = makeTikTok();
    const platform = tiktokPlatform(api);
    expect(platform.name).toBe('tiktok');
    expect(await platform.storage.get('save')).toBeUndefined();
    await platform.storage.set('save', 'abc');
    expect(await platform.storage.get('save')).toBe('abc');
    items.set('save', 12);
    expect(await platform.storage.get('save')).toBeUndefined();
    await platform.storage.remove('save');
    expect(items.size).toBe(0);
    expect(() => platform.ready()).not.toThrow();
  });

  it('rejects when the platform refuses to store', async () => {
    const { api } = makeTikTok();
    api.setStorage = ({ fail }) => fail({ errMsg: 'quota' });
    await expect(tiktokPlatform(api).storage.set('k', 'v')).rejects.toThrow('quota');
    api.setStorage = ({ fail }) => fail(new Error('plain'));
    await expect(tiktokPlatform(api).storage.set('k', 'v')).rejects.toThrow('plain');
  });

  it('maps lifecycle, vibration and the user', () => {
    const { api, listeners, calls } = makeTikTok();
    const platform = tiktokPlatform(api, { user: { id: 'u1', name: 'Bo' } });
    const log: string[] = [];
    const offSuspend = platform.onSuspend(() => log.push('suspend'));
    const offResume = platform.onResume(() => log.push('resume'));
    for (const listener of listeners.hide) listener();
    for (const listener of listeners.show) listener();
    offSuspend();
    offResume();
    expect(log).toEqual(['suspend', 'resume']);
    expect(listeners.hide.size + listeners.show.size).toBe(0);
    platform.vibrate();
    platform.vibrate('heavy');
    platform.vibrate('error');
    expect(calls).toEqual(['short', 'long', 'long']);
    expect(platform.user()).toEqual({ id: 'u1', name: 'Bo' });
    expect(tiktokPlatform(api).user()).toBeUndefined();
    const failing: TikTokApi = {
      ...api,
      vibrateShort: () => {
        throw new Error('no');
      },
    };
    expect(() => tiktokPlatform(failing).vibrate()).not.toThrow();
    const rest: TikTokApi = { ...api };
    delete rest.vibrateShort;
    expect(() => tiktokPlatform(rest).vibrate()).not.toThrow();
  });
});

function makeGame(clock: ManualClock) {
  const game = new Game({ clock, stepMs: 100 });
  const gold = game.createObject('Gold').addComponent(Resource, { initial: 0 });
  game.createObject('Miner').addComponent(Generator, {
    cost: { resource: gold, base: 10, growth: 1.1 },
    produces: gold,
    rate: 1,
    initial: 1,
  });
  return { game, gold };
}

describe('bindPlatform', () => {
  it('loads the save, starts the game and autosaves compressed saves', async () => {
    vi.useFakeTimers();
    const storage = new FakeStorage();
    const platform = webPlatform({ storage, document: new FakeDocument() });

    const first = makeGame(new ManualClock(0));
    first.gold.add(500);
    storage.setItem('portojs-save', first.game.exportSave());

    const { game, gold } = makeGame(new ManualClock(0));
    const errors: unknown[] = [];
    const session = await bindPlatform(game, platform, {
      autosaveMs: 1000,
      onError: (error) => errors.push(error),
    });
    expect(game.running).toBe(true);
    expect(gold.amount.toNumber()).toBe(500);
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.getItem('portojs-save')?.startsWith('~')).toBe(true);
    expect(errors).toEqual([]);
    session.dispose();
    game.dispose();
  });

  it('saves and stops when suspended, then credits the time away on resume', async () => {
    const storage = new FakeStorage();
    const page = new FakeDocument();
    const clock = new ManualClock(0);
    const { game, gold } = makeGame(clock);
    const session = await bindPlatform(game, webPlatform({ storage, document: page }), {
      autosaveMs: 0,
      key: 'mine',
    });
    page.change('hidden');
    page.change('hidden');
    expect(game.running).toBe(false);
    await Promise.resolve();
    expect(storage.getItem('mine')).not.toBeNull();
    const before = gold.amount.toNumber();
    clock.advance(60_000);
    page.change('visible');
    page.change('visible');
    expect(game.running).toBe(true);
    expect(gold.amount.toNumber()).toBeGreaterThan(before);
    session.dispose();
    page.change('hidden');
    expect(game.running).toBe(true);
    game.dispose();
  });

  async function away(background: 'offline' | 'pause' | 'run'): Promise<{
    gained: number;
    running: boolean;
    saved: boolean;
  }> {
    const storage = new FakeStorage();
    const page = new FakeDocument();
    const clock = new ManualClock(0);
    const { game, gold } = makeGame(clock);
    const session = await bindPlatform(game, webPlatform({ storage, document: page }), {
      autosaveMs: 0,
      key: 'k',
      background,
    });
    const before = gold.amount.toNumber();
    page.change('hidden');
    const running = game.running;
    await Promise.resolve();
    const saved = storage.getItem('k') !== null;
    clock.advance(60_000);
    page.change('visible');
    const gained = gold.amount.toNumber() - before;
    session.dispose();
    game.dispose();
    return { gained, running, saved };
  }

  it('credits the time away with the offline policy and stops while away', async () => {
    const result = await away('offline');
    expect(result.running).toBe(false);
    expect(result.saved).toBe(true);
    expect(result.gained).toBeGreaterThan(0);
  });

  it('freezes time with the pause policy', async () => {
    const result = await away('pause');
    expect(result.running).toBe(false);
    expect(result.saved).toBe(true);
    expect(result.gained).toBe(0);
  });

  it('keeps the loop with the run policy and still saves', async () => {
    const result = await away('run');
    expect(result.running).toBe(true);
    expect(result.saved).toBe(true);
  });

  it('keeps playing when the save is damaged or storage fails', async () => {
    const storage = new FakeStorage();
    storage.setItem('portojs-save', 'garbage');
    const { game } = makeGame(new ManualClock(0));
    const errors: unknown[] = [];
    const platform = webPlatform({ storage, document: new FakeDocument() });
    const session = await bindPlatform(game, platform, {
      autosaveMs: 0,
      onError: (error) => errors.push(error),
    });
    expect(game.running).toBe(true);
    expect(errors).toHaveLength(1);

    storage.setItem = () => {
      throw new Error('disk full');
    };
    await session.save();
    expect(errors).toHaveLength(2);
    session.dispose();
    game.dispose();

    const silent = makeGame(new ManualClock(0));
    storage.getItem = () => {
      throw new Error('unreadable');
    };
    const quiet = await bindPlatform(silent.game, platform, { autosaveMs: 0 });
    await quiet.save();
    expect(silent.game.running).toBe(true);
    quiet.dispose();
    silent.game.dispose();
  });
});
