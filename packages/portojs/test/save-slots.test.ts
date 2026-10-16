import { describe, expect, it } from 'vitest';
import {
  Component,
  Game,
  ManualClock,
  MemorySaveStorage,
  SaveCorruptedError,
  SaveSlots,
  SlotEmptyError,
} from '../src/index.ts';

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

function make(options: ConstructorParameters<typeof SaveSlots>[2] = {}) {
  const clock = new ManualClock(1000);
  const game = new Game({ clock });
  const score = game.createObject('Score').addComponent(Score);
  const storage = new MemorySaveStorage();
  const slots = new SaveSlots(game, storage, options);
  return { clock, game, score, storage, slots };
}

describe('SaveSlots', () => {
  it('starts with every slot empty', async () => {
    const { slots } = make();
    expect(slots.size).toBe(3);
    expect(await slots.list()).toEqual([undefined, undefined, undefined]);
  });

  it('saves into a slot with a label and shows it in the list', async () => {
    const { slots, score, clock } = make();
    score.value = 5;
    clock.advance(500);
    const info = await slots.save(2, 'Before the boss');
    expect(info).toEqual({ slot: 2, label: 'Before the boss', savedAt: 1500, corrupted: false });
    expect(await slots.list()).toEqual([undefined, info, undefined]);
  });

  it('loads a slot back, keeping slots independent', async () => {
    const { slots, score } = make();
    score.value = 1;
    await slots.save(1, 'one');
    score.value = 2;
    await slots.save(2, 'two');
    score.value = 99;
    await slots.load(1);
    expect(score.value).toBe(1);
    await slots.load(2);
    expect(score.value).toBe(2);
  });

  it('overwrites a slot and works with compressed saves', async () => {
    const { slots, score } = make({ compress: true });
    score.value = 1;
    await slots.save(1, 'a');
    score.value = 7;
    await slots.save(1, 'b');
    score.value = 0;
    await slots.load(1);
    expect(score.value).toBe(7);
    expect((await slots.list())[0]?.label).toBe('b');
  });

  it('deletes and copies slots', async () => {
    const { slots, score } = make();
    score.value = 3;
    await slots.save(1, 'orig');
    await slots.copy(1, 3);
    expect((await slots.list())[2]).toMatchObject({ slot: 3, label: 'orig' });
    await slots.delete(1);
    await slots.delete(1);
    expect((await slots.list())[0]).toBeUndefined();
    score.value = 0;
    await slots.load(3);
    expect(score.value).toBe(3);
  });

  it('reports an empty slot and a slot out of range', async () => {
    const { slots } = make();
    await expect(slots.load(1)).rejects.toBeInstanceOf(SlotEmptyError);
    await expect(slots.copy(1, 2)).rejects.toBeInstanceOf(SlotEmptyError);
    for (const bad of [0, 4, 1.5, -1]) {
      await expect(slots.save(bad)).rejects.toBeInstanceOf(RangeError);
      await expect(slots.load(bad)).rejects.toBeInstanceOf(RangeError);
      await expect(slots.delete(bad)).rejects.toBeInstanceOf(RangeError);
    }
  });

  it('marks a damaged slot as corrupted without breaking the list', async () => {
    const { slots, storage, score } = make();
    await slots.save(1, 'good');
    await storage.set('save.slot2', 'not json');
    await storage.set('save.slot3', JSON.stringify({ label: 'x', save: 'garbage' }));
    const list = await slots.list();
    expect(list[0]?.corrupted).toBe(false);
    expect(list[1]).toEqual({ slot: 2, label: '', savedAt: 0, corrupted: true });
    expect(list[2]?.corrupted).toBe(true);
    await expect(slots.load(2)).rejects.toBeInstanceOf(SaveCorruptedError);
    await expect(slots.load(3)).rejects.toBeInstanceOf(SaveCorruptedError);
    score.value = 8;
    await slots.save(2, 'fixed');
    expect((await slots.list())[1]?.corrupted).toBe(false);
  });

  it('uses its own key prefix and a custom slot count', async () => {
    const { slots, storage } = make({ key: 'game', slots: 5 });
    expect(slots.size).toBe(5);
    await slots.save(5);
    expect(storage.keys()).toEqual(['game.slot5']);
    expect(() => make({ slots: 0 })).toThrow(RangeError);
  });
});
