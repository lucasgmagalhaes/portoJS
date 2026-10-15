import { describe, expect, it } from 'vitest';
import { Component, Game, Generator, ManualClock, Prefab, Resource } from '../src/index.js';

class Tag extends Component {
  static override typeId = 'Tag';
  constructor(
    gameObject: ConstructorParameters<typeof Component>[0],
    readonly label: string,
  ) {
    super(gameObject);
  }
}

describe('Prefab', () => {
  it('creates many objects from one template with parameters', () => {
    const game = new Game({ clock: new ManualClock(0) });
    const gold = game.createObject('Gold').addComponent(Resource, { initial: 1000 });
    const miner = new Prefab<{ base: number }>((object, { base }) => {
      object.addComponent(Generator, {
        cost: { resource: gold, base, growth: 1.1 },
        produces: gold,
        rate: 1,
      });
    });

    const first = game.instantiate(miner, 'Miner1', { params: { base: 10 } });
    const second = game.instantiate(miner, 'Miner2', { params: { base: 100 } });
    expect(first.requireComponent(Generator).buy(1)).toBeDefined();
    expect(second.requireComponent(Generator).buy(1)).toBeDefined();
    expect(gold.amount.toNumber()).toBe(890);
    expect(game.find('Miner2')).toBe(second);
  });

  it('works without parameters and honors active and parent', () => {
    const game = new Game({ clock: new ManualClock(0) });
    const tagged = new Prefab((object) => {
      object.addComponent(Tag, 'x');
    }, false);
    const root = game.createObject('Root');
    const a = game.instantiate(tagged, 'A');
    const b = game.instantiate(tagged, 'B', { parent: root, active: true });
    expect(a.activeSelf).toBe(false);
    expect(b.activeSelf).toBe(true);
    expect(b.parent).toBe(root);
    expect(b.requireComponent(Tag).label).toBe('x');
  });

  it('destroys the half-built object when the builder throws', () => {
    const game = new Game({ clock: new ManualClock(0) });
    const broken = new Prefab((object) => {
      object.addComponent(Tag, 'x');
      throw new Error('bad prefab');
    });
    expect(() => game.instantiate(broken, 'Broken')).toThrow('bad prefab');
    expect(game.find('Broken')).toBeUndefined();
    const ok = new Prefab(() => undefined);
    expect(() => game.instantiate(ok, 'Broken')).not.toThrow();
  });

  it('rejects a duplicate name', () => {
    const game = new Game({ clock: new ManualClock(0) });
    const empty = new Prefab(() => undefined);
    game.instantiate(empty, 'Same');
    expect(() => game.instantiate(empty, 'Same')).toThrow(/already exists/);
  });
});
