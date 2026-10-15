import { ManualClock } from '@portojs/core';
import type { JsonValue } from '@portojs/core';
import { Resource } from '@portojs/idle';
import { Component, Game } from '@portojs/runtime';
import { describe, expect, it } from 'vitest';
import { fastForward, findComponent, inspectGame, setComponentState } from '../src/index.ts';

class Counter extends Component {
  static override typeId = 'Counter';
  value = 0;

  override fixedUpdate(): void {
    this.value += 1;
  }

  override onSave(): JsonValue {
    return { value: this.value };
  }

  override onLoad(data?: unknown): void {
    this.value =
      typeof data === 'object' && data !== null && 'value' in data ? Number(data.value) : 0;
  }
}

class Plain extends Component {}

function make() {
  const game = new Game({ clock: new ManualClock(0), stepMs: 100 });
  const counter = game.createObject('Counter').addComponent(Counter);
  const gold = game.createObject('Gold').addComponent(Resource, { initial: 5 });
  const parent = game.find('Counter');
  const child = game.createObject('Child', parent === undefined ? {} : { parent });
  child.addComponent(Plain);
  child.setActive(false);
  return { game, counter, gold };
}

describe('inspectGame', () => {
  it('describes the tree with states and flags', () => {
    const { game, counter } = make();
    game.advance(300);
    const info = inspectGame(game);
    expect(info.tickCount).toBe(3);
    expect(info.running).toBe(false);
    expect(info.objects.map((object) => object.name)).toEqual(['Counter', 'Gold']);
    const first = info.objects[0];
    expect(first?.components[0]).toMatchObject({
      type: 'Counter',
      state: { value: counter.value },
      editable: true,
      active: true,
    });
    const child = first?.children[0];
    expect(child?.active).toBe(false);
    expect(child?.components[0]).toMatchObject({ type: 'Plain', editable: false, active: false });
    expect(child?.components[0]?.state).toBeUndefined();
  });
});

describe('editing and time travel', () => {
  it('finds components and overwrites their state', () => {
    const { game, counter } = make();
    expect(findComponent(game, 'Counter', 'Counter')).toBe(counter);
    expect(findComponent(game, 'Missing', 'Counter')).toBeUndefined();
    expect(findComponent(game, 'Counter', 'Nope')).toBeUndefined();
    setComponentState(counter, { value: 42 });
    expect(counter.value).toBe(42);
    const bare = game.find('Child')?.components[0];
    expect(() => setComponentState(bare as Component, 1)).toThrow(TypeError);
  });

  it('fast-forwards by steps or as away time', () => {
    const { game, counter, gold } = make();
    fastForward(game, 1000);
    expect(counter.value).toBe(10);
    const before = gold.amount.toNumber();
    fastForward(game, 3_600_000, 'offline');
    expect(gold.amount.toNumber()).toBeGreaterThanOrEqual(before);
  });
});
