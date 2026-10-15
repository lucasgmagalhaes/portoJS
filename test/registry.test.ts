import { describe, expect, it } from 'vitest';
import {
  ManualClock,
  SaveCorruptedError,
  createCore,
  createGame,
  createSave,
  parseSave,
  registry,
} from '../src/index.js';

function make() {
  return createCore({ clock: new ManualClock(0), plugins: [registry()] });
}

describe('registry', () => {
  it('stores, reads and removes JSON values', () => {
    const game = make();
    expect(game.getData('name')).toBeUndefined();
    game.setData('name', 'Ada');
    game.setData('settings', { sound: true, volume: 0.5, tags: ['a', 'b'] });
    expect(game.getData('name')).toBe('Ada');
    expect(game.hasData('settings')).toBe(true);
    expect(game.dataKeys()).toEqual(['name', 'settings']);
    expect(game.removeData('name')).toBe(true);
    expect(game.removeData('name')).toBe(false);
    expect(game.hasData('name')).toBe(false);
  });

  it('emits events only on real changes', () => {
    const game = make();
    const log: string[] = [];
    game.on('dataChanged', ({ key, value }) => log.push(`set:${key}:${JSON.stringify(value)}`));
    game.on('dataRemoved', ({ key }) => log.push(`del:${key}`));
    game.setData('a', 1);
    game.setData('a', 1);
    game.setData('a', 2);
    game.removeData('a');
    game.removeData('a');
    expect(log).toEqual(['set:a:1', 'set:a:2', 'del:a']);
  });

  it('round-trips through a save and is cleared by reset', () => {
    const a = make();
    a.setData('tutorialDone', true);
    a.setData('list', [1, { x: null }]);
    const save = parseSave(JSON.stringify(a.save()));

    const b = make();
    b.setData('stale', 'gone after load');
    b.load(save, { offline: false });
    expect(b.getData('tutorialDone')).toBe(true);
    expect(b.getData('list')).toEqual([1, { x: null }]);
    expect(b.hasData('stale')).toBe(false);

    b.reset();
    expect(b.dataKeys()).toEqual([]);
  });

  it('works next to the built-in game', () => {
    const game = createGame({
      clock: new ManualClock(0),
      resources: { gold: { initial: 3 } },
      plugins: [registry()],
    });
    game.setData('seen', true);
    expect(game.amount('gold').toNumber()).toBe(3);
    expect(game.getData('seen')).toBe(true);
  });

  it('rejects a save entry that is not an object', () => {
    const game = make();
    expect(() => game.load(createSave(1, 0, { registry: [1, 2] }), { offline: false })).toThrow(
      SaveCorruptedError,
    );
  });
});
