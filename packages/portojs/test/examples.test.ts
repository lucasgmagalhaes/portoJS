import { TileMapView } from '@portojs/tilemap';
import { describe, expect, it } from 'vitest';
import { Puzzle } from '../../../examples/puzzle/src/game.ts';
import { Platformer } from '../../../examples/platformer/src/game.ts';
import type { PlatformerInput } from '../../../examples/platformer/src/game.ts';
import { LEVEL, TILE, loadLevel } from '../../../examples/platformer/src/level.ts';
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

describe('example: platformer', () => {
  const idle: PlatformerInput = { axis: 0, jumpPressed: false, jumpHeld: false };

  function make(rows: readonly string[] = LEVEL): Platformer {
    const map = loadLevel(rows);
    const view = new TileMapView(map, new Map([['tiles', { id: 1, width: 64, height: 16 }]]));
    return new Platformer(view);
  }

  function run(game: Platformer, seconds: number, input: PlatformerInput = idle): void {
    for (let i = 0; i < seconds * 60; i++) game.step(1 / 60, input);
  }

  it('reads the level: a start, a goal and coins', () => {
    const game = make();
    expect(game.objects('start')).toHaveLength(1);
    expect(game.objects('goal')).toHaveLength(1);
    expect(game.objects('coin').length).toBe(LEVEL.join('').split('o').length - 1);
    expect(game.walls.length).toBeLessThan(LEVEL.join('').split('#').length - 1);
  });

  it('falls onto the ground and stays there', () => {
    const game = make();
    run(game, 1);
    expect(game.onGround).toBe(true);
    expect(game.y + game.height).toBe(10 * TILE);
    expect(game.vy).toBe(0);
  });

  it('runs right until a wall stops it', () => {
    const game = make(['.....', '.@.#.', '#####']);
    run(game, 1);
    run(game, 2, { axis: 1, jumpPressed: false, jumpHeld: false });
    expect(game.x + game.width).toBe(3 * TILE);
  });

  it('jumps higher while the button is held than when it is released early', () => {
    const peak = (hold: boolean): number => {
      const game = make();
      run(game, 1);
      const ground = game.y;
      game.step(1 / 60, { axis: 0, jumpPressed: true, jumpHeld: true });
      let top = game.y;
      for (let i = 0; i < 120; i++) {
        game.step(1 / 60, { axis: 0, jumpPressed: false, jumpHeld: hold });
        top = Math.min(top, game.y);
      }
      return ground - top;
    };
    expect(peak(true)).toBeGreaterThan(40);
    expect(peak(false)).toBeLessThan(peak(true) / 2);
  });

  it('still jumps shortly after walking off a ledge (coyote time) but not long after', () => {
    const ledge = ['.........', '.@.......', '###......'];
    const attempt = (waitFrames: number): boolean => {
      const game = make(ledge);
      run(game, 1);
      let frames = 0;
      while (game.onGround && frames < 600) {
        game.step(1 / 60, { axis: 1, jumpPressed: false, jumpHeld: false });
        frames += 1;
      }
      for (let i = 0; i < waitFrames; i++) game.step(1 / 60, idle);
      game.step(1 / 60, { axis: 0, jumpPressed: true, jumpHeld: true });
      return game.vy < 0;
    };
    expect(attempt(3)).toBe(true);
    expect(attempt(20)).toBe(false);
  });

  it('remembers a jump pressed just before landing (jump buffer)', () => {
    const game = make(['.....', '.@...', '.....', '.....', '.....', '#####']);
    run(game, 0.2);
    expect(game.onGround).toBe(false);
    game.step(1 / 60, { axis: 0, jumpPressed: true, jumpHeld: true });
    let jumped = false;
    for (let i = 0; i < 40; i++) {
      game.step(1 / 60, { axis: 0, jumpPressed: false, jumpHeld: true });
      if (game.vy < 0) jumped = true;
    }
    expect(jumped).toBe(true);
  });

  it('collects each coin once', () => {
    const game = make(['.....', '.@o..', '#####']);
    run(game, 0.5);
    run(game, 1, { axis: 1, jumpPressed: false, jumpHeld: false });
    expect(game.coins).toBe(1);
    run(game, 1, { axis: -1, jumpPressed: false, jumpHeld: false });
    run(game, 1, { axis: 1, jumpPressed: false, jumpHeld: false });
    expect(game.coins).toBe(1);
  });

  it('respawns on spikes and when falling out of the world', () => {
    const spikes = make(['.....', '.@^..', '#####']);
    const start = spikes.x;
    for (let i = 0; i < 120 && spikes.deaths === 0; i++) {
      spikes.step(1 / 60, { axis: 1, jumpPressed: false, jumpHeld: false });
    }
    expect(spikes.deaths).toBe(1);
    expect(spikes.x).toBe(start);
    const pit = make(['.....', '.@...', '#...#']);
    run(pit, 0.2);
    run(pit, 3, { axis: 1, jumpPressed: false, jumpHeld: false });
    expect(pit.deaths).toBeGreaterThanOrEqual(1);
  });

  it('wins at the goal and then stops', () => {
    const game = make(['.....', '.@G..', '#####']);
    run(game, 1, { axis: 1, jumpPressed: false, jumpHeld: false });
    expect(game.won).toBe(true);
    const time = game.time;
    game.step(1, idle);
    expect(game.time).toBe(time);
  });
});

describe('example: puzzle', () => {
  function board(rows: number[][]): Puzzle {
    const game = new Puzzle({ seed: 1 });
    game.load({
      size: 4,
      cells: rows.flat(),
      score: 0,
      best: 0,
      rng: game.save().rng,
    });
    return game;
  }

  const values = (game: Puzzle): number[] => game.cells.filter((v) => v !== 0).sort((a, b) => a - b);

  it('starts with two tiles', () => {
    const game = new Puzzle({ seed: 3 });
    expect(game.cells.filter((v) => v !== 0)).toHaveLength(2);
  });

  it('merges equal neighbours once per move and scores them', () => {
    const game = board([
      [2, 2, 2, 2],
      [4, 4, 8, 0],
      [0, 0, 0, 0],
      [2, 0, 0, 2],
    ]);
    const result = game.move('left');
    expect(result.moved).toBe(true);
    expect([0, 1, 2, 3].map((x) => game.at(x, 0))).toEqual([4, 4, 0, 0]);
    expect([0, 1, 2].map((x) => game.at(x, 1))).toEqual([8, 8, 0]);
    expect(game.at(0, 3)).toBe(4);
    expect(result.gained).toBe(4 + 4 + 8 + 4);
    expect(game.score).toBe(20);
    expect(result.spawned).toBeDefined();
  });

  it('moves in every direction', () => {
    const rows = [
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    const right = board(rows);
    right.move('right');
    expect(right.at(3, 0)).toBe(2);
    const down = board(rows);
    down.move('down');
    expect(down.at(0, 3)).toBe(2);
    const up = board([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 4, 0, 0]]);
    up.move('up');
    expect(up.at(1, 0)).toBe(4);
  });

  it('ignores a move that changes nothing', () => {
    const game = board([
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const before = game.save();
    expect(game.move('left').moved).toBe(false);
    expect(game.move('up').moved).toBe(false);
    expect(game.save()).toEqual(before);
    expect(game.canUndo).toBe(false);
  });

  it('detects the end only when nothing can move or merge', () => {
    const stuck = board([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    expect(stuck.over).toBe(true);
    const mergeable = board([
      [2, 2, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    expect(mergeable.over).toBe(false);
  });

  it('undo restores the board, the score and the same random future', () => {
    const game = new Puzzle({ seed: 11 });
    const start = game.save();
    const directions = ['left', 'up', 'right', 'down'] as const;
    const direction = directions.find((d) => new Puzzle({ seed: 11 }).move(d).moved) ?? 'left';
    expect(game.move(direction).moved).toBe(true);
    expect(game.canUndo).toBe(true);
    expect(game.undo()).toBe(true);
    expect(game.cells).toEqual(start.cells);
    expect(game.score).toBe(start.score);
    expect(game.undo()).toBe(false);
    const replay = game.move(direction);
    const reference = new Puzzle({ seed: 11 }).move(direction);
    expect(replay).toEqual(reference);
    expect(values(game).length).toBeGreaterThan(1);
  });

  it('saves and resumes into an identical game', () => {
    const game = new Puzzle({ seed: 7 });
    const moves = ['left', 'up', 'right', 'down'] as const;
    for (let i = 0; i < 20; i++) game.move(moves[i % 4] ?? 'left');
    const copy = new Puzzle({ seed: 99 });
    copy.load(JSON.parse(JSON.stringify(game.save())) as ReturnType<Puzzle['save']>);
    for (let i = 0; i < 30; i++) {
      const direction = moves[(i * 3) % 4] ?? 'left';
      expect(copy.move(direction)).toEqual(game.move(direction));
    }
    expect(copy.cells).toEqual(game.cells);
    expect(() => new Puzzle({ size: 5 }).load(game.save())).toThrow(RangeError);
  });

  it('keeps the best score across restarts', () => {
    const game = new Puzzle({ seed: 2 });
    for (let i = 0; i < 40 && !game.over; i++) game.move((['left', 'down', 'right', 'up'] as const)[i % 4] ?? 'left');
    const best = game.best;
    game.restart();
    expect(game.score).toBe(0);
    expect(game.best).toBe(best);
    expect(game.canUndo).toBe(false);
  });
});
