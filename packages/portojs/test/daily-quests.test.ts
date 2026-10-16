import { describe, expect, it } from 'vitest';
import {
  DailyQuests,
  Game,
  ManualClock,
  Resource,
  SaveCorruptedError,
  createSave,
} from '../src/index.ts';
import type { DailyQuestDefinition, DailyQuestsOptions } from '../src/index.ts';

const DAY = 86_400_000;

function pool(gold?: Resource): DailyQuestDefinition[] {
  return ['a', 'b', 'c', 'd', 'e'].map((id, index) => ({
    id,
    description: `Quest ${id}`,
    target: 3 + index,
    reward: () => gold?.add(10 * (index + 1)),
  }));
}

function make(options: Partial<DailyQuestsOptions> = {}, day = 100) {
  const clock = new ManualClock(day * DAY + 1000);
  const game = new Game({ clock });
  const gold = game.createObject('Gold').addComponent(Resource);
  const daily = game
    .createObject('Daily')
    .addComponent(DailyQuests, { pool: pool(gold), count: 3, ...options });
  return { clock, game, gold, daily };
}

const ids = (daily: DailyQuests): string[] => daily.quests.map((q) => q.definition.id);

describe('the daily draw', () => {
  it('picks the configured number of different quests', () => {
    const { daily } = make();
    const picked = ids(daily);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
  });

  it('is the same for the same day and seed, on any device', () => {
    expect(ids(make().daily)).toEqual(ids(make().daily));
    expect(ids(make({ seed: 7 }).daily)).toEqual(ids(make({ seed: 7 }).daily));
  });

  it('changes from day to day, and with the seed', () => {
    const days = new Set<string>();
    for (let day = 100; day < 130; day++) days.add(ids(make({}, day).daily).join(','));
    expect(days.size).toBeGreaterThan(5);
    const seeds = new Set<string>();
    for (let seed = 0; seed < 20; seed++) seeds.add(ids(make({ seed }).daily).join(','));
    expect(seeds.size).toBeGreaterThan(3);
  });

  it('favours heavier quests', () => {
    let heavy = 0;
    const weighted: DailyQuestDefinition[] = [
      { id: 'heavy', target: 1, weight: 20 },
      { id: 'x', target: 1 },
      { id: 'y', target: 1 },
      { id: 'z', target: 1 },
    ];
    for (let day = 0; day < 200; day++) {
      const { daily } = make({ pool: weighted, count: 1 }, day);
      if (ids(daily)[0] === 'heavy') heavy += 1;
    }
    expect(heavy).toBeGreaterThan(120);
  });

  it('draws new quests when the day changes, and says so', () => {
    const { daily, clock } = make();
    const first = ids(daily);
    let drawn = 0;
    daily.refreshed.addListener(() => drawn++);
    clock.advance(DAY);
    expect(daily.refresh()).toBe(true);
    expect(daily.refresh()).toBe(false);
    expect(drawn).toBe(1);
    expect(daily.day).toBe(101);
    expect(ids(daily)).not.toEqual(first);
  });

  it('refreshes by itself as the game runs', () => {
    const { daily, clock, game } = make();
    void daily.quests;
    let drawn = 0;
    daily.refreshed.addListener(() => drawn++);
    clock.advance(DAY);
    game.advance(1500);
    expect(drawn).toBe(1);
  });

  it('counts down to the reset', () => {
    const { daily } = make();
    expect(daily.msUntilReset).toBe(DAY - 1000);
  });
});

describe('progress and rewards', () => {
  it('adds progress up to the target and reports completion once', () => {
    const { daily } = make();
    const [first] = daily.quests;
    const id = first?.definition.id ?? '';
    const target = first?.definition.target ?? 0;
    const done: string[] = [];
    daily.completed.addListener((q) => done.push(q.definition.id));
    expect(daily.add(id, target - 1)).toBe(true);
    expect(daily.quests[0]).toMatchObject({ progress: target - 1, complete: false });
    daily.add(id);
    daily.add(id, 100);
    expect(daily.quests[0]).toMatchObject({ progress: target, complete: true });
    expect(done).toEqual([id]);
  });

  it('ignores a quest that was not drawn and rejects bad amounts', () => {
    const { daily } = make();
    const missing = 'abcde'.split('').find((id) => !ids(daily).includes(id)) ?? 'a';
    expect(daily.add(missing)).toBe(false);
    expect(daily.add('nope')).toBe(false);
    expect(() => daily.add('a', -1)).toThrow(RangeError);
    expect(() => daily.add('a', NaN)).toThrow(RangeError);
  });

  it('claims a completed quest once and pays its reward', () => {
    const { daily, gold } = make();
    const quest = daily.quests[0];
    const id = quest?.definition.id ?? '';
    expect(daily.claim(id)).toBe(false);
    daily.add(id, 100);
    const claimed: string[] = [];
    daily.claimed.addListener((q) => claimed.push(q.definition.id));
    expect(daily.claim(id)).toBe(true);
    expect(daily.claim(id)).toBe(false);
    expect(claimed).toEqual([id]);
    expect(gold.amount.toNumber()).toBeGreaterThan(0);
    expect(daily.claim('nope')).toBe(false);
  });

  it('claims every completed quest at once', () => {
    const { daily } = make();
    for (const quest of daily.quests.slice(0, 2)) daily.add(quest.definition.id, 100);
    expect(daily.claimAll()).toBe(2);
    expect(daily.claimAll()).toBe(0);
  });
});

describe('saving', () => {
  it('keeps progress and claims during the day', () => {
    const a = make();
    const [first, second] = a.daily.quests;
    a.daily.add(first?.definition.id ?? '', 100);
    a.daily.claim(first?.definition.id ?? '');
    a.daily.add(second?.definition.id ?? '', 1);
    const save = a.game.save();
    const b = make();
    b.game.load(save, { offline: false });
    expect(b.daily.quests.map((q) => [q.definition.id, q.progress, q.claimed])).toEqual(
      a.daily.quests.map((q) => [q.definition.id, q.progress, q.claimed]),
    );
  });

  it('draws fresh quests for a save made on an earlier day', () => {
    const a = make();
    a.daily.add(ids(a.daily)[0] ?? '', 2);
    const save = a.game.save();
    const b = make({}, 105);
    b.game.load(save, { offline: false });
    expect(b.daily.day).toBe(105);
    expect(b.daily.quests.every((q) => q.progress === 0 && !q.claimed)).toBe(true);
  });

  it('drops quests that left the pool and rejects broken entries', () => {
    const a = make();
    const save = a.game.save();
    const smaller = make({ pool: pool().slice(0, 1), count: 1 });
    expect(() => smaller.game.load(save, { offline: false })).not.toThrow();
    const bad = createSave(1, 0, {
      objects: { Daily: { DailyQuests: { day: 100, quests: [['a']] } } },
    });
    expect(() => a.game.load(bad, { offline: false })).toThrow(SaveCorruptedError);
    const worse = createSave(1, 0, { objects: { Daily: { DailyQuests: 4 } } });
    expect(() => a.game.load(worse, { offline: false })).toThrow(SaveCorruptedError);
  });

  it('starts fresh after a reset', () => {
    const { daily, game } = make();
    daily.add(ids(daily)[0] ?? '', 2);
    game.reset();
    expect(daily.quests.every((q) => q.progress === 0)).toBe(true);
  });
});

describe('options', () => {
  it('validates the pool and the count', () => {
    const game = new Game({ clock: new ManualClock(0) });
    const add = (options: DailyQuestsOptions) => () =>
      game.createObject(`D${Math.random()}`).addComponent(DailyQuests, options);
    expect(add({ pool: [] })).toThrow(RangeError);
    expect(add({ pool: pool(), count: 0 })).toThrow(RangeError);
    expect(add({ pool: pool(), count: 6 })).toThrow(RangeError);
    expect(
      add({
        pool: [
          { id: 'a', target: 1 },
          { id: 'a', target: 1 },
        ],
      }),
    ).toThrow(/duplicate/);
    expect(add({ pool: [{ id: 'a', target: 0 }] })).toThrow(RangeError);
    expect(add({ pool: [{ id: 'a', target: 1, weight: 0 }] })).toThrow(RangeError);
  });

  it('defaults to three quests, or fewer for a small pool', () => {
    const game = new Game({ clock: new ManualClock(0) });
    const big = game.createObject('Big').addComponent(DailyQuests, { pool: pool() });
    const small = game
      .createObject('Small')
      .addComponent(DailyQuests, { pool: [{ id: 'only', target: 1 }] });
    expect(big.quests).toHaveLength(3);
    expect(small.quests).toHaveLength(1);
  });
});
