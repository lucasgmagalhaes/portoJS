import { describe, expect, it } from 'vitest';
import { Component, Game, ManualClock } from '../src/index.ts';

class Health extends Component {
  static override typeId = 'Health';
}

class Shield extends Component {
  static override typeId = 'Shield';
}

function make(): Game {
  return new Game({ clock: new ManualClock(0) });
}

describe('tags and layers', () => {
  it('finds objects by tag in creation order', () => {
    const game = make();
    const a = game.createObject('A');
    const b = game.createObject('B');
    const c = game.createObject('C');
    a.tag = 'enemy';
    c.tag = 'enemy';
    b.tag = 'player';
    expect(game.findObjectsWithTag('enemy')).toEqual([a, c]);
    expect(game.findWithTag('player')).toBe(b);
    expect(game.findWithTag('nothing')).toBeUndefined();
    expect(game.findObjectsWithTag('')).toEqual([]);
    c.destroy();
    expect(game.findObjectsWithTag('enemy')).toEqual([a]);
  });

  it('finds objects by layer and validates it', () => {
    const game = make();
    const a = game.createObject('A');
    const b = game.createObject('B');
    b.layer = 5;
    expect(a.layer).toBe(0);
    expect(game.findObjectsOnLayer(5)).toEqual([b]);
    expect(game.findObjectsOnLayer(0)).toEqual([a]);
    expect(() => (a.layer = 32)).toThrow(RangeError);
    expect(() => (a.layer = -1)).toThrow(RangeError);
    expect(() => (a.layer = 1.5)).toThrow(RangeError);
    a.layer = 31;
    expect(a.layer).toBe(31);
  });
});

describe('hierarchy queries', () => {
  function tree() {
    const game = make();
    const root = game.createObject('Root');
    const mid = game.createObject('Mid', { parent: root });
    const leaf = game.createObject('Leaf', { parent: mid });
    const other = game.createObject('Other', { parent: root });
    const rootHealth = root.addComponent(Health);
    const leafHealth = leaf.addComponent(Health);
    const otherHealth = other.addComponent(Health);
    const midShield = mid.addComponent(Shield);
    return { root, mid, leaf, other, rootHealth, leafHealth, otherHealth, midShield };
  }

  it('collects components in children depth first, with or without the object itself', () => {
    const t = tree();
    expect(t.root.getComponentsInChildren(Health)).toEqual([
      t.rootHealth,
      t.leafHealth,
      t.otherHealth,
    ]);
    expect(t.root.getComponentsInChildren(Health, false)).toEqual([t.leafHealth, t.otherHealth]);
    expect(t.leaf.getComponentsInChildren(Shield)).toEqual([]);
  });

  it('finds a component on the closest ancestor', () => {
    const t = tree();
    expect(t.leaf.getComponentInParent(Shield)).toBe(t.midShield);
    expect(t.leaf.getComponentInParent(Health)).toBe(t.leafHealth);
    expect(t.leaf.getComponentInParent(Health, false)).toBe(t.rootHealth);
    expect(t.root.getComponentInParent(Shield)).toBeUndefined();
    expect(t.root.getComponentInParent(Health, false)).toBeUndefined();
  });
});
