import { describe, expect, it } from 'vitest';
import { ManualClock, SaveCorruptedError, createCore, createSave } from '../src/core/index.js';
import { achievements } from '../src/mechanics/achievements/index.js';
import { RESOURCES_PLUGIN, resources } from '../src/mechanics/resources/index.js';
import type { ResourcesApi } from '../src/mechanics/resources/index.js';

type Api = ResourcesApi<'gold', 'miner', never>;

function build(checkIntervalMs?: number) {
  const clock = new ManualClock(0);
  const effects: string[] = [];
  const game = createCore({
    clock,
    plugins: [
      resources({
        resources: { gold: { initial: 0 } },
        generators: {
          miner: { cost: { resource: 'gold', base: 10, growth: 1 }, produces: 'gold', rate: 1 },
        },
      }),
      achievements({
        context: (kernel) => kernel.require<Api>(RESOURCES_PLUGIN),
        ...(checkIntervalMs === undefined ? {} : { checkIntervalMs }),
        definitions: {
          rich: {
            condition: (g) => g.amount('gold').gte(100),
            effect: (g) => {
              effects.push('rich');
              g.setModifier('rich-bonus', { all: true }, 2);
            },
          },
          miners: { condition: (g) => g.bought('miner').gte(3) },
        },
      }),
    ],
  });
  return { clock, game, effects };
}

describe('achievements', () => {
  it('unlocks when a condition becomes true, on the next check', () => {
    const { clock, game } = build(1000);
    const seen: string[] = [];
    game.on('achievementUnlocked', (e) => seen.push(e.id));
    expect(game.hasAchievement('rich')).toBe(false);
    game.add('gold', 150);
    clock.advance(500);
    game.update();
    expect(game.hasAchievement('rich')).toBe(false); // interval not reached yet
    clock.advance(600);
    game.update();
    expect(game.hasAchievement('rich')).toBe(true);
    expect(seen).toEqual(['rich']);
  });

  it('checkAchievements evaluates immediately and returns the new ids', () => {
    const { game } = build();
    game.add('gold', 1000);
    game.buy('miner', 3);
    expect(game.checkAchievements().sort()).toEqual(['miners', 'rich']);
    expect(game.checkAchievements()).toEqual([]);
    expect(game.achievementIds).toEqual(['rich', 'miners']);
  });

  it('never unlocks twice and never relocks', () => {
    const { game, effects } = build();
    game.add('gold', 150);
    game.checkAchievements();
    game.resetRun();
    game.checkAchievements();
    expect(game.hasAchievement('rich')).toBe(true);
    expect(effects).toEqual(['rich']);
  });

  it('reports unlock order and times', () => {
    const { clock, game } = build();
    game.add('gold', 1000);
    game.checkAchievements();
    clock.advance(5000);
    game.buy('miner', 3);
    game.checkAchievements();
    expect(game.unlockedAchievements()).toEqual(['rich', 'miners']);
    expect(game.achievementUnlockedAt('miners')).toBe(5000);
    expect(game.achievementUnlockedAt('rich')).toBe(0);
  });

  it('runs effects on unlock, and again when a save is loaded', () => {
    const a = build();
    a.game.add('gold', 150);
    a.game.checkAchievements();
    expect(a.game.multiplier({ all: true }).toNumber()).toBe(2);
    const save = JSON.parse(JSON.stringify(a.game.save()));

    const b = build();
    expect(b.game.multiplier({ all: true }).toNumber()).toBe(1);
    b.game.load(save, { offline: false });
    expect(b.game.hasAchievement('rich')).toBe(true);
    expect(b.game.multiplier({ all: true }).toNumber()).toBe(2);
    expect(b.effects).toEqual(['rich']);
  });

  it('rejects corrupted data and bad options', () => {
    const { game } = build();
    expect(() =>
      game.load(createSave(1, 0, { achievements: { rich: 'x' } }), { offline: false }),
    ).toThrow(SaveCorruptedError);
    expect(() => game.load(createSave(1, 0, { achievements: 5 }), { offline: false })).toThrow(
      SaveCorruptedError,
    );
    expect(() => build(0)).toThrow(RangeError);
  });

  it('resets on core reset()', () => {
    const { game } = build();
    game.add('gold', 150);
    game.checkAchievements();
    game.reset();
    expect(game.hasAchievement('rich')).toBe(false);
  });
});
