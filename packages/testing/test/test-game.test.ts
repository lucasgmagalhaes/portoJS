import { Generator, Resource } from '@portojs/idle';
import { Component } from '@portojs/runtime';
import { describe, expect, it } from 'vitest';
import { createTestGame } from '../src/index.ts';

class Counter extends Component {
  static override typeId = 'Counter';
  steps = 0;

  override fixedUpdate(): void {
    this.steps += 1;
  }

  override onSave(): number {
    return this.steps;
  }

  override onLoad(data?: unknown): void {
    this.steps = typeof data === 'number' ? data : 0;
  }
}

function idleGame() {
  const test = createTestGame({ offline: { maxMs: 3_600_000, efficiency: 0.5 } });
  const gold = test.game.createObject('Gold').addComponent(Resource);
  test.game.createObject('Miner').addComponent(Generator, {
    cost: { resource: gold, base: 10, growth: 1.15 },
    produces: gold,
    rate: 1,
    initial: 1,
  });
  return { ...test, gold };
}

describe('createTestGame', () => {
  it('never runs by itself and starts with a fake clock at 0', () => {
    const { game, clock } = createTestGame();
    expect(game.running).toBe(false);
    expect(clock.now()).toBe(0);
  });

  it('tick runs fixed steps', () => {
    const { game, tick } = createTestGame({ stepMs: 50 });
    const counter = game.createObject('C').addComponent(Counter);
    expect(tick()).toBe(1);
    expect(tick(4)).toBe(4);
    expect(counter.steps).toBe(5);
  });

  it('elapse moves the clock and runs the loop from it', () => {
    const { game, clock, elapse } = createTestGame({ stepMs: 100 });
    const counter = game.createObject('C').addComponent(Counter);
    expect(elapse(350)).toBe(3);
    expect(clock.now()).toBe(350);
    expect(counter.steps).toBe(3);
    expect(elapse(50)).toBe(1);
  });

  it('advance plays game time without the clock', () => {
    const { game, clock, advance } = createTestGame({ stepMs: 100 });
    const counter = game.createObject('C').addComponent(Counter);
    advance(1000);
    expect(counter.steps).toBe(10);
    expect(clock.now()).toBe(0);
  });

  it('leaveAndReturn credits capped, scaled offline time', () => {
    const { gold, leaveAndReturn } = idleGame();
    const report = leaveAndReturn(2 * 3_600_000);
    expect(report).toMatchObject({ elapsedMs: 7_200_000, appliedMs: 1_800_000, status: 'capped' });
    expect(gold.amount.toNumber()).toBeCloseTo(1800, 6);
  });

  it('runUntil plays until the condition holds or the timeout passes', () => {
    const { gold, runUntil, game } = idleGame();
    expect(runUntil(() => gold.amount.gte(5))).toBe(true);
    expect(gold.amount.toNumber()).toBeGreaterThanOrEqual(5);
    expect(game.time.time).toBeLessThan(6);
    expect(runUntil(() => false, 1000)).toBe(false);
  });
});
