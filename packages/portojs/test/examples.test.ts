import { describe, expect, it } from 'vitest';
import { BULLET, ENEMY, SHIP, Shooter } from '../../../examples/shooter/src/game.ts';

function count(game: Shooter, team: number): number {
  let found = 0;
  for (const entity of game.bodies.entities) {
    if (game.body.team[entity] === team) found += 1;
  }
  return found;
}

function run(game: Shooter, seconds: number): void {
  for (let i = 0; i < seconds * 60; i++) game.step(1 / 60);
}

describe('example: shooter', () => {
  it('starts with a ship and moves it inside the screen', () => {
    const game = new Shooter({ seed: 1 });
    expect(count(game, SHIP)).toBe(1);
    game.input.x = 1;
    run(game, 5);
    expect(game.motion.x[game.ship]).toBe(game.width - 14);
    game.input.x = -1;
    game.input.y = -1;
    run(game, 10);
    expect(game.motion.x[game.ship]).toBe(14);
    expect(game.motion.y[game.ship]).toBe(14);
  });

  it('fires two bullets at a time, limited by the cooldown, and clears them off screen', () => {
    const game = new Shooter({ seed: 1 });
    game.input.fire = true;
    game.step(1 / 60);
    expect(count(game, BULLET)).toBe(2);
    game.step(1 / 60);
    expect(count(game, BULLET)).toBe(2);
    game.input.fire = false;
    run(game, 2);
    expect(count(game, BULLET)).toBe(0);
  });

  it('spawns enemies, scores kills and reports explosions', () => {
    const game = new Shooter({ seed: 3 });
    game.input.fire = true;
    let exploded = 0;
    for (let i = 0; i < 60 * 40 && !game.over; i++) {
      game.input.x = Math.sin(i / 40);
      game.step(1 / 60);
      exploded += game.explosions.length;
    }
    expect(game.score).toBeGreaterThan(0);
    expect(exploded).toBeGreaterThan(0);
  });

  it('loses lives on contact, blinks briefly, and ends the game', () => {
    const game = new Shooter({ seed: 5 });
    let lives = game.lives;
    let seenProtection = false;
    for (let i = 0; i < 60 * 120 && !game.over; i++) {
      game.step(1 / 60);
      if (game.lives < lives) {
        lives = game.lives;
        seenProtection ||= game.protection > 0 || game.over;
      }
    }
    expect(game.over).toBe(true);
    expect(game.lives).toBe(0);
    expect(seenProtection).toBe(true);
    const before = game.score;
    game.step(1);
    expect(game.score).toBe(before);
  });

  it('is deterministic for a seed and different across seeds', () => {
    const play = (seed: number): number[] => {
      const game = new Shooter({ seed });
      game.input.fire = true;
      run(game, 20);
      return [game.score, game.lives, game.world.size, count(game, ENEMY)];
    };
    expect(play(9)).toEqual(play(9));
    expect(play(9)).not.toEqual(play(10));
  });

  it('restarts clean', () => {
    const game = new Shooter({ seed: 5 });
    game.input.fire = true;
    run(game, 120);
    game.restart();
    expect(game.over).toBe(false);
    expect([game.score, game.lives, game.wave]).toEqual([0, 3, 1]);
    expect(game.world.size).toBe(1);
    expect(count(game, SHIP)).toBe(1);
  });
});
