import { describe, expect, it } from 'vitest';
import { dropTheBall } from '../../../docs/tutorials/code/bouncing-ball.ts';
import { createHello, playAndSave } from '../../../docs/tutorials/code/hello.ts';
import { createIdleGame, label, playSession } from '../../../docs/tutorials/code/idle-game.ts';
import { createFrame, createWorld } from '../../../docs/tutorials/code/sprites.ts';

describe('tutorial: hello game', () => {
  it('ticks, saves and loads', () => {
    const { hpAfterTenSeconds, restoredHp } = playAndSave();
    expect(hpAfterTenSeconds).toBeCloseTo(50, 1);
    expect(restoredHp).toBeCloseTo(hpAfterTenSeconds, 6);
  });

  it('raises the died event when health runs out', () => {
    const { game, clock, health } = createHello();
    let died = 0;
    health.died.addListener(() => {
      died += 1;
    });
    game.start();
    clock.advance(30_000);
    game.update();
    game.advance(30_000);
    game.dispose();
    expect(health.hp).toBe(0);
    expect(died).toBeGreaterThan(0);
  });
});

describe('tutorial: your first idle game', () => {
  it('builds the game with its generators, upgrade and prestige', () => {
    const { gold, miner, mine, pickaxe, rebirth } = createIdleGame();
    expect(gold.amount.toNumber()).toBe(10);
    expect(miner.buy().toNumber()).toBe(1);
    expect(mine.count.toNumber()).toBe(0);
    expect(pickaxe.level).toBe(0);
    expect(rebirth.canPrestige).toBeDefined();
  });

  it('formats numbers for players', () => {
    expect(label('1.5e12')).toBe('1.5T');
    expect(label(999)).toBe('999');
  });

  it('plays, leaves and comes back with offline gains', () => {
    const session = playSession();
    expect(session.minersOwned).toBeGreaterThan(5);
    expect(session.pickaxeLevel).toBeGreaterThan(0);
    expect(session.beforeLeaving).not.toBe('0');
    expect(session.afterReturning).not.toBe(session.beforeLeaving);
  });
});

describe('tutorial: a sprite game', () => {
  const texture = { id: 1, width: 4, height: 4 };

  it('moves sprites with a system and batches them into one draw', () => {
    const world = createWorld(texture, 500);
    const batch = createFrame(world, texture);
    world.update(0.5);
    const result = batch.build();
    expect(result.count).toBe(500);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.count).toBe(500);
    const first = result.data[0];
    expect(first).toBeCloseTo(10, 3);
  });
});

describe('tutorial: a bouncing ball', () => {
  it('falls, bounces off the floor and reports collisions', async () => {
    const { bounces, lowest, finalY } = await dropTheBall(3);
    expect(bounces).toBeGreaterThanOrEqual(1);
    expect(lowest).toBeGreaterThan(3.9);
    expect(lowest).toBeLessThan(4.2);
    expect(finalY).toBeLessThan(4.2);
  });
});
