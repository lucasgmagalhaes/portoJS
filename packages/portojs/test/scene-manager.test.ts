import { describe, expect, it } from 'vitest';
import { Component, ComponentRegistry, Game, ManualClock, SceneManager } from '../src/index.ts';

class Marker extends Component {
  static override typeId = 'Marker';
}

function make(): { game: Game; scenes: SceneManager; names: () => string[] } {
  const game = new Game({ clock: new ManualClock(0) });
  const registry = new ComponentRegistry().register(Marker);
  const scenes = new SceneManager(game, { registry });
  return { game, scenes, names: () => game.objects.map((o) => o.name) };
}

describe('SceneManager', () => {
  it('builds a scene from a function and replaces it on the next load', async () => {
    const { scenes, names } = make();
    scenes.register('menu', (ctx) => {
      ctx.createObject('Title');
    });
    scenes.register('level', (ctx) => {
      ctx.createObject('Player');
      ctx.createObject('Enemy');
    });
    await scenes.load('menu');
    expect(names()).toEqual(['Title']);
    expect(scenes.current).toBe('menu');
    await scenes.load('level');
    expect(names()).toEqual(['Player', 'Enemy']);
    expect(scenes.current).toBe('level');
    expect(scenes.loadedScenes).toEqual(['level']);
    expect(scenes.isLoaded('menu')).toBe(false);
  });

  it('loads a JSON scene through the registry', async () => {
    const { scenes, names, game } = make();
    scenes.register('json', {
      objects: [
        { name: 'A', components: [{ type: 'Marker' }], children: [{ name: 'A1' }] },
        { name: 'B' },
      ],
    });
    await scenes.load('json');
    expect(names().sort()).toEqual(['A', 'A1', 'B']);
    expect(game.find('A')?.getComponent(Marker)).toBeDefined();
    await scenes.unload('json');
    expect(names()).toEqual([]);
  });

  it('adds scenes additively and unloads one without touching the others', async () => {
    const { scenes, names } = make();
    scenes.register('world', (ctx) => {
      ctx.createObject('Ground');
    });
    scenes.register('hud', (ctx) => {
      ctx.createObject('Score');
    });
    await scenes.load('world');
    await scenes.loadAdditive('hud');
    await scenes.loadAdditive('hud');
    expect(names()).toEqual(['Ground', 'Score']);
    expect(scenes.loadedScenes).toEqual(['world', 'hud']);
    await scenes.unload('hud');
    expect(names()).toEqual(['Ground']);
    expect(scenes.current).toBe('world');
    await scenes.unload('hud');
    await scenes.unload('world');
    expect(scenes.current).toBeUndefined();
  });

  it('keeps persistent objects across loads', async () => {
    const { scenes, names } = make();
    scenes.register('a', (ctx) => {
      scenes.persist(ctx.createObject('Music'));
      ctx.createObject('A');
    });
    scenes.register('b', (ctx) => {
      ctx.createObject('B');
    });
    await scenes.load('a');
    await scenes.load('b');
    expect(names()).toEqual(['Music', 'B']);
    expect(scenes.has('a')).toBe(true);
  });

  it('persists an object created outside any scene', async () => {
    const { scenes, game, names } = make();
    const manager = game.createObject('Manager');
    scenes.persist(manager);
    scenes.register('s', (ctx) => {
      ctx.createObject('S');
    });
    await scenes.load('s');
    await scenes.load('s');
    expect(names()).toEqual(['Manager', 'S']);
  });

  it('runs a transition around the change in order', async () => {
    const { scenes } = make();
    const log: string[] = [];
    scenes.register('one', () => {
      log.push('build one');
    });
    scenes.register('two', () => {
      log.push('build two');
    });
    scenes.unloaded.addListener((name) => log.push(`unloaded ${name}`));
    await scenes.load('one');
    await scenes.load('two', {
      transition: {
        out: async () => {
          await Promise.resolve();
          log.push('out');
        },
        in: () => {
          log.push('in');
        },
      },
    });
    expect(log).toEqual(['build one', 'out', 'unloaded one', 'build two', 'in']);
  });

  it('supports async builders and runs queued loads in order', async () => {
    const { scenes, names } = make();
    const order: string[] = [];
    scenes.register('slow', async (ctx) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      ctx.createObject('Slow');
      order.push('slow');
    });
    scenes.register('fast', (ctx) => {
      ctx.createObject('Fast');
      order.push('fast');
    });
    const first = scenes.load('slow');
    const second = scenes.load('fast');
    await Promise.all([first, second]);
    expect(order).toEqual(['slow', 'fast']);
    expect(names()).toEqual(['Fast']);
  });

  it('emits loaded events with the additive flag', async () => {
    const { scenes } = make();
    const seen: string[] = [];
    scenes.loaded.addListener(({ name, additive }) => seen.push(`${name}:${additive}`));
    scenes.register('a', () => undefined);
    scenes.register('b', () => undefined);
    await scenes.load('a');
    await scenes.loadAdditive('b');
    expect(seen).toEqual(['a:false', 'b:true']);
  });

  it('cleans up after a failing builder and keeps working', async () => {
    const { scenes, names } = make();
    scenes.register('broken', (ctx) => {
      ctx.createObject('Half');
      throw new Error('boom');
    });
    scenes.register('ok', (ctx) => {
      ctx.createObject('Half');
    });
    await expect(scenes.load('broken')).rejects.toThrow('boom');
    expect(names()).toEqual([]);
    expect(scenes.isLoaded('broken')).toBe(false);
    expect(scenes.current).toBeUndefined();
    await scenes.load('ok');
    expect(names()).toEqual(['Half']);
  });

  it('cleans up an invalid JSON scene', async () => {
    const { scenes, names } = make();
    scenes.register('bad', {
      objects: [{ name: 'Fine' }, { name: 'Bad', components: [{ type: 'Nope' }] }],
    });
    await expect(scenes.load('bad')).rejects.toThrow();
    expect(names()).toEqual([]);
  });

  it('rejects unknown and duplicate scenes', () => {
    const { scenes } = make();
    scenes.register('a', () => undefined);
    expect(() => scenes.register('a', () => undefined)).toThrow(/already registered/);
    expect(() => scenes.load('zzz')).toThrow(/unknown scene/);
    expect(() => scenes.loadAdditive('zzz')).toThrow(/unknown scene/);
  });
});
