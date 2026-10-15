import { ManualClock, SaveCorruptedError } from '@portojs/core';
import { Game } from '@portojs/runtime';
import { describe, expect, it } from 'vitest';
import { Generator, Quest, Resource } from '../src/index.ts';
import type { QuestStep } from '../src/index.ts';

function make(extra: Partial<ConstructorParameters<typeof Quest>[1]> = {}) {
  const clock = new ManualClock(0);
  const game = new Game({ clock, stepMs: 100 });
  const gold = game.createObject('Gold').addComponent(Resource, { initial: 0 });
  const miner = game.createObject('Miner').addComponent(Generator, {
    cost: { resource: gold, base: 1, growth: 1 },
    produces: gold,
    rate: 1,
    initial: 0,
  });
  const log: string[] = [];
  const steps: QuestStep[] = [
    {
      id: 'first',
      condition: () => miner.bought.gte(1),
      reward: () => gold.add(100),
      progress: () => miner.bought.toNumber(),
    },
    { id: 'second', condition: () => miner.bought.gte(3), effect: () => log.push('effect') },
  ];
  const quest = game.createObject('Tutorial').addComponent(Quest, { steps, ...extra });
  return { clock, game, gold, miner, quest, log };
}

function run(clock: ManualClock, game: Game, ms: number): void {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    clock.advance(100);
    game.update();
  }
}

describe('Quest', () => {
  it('claims steps in order and pays the reward once', () => {
    const { gold, miner, quest } = make();
    expect(quest.current?.id).toBe('first');
    expect(quest.canClaim).toBe(false);
    expect(quest.claim()).toBe(false);
    gold.add(5);
    miner.buy(1);
    expect(quest.canClaim).toBe(true);
    const before = gold.amount.toNumber();
    expect(quest.claim()).toBe(true);
    expect(gold.amount.toNumber()).toBe(before + 100);
    expect(quest.index).toBe(1);
    expect(quest.isClaimed('first')).toBe(true);
    expect(quest.isClaimed('second')).toBe(false);
    expect(quest.claim()).toBe(false);
  });

  it('fires ready once, then claimed, then finished', () => {
    const { gold, miner, quest } = make();
    const events: string[] = [];
    quest.ready.addListener((e) => events.push(`ready:${e.step.id}`));
    quest.claimed.addListener((e) => events.push(`claimed:${e.step.id}`));
    quest.finished.addListener(() => events.push('finished'));
    gold.add(10);
    miner.buy(3);
    expect(quest.canClaim).toBe(true);
    expect(quest.canClaim).toBe(true);
    quest.claim();
    quest.claim();
    expect(quest.isFinished).toBe(true);
    expect(quest.current).toBeUndefined();
    expect(quest.progress).toBe(1);
    expect(events).toEqual([
      'ready:first',
      'claimed:first',
      'ready:second',
      'claimed:second',
      'finished',
    ]);
  });

  it('reports the progress of the current step', () => {
    const { gold, miner, quest } = make();
    expect(quest.progress).toBe(0);
    gold.add(5);
    miner.buy(1);
    expect(quest.progress).toBe(1);
  });

  it('auto-claims every ready step', () => {
    const { clock, game, gold, miner, quest } = make({ autoClaim: true });
    gold.add(10);
    miner.buy(3);
    run(clock, game, 600);
    expect(quest.isFinished).toBe(true);
  });

  it('saves the position and restores effects without repeating rewards', () => {
    const a = make();
    a.gold.add(10);
    a.miner.buy(3);
    a.quest.claim();
    a.quest.claim();
    const saved = a.quest.onSave();
    const b = make();
    const before = b.gold.amount.toNumber();
    b.quest.onLoad(saved);
    expect(b.quest.isFinished).toBe(true);
    expect(b.gold.amount.toNumber()).toBe(before);
    expect(b.log).toEqual(['effect']);
  });

  it('rejects bad saves and bad options', () => {
    const { quest, game } = make();
    expect(() => quest.onLoad(7)).toThrow(SaveCorruptedError);
    expect(() => quest.onLoad('x')).toThrow(SaveCorruptedError);
    expect(() => quest.onLoad(-1)).toThrow(SaveCorruptedError);
    expect(() => game.createObject('Empty').addComponent(Quest, { steps: [] })).toThrow(RangeError);
    const dup = [
      { id: 'a', condition: () => true },
      { id: 'a', condition: () => true },
    ];
    expect(() => game.createObject('Dup').addComponent(Quest, { steps: dup })).toThrow(RangeError);
  });
});
