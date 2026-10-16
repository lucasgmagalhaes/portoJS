import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  Autosave,
  Component,
  Game,
  IndexedDbSaveStorage,
  ManualClock,
  MemorySaveStorage,
  SaveCorruptedError,
  SaveVersionError,
  WebSaveStorage,
} from '../src/index.ts';
import type { SaveStorage, Scheduler } from '../src/index.ts';

class Score extends Component {
  static override typeId = 'Score';
  value = 0;

  override onSave(): number {
    return this.value;
  }

  override onLoad(data?: unknown): void {
    this.value = typeof data === 'number' ? data : 0;
  }
}

class FakeScheduler implements Scheduler {
  readonly tasks = new Set<{ callback: () => void; ms: number }>();

  start(callback: () => void, ms: number): () => void {
    const task = { callback, ms };
    this.tasks.add(task);
    return () => this.tasks.delete(task);
  }

  tick(): void {
    for (const task of [...this.tasks]) task.callback();
  }
}

function make(options: ConstructorParameters<typeof Autosave>[2] = {}, version = 1) {
  const game = new Game({ clock: new ManualClock(0), version });
  const score = game.createObject('Score').addComponent(Score);
  const storage = new MemorySaveStorage();
  const scheduler = new FakeScheduler();
  const autosave = new Autosave(game, storage, { scheduler, ...options });
  return { game, score, storage, scheduler, autosave };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Autosave', () => {
  it('saves and loads through the storage', async () => {
    const { score, autosave, storage, game } = make();
    score.value = 42;
    await autosave.save();
    expect(storage.keys()).toEqual(['save']);
    score.value = 0;
    const result = await autosave.load();
    expect(result?.source).toBe('main');
    expect(score.value).toBe(42);
    expect(game.running).toBe(false);
  });

  it('loads nothing from an empty storage', async () => {
    const { autosave } = make();
    expect(await autosave.load()).toBeUndefined();
  });

  it('rotates backups and drops the oldest', async () => {
    const { score, autosave, storage } = make({ backups: 2 });
    for (const value of [1, 2, 3, 4]) {
      score.value = value;
      await autosave.save();
    }
    expect(storage.keys().sort()).toEqual(['save', 'save.bak1', 'save.bak2']);
    const restore = async (key: string): Promise<number> => {
      const reader = make();
      const only = new MemorySaveStorage();
      await only.set('save', (await storage.get(key)) ?? '');
      await new Autosave(reader.game, only).load();
      return reader.score.value;
    };
    expect(await restore('save')).toBe(4);
    expect(await restore('save.bak1')).toBe(3);
    expect(await restore('save.bak2')).toBe(2);
  });

  it('falls back to a backup when the main save is corrupted', async () => {
    const { score, autosave, storage } = make();
    score.value = 7;
    await autosave.save();
    score.value = 8;
    await autosave.save();
    await storage.set('save', 'definitely not a save');
    score.value = 0;
    const result = await autosave.load();
    expect(result).toMatchObject({ source: 'backup1', skipped: 1 });
    expect(score.value).toBe(7);
  });

  it('throws when every copy is corrupted', async () => {
    const { autosave, storage } = make();
    await storage.set('save', 'junk');
    await storage.set('save.bak1', 'junk too');
    await expect(autosave.load()).rejects.toBeInstanceOf(SaveCorruptedError);
  });

  it('does not fall back past a save from a newer version', async () => {
    const newer = make({}, 2);
    newer.score.value = 5;
    await newer.autosave.save();
    const { autosave, storage } = make({}, 1);
    await storage.set('save', (await newer.storage.get('save')) ?? '');
    await storage.set('save.bak1', (await newer.storage.get('save')) ?? '');
    await expect(autosave.load()).rejects.toBeInstanceOf(SaveVersionError);
  });

  it('saves on the interval while started and stops', async () => {
    const { autosave, scheduler, storage } = make({ intervalMs: 5000 });
    autosave.start();
    autosave.start();
    expect(autosave.running).toBe(true);
    expect(scheduler.tasks.size).toBe(1);
    scheduler.tick();
    await settle();
    expect(storage.keys()).toContain('save');
    autosave.stop();
    expect(autosave.running).toBe(false);
    expect(scheduler.tasks.size).toBe(0);
  });

  it('does nothing on start without an interval', () => {
    const { autosave, scheduler } = make();
    autosave.start();
    expect(scheduler.tasks.size).toBe(0);
  });

  it('turns many requests into one save', async () => {
    const { autosave, scheduler, storage, score } = make();
    const saves: number[] = [];
    autosave.saved.addListener(() => saves.push(score.value));
    score.value = 1;
    autosave.request();
    autosave.request();
    autosave.request();
    expect(scheduler.tasks.size).toBe(1);
    score.value = 2;
    scheduler.tick();
    await settle();
    expect(saves).toEqual([2]);
    expect(scheduler.tasks.size).toBe(0);
    expect(storage.keys()).toEqual(['save']);
  });

  it('flushes a pending request at once', async () => {
    const { autosave, scheduler, storage } = make();
    autosave.request();
    await autosave.flush();
    expect(storage.keys()).toEqual(['save']);
    expect(scheduler.tasks.size).toBe(0);
    await autosave.flush();
  });

  it('serialises overlapping saves', async () => {
    const { game, score } = make();
    const order: string[] = [];
    class SlowStorage extends MemorySaveStorage {
      override async set(key: string, value: string): Promise<void> {
        order.push(`start ${key}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        await super.set(key, value);
        order.push(`end ${key}`);
      }
    }
    const autosave = new Autosave(game, new SlowStorage(), { backups: 0 });
    score.value = 1;
    const first = autosave.save();
    const second = autosave.save();
    await Promise.all([first, second]);
    expect(order).toEqual(['start save', 'end save', 'start save', 'end save']);
  });

  it('reports a failing automatic save and recovers on the next one', async () => {
    const { game } = make();
    let failing = true;
    const storage: SaveStorage = {
      get: () => Promise.resolve(null),
      remove: () => Promise.resolve(),
      set: () => (failing ? Promise.reject(new Error('disk full')) : Promise.resolve()),
    };
    const scheduler = new FakeScheduler();
    const autosave = new Autosave(game, storage, { scheduler, intervalMs: 10, backups: 0 });
    const errors: unknown[] = [];
    let saved = 0;
    autosave.failed.addListener((e) => errors.push(e));
    autosave.saved.addListener(() => saved++);
    autosave.start();
    scheduler.tick();
    await settle();
    expect(errors).toHaveLength(1);
    failing = false;
    scheduler.tick();
    await settle();
    expect(saved).toBe(1);
  });

  it('drops backups and retries once when the quota is full', async () => {
    const { game, score } = make();
    const backing = new MemorySaveStorage();
    await backing.set('save.bak1', 'x');
    await backing.set('save.bak2', 'y');
    let rejectNext = true;
    const storage: SaveStorage = {
      get: (key) => backing.get(key),
      remove: (key) => backing.remove(key),
      set(key, value) {
        if (rejectNext && key === 'save.bak2') {
          rejectNext = false;
          return Promise.reject(Object.assign(new Error('quota'), { name: 'QuotaExceededError' }));
        }
        return backing.set(key, value);
      },
    };
    const autosave = new Autosave(game, storage, { backups: 2 });
    score.value = 9;
    await autosave.save();
    expect(backing.keys()).toEqual(['save']);
  });

  it('clears everything', async () => {
    const { autosave, storage } = make();
    await autosave.save();
    await autosave.save();
    await autosave.clear();
    expect(storage.keys()).toEqual([]);
  });

  it('stores the compressed format and loads it back', async () => {
    const { autosave, score, storage } = make({ compress: true });
    score.value = 11;
    await autosave.save();
    expect(storage.keys()).toEqual(['save']);
    score.value = 0;
    await autosave.load();
    expect(score.value).toBe(11);
  });

  it('validates options', () => {
    const game = new Game({ clock: new ManualClock(0) });
    const storage = new MemorySaveStorage();
    expect(() => new Autosave(game, storage, { backups: -1 })).toThrow(RangeError);
    expect(() => new Autosave(game, storage, { debounceMs: -1 })).toThrow(RangeError);
    expect(() => new Autosave(game, storage, { intervalMs: 0 })).toThrow(RangeError);
  });
});

describe('storage adapters', () => {
  it('WebSaveStorage reads and writes through a Storage-like object', async () => {
    const data = new Map<string, string>();
    const storage = new WebSaveStorage({
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    });
    await storage.set('a', '1');
    expect(await storage.get('a')).toBe('1');
    await storage.remove('a');
    expect(await storage.get('a')).toBeNull();
  });

  it('WebSaveStorage rejects when the store throws', async () => {
    const storage = new WebSaveStorage({
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      },
      removeItem: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'plain string';
      },
    });
    await expect(storage.get('a')).rejects.toThrow('denied');
    await expect(storage.set('a', 'b')).rejects.toMatchObject({ name: 'QuotaExceededError' });
    await expect(storage.remove('a')).rejects.toThrow('plain string');
  });

  it('IndexedDbSaveStorage stores values and survives reopening', async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbSaveStorage({ database: 'test', factory });
    await first.set('slot', 'hello');
    expect(await first.get('slot')).toBe('hello');
    expect(await first.get('other')).toBeNull();
    await first.close();
    const second = new IndexedDbSaveStorage({ database: 'test', factory });
    expect(await second.get('slot')).toBe('hello');
    await second.remove('slot');
    expect(await second.get('slot')).toBeNull();
    await second.close();
  });

  it('works end to end with a game and IndexedDB', async () => {
    const { game, score } = make();
    const storage = new IndexedDbSaveStorage({ database: 'e2e', factory: new IDBFactory() });
    const autosave = new Autosave(game, storage);
    score.value = 77;
    await autosave.save();
    score.value = 0;
    await autosave.load();
    expect(score.value).toBe(77);
    await storage.close();
  });
});
