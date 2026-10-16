import { describe, expect, it } from 'vitest';
import {
  CloudSync,
  Component,
  Game,
  ManualClock,
  MemorySaveStorage,
  SaveCorruptedError,
} from '../src/index.ts';
import type { SaveData } from '../src/index.ts';
import { importSave } from '@portojs/core';

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

function saveAt(time: number, score: number): string {
  const game = new Game({ clock: new ManualClock(time) });
  game.createObject('Score').addComponent(Score).value = score;
  return game.exportSave();
}

function scoreOf(save: SaveData): number {
  const objects = save.data['objects'] as Record<string, Record<string, number>>;
  return objects['Score']?.['Score'] ?? 0;
}

async function setup(
  local?: string,
  cloud?: string,
  options?: ConstructorParameters<typeof CloudSync>[2],
) {
  const localStore = new MemorySaveStorage();
  const cloudStore = new MemorySaveStorage();
  if (local !== undefined) await localStore.set('save', local);
  if (cloud !== undefined) await cloudStore.set('save', cloud);
  return { localStore, cloudStore, sync: new CloudSync(localStore, cloudStore, options) };
}

describe('CloudSync without a conflict', () => {
  it('does nothing when both sides are empty or equal', async () => {
    const empty = await setup();
    expect(await empty.sync.sync()).toEqual({ action: 'none', conflict: false });
    const text = saveAt(100, 1);
    const same = await setup(text, text);
    expect(await same.sync.sync()).toEqual({ action: 'none', conflict: false });
  });

  it('uploads a save the cloud does not have, and downloads one the device does not have', async () => {
    const text = saveAt(100, 1);
    const up = await setup(text);
    expect(await up.sync.sync()).toEqual({ action: 'uploaded', conflict: false });
    expect(await up.cloudStore.get('save')).toBe(text);
    const down = await setup(undefined, text);
    expect(await down.sync.sync()).toEqual({ action: 'downloaded', conflict: false });
    expect(await down.localStore.get('save')).toBe(text);
  });
});

describe('CloudSync conflicts', () => {
  const older = saveAt(100, 50);
  const newer = saveAt(200, 10);

  it('newest: the later save wins on either side, and ties go to the device', async () => {
    const a = await setup(older, newer);
    expect(await a.sync.sync()).toEqual({ action: 'downloaded', conflict: true });
    expect(await a.localStore.get('save')).toBe(newer);
    const b = await setup(newer, older);
    expect(await b.sync.sync()).toEqual({ action: 'uploaded', conflict: true });
    expect(await b.cloudStore.get('save')).toBe(newer);
    const tieLocal = saveAt(100, 1);
    const tieCloud = saveAt(100, 2);
    const c = await setup(tieLocal, tieCloud);
    expect((await c.sync.sync()).action).toBe('uploaded');
  });

  it('furthest: the save with more progress wins even if older, ties go to the newest', async () => {
    const options = { policy: 'furthest', progress: scoreOf } as const;
    const a = await setup(older, newer, options);
    expect((await a.sync.sync()).action).toBe('uploaded');
    expect(await a.cloudStore.get('save')).toBe(older);
    const b = await setup(newer, older, options);
    expect((await b.sync.sync()).action).toBe('downloaded');
    const tieOld = saveAt(100, 5);
    const tieNew = saveAt(300, 5);
    const c = await setup(tieOld, tieNew, options);
    expect((await c.sync.sync()).action).toBe('downloaded');
  });

  it('furthest needs a progress function', () => {
    expect(
      () => new CloudSync(new MemorySaveStorage(), new MemorySaveStorage(), { policy: 'furthest' }),
    ).toThrow(RangeError);
  });

  it('a custom policy can pick a side or merge into a new save to both', async () => {
    const pick = await setup(older, newer, { policy: () => 'local' });
    expect((await pick.sync.sync()).action).toBe('uploaded');
    const merge = await setup(older, newer, {
      policy: (local, cloud) => ({
        ...local,
        savedAt: Math.max(local.savedAt, cloud.savedAt),
        data: { objects: { Score: { Score: scoreOf(local) + scoreOf(cloud) } } },
      }),
    });
    expect(await merge.sync.sync()).toEqual({ action: 'merged', conflict: true });
    const stored = await merge.localStore.get('save');
    expect(scoreOf(importSave(stored ?? ''))).toBe(60);
    expect(await merge.cloudStore.get('save')).toBe(stored);
  });

  it('prefers the readable side when one is damaged, and throws when both are', async () => {
    const good = saveAt(100, 1);
    const damagedCloud = await setup(good, 'garbage');
    expect((await damagedCloud.sync.sync()).action).toBe('uploaded');
    expect(await damagedCloud.cloudStore.get('save')).toBe(good);
    const damagedLocal = await setup('garbage', good);
    expect((await damagedLocal.sync.sync()).action).toBe('downloaded');
    const both = await setup('garbage', 'also garbage');
    await expect(both.sync.sync()).rejects.toBeInstanceOf(SaveCorruptedError);
  });

  it('uses a custom key on both sides', async () => {
    const localStore = new MemorySaveStorage();
    const cloudStore = new MemorySaveStorage();
    await localStore.set('profile', saveAt(1, 1));
    await new CloudSync(localStore, cloudStore, { key: 'profile' }).sync();
    expect(cloudStore.keys()).toEqual(['profile']);
  });
});
