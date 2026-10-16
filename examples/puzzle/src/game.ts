import { Rng } from '@portojs/math';
import type { RngState } from '@portojs/math';

export type Direction = 'left' | 'right' | 'up' | 'down';

/**
 * A tile that slid: where it was, where it ended, and whether it merged with another there.
 */
export interface Slide {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly value: number;
  readonly merged: boolean;
}

/**
 * What a move did, for animating it.
 */
export interface MoveResult {
  readonly moved: boolean;
  readonly slides: readonly Slide[];
  readonly spawned: { readonly x: number; readonly y: number; readonly value: number } | undefined;
  readonly gained: number;
}

/**
 * A saved position, small enough to put in a save file.
 */
export interface PuzzleState {
  readonly size: number;
  readonly cells: readonly number[];
  readonly score: number;
  readonly best: number;
  readonly rng: RngState;
}

interface Snapshot {
  readonly cells: number[];
  readonly score: number;
  readonly rng: RngState;
}

const VECTORS: Record<Direction, readonly [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

/**
 * The 2048 board. Everything random (where a tile appears, whether it is a 2 or a 4) comes from
 * a seeded generator whose state is saved, so a game can be replayed, saved and resumed, and
 * undo brings back the exact same future.
 *
 * @example
 * const game = new Puzzle({ seed: 5 });
 * game.move('left');
 */
export class Puzzle {
  readonly size: number;
  cells: number[];
  score = 0;
  best = 0;
  private rng: Rng;
  private readonly history: Snapshot[] = [];

  constructor(options: { size?: number; seed?: number } = {}) {
    this.size = options.size ?? 4;
    this.cells = new Array<number>(this.size * this.size).fill(0);
    this.rng = new Rng(options.seed ?? 1);
    this.spawn();
    this.spawn();
  }

  /**
   * The value at a cell, `0` when empty.
   */
  at(x: number, y: number): number {
    return this.cells[y * this.size + x] ?? 0;
  }

  /**
   * Moves can be undone.
   */
  get canUndo(): boolean {
    return this.history.length > 0;
  }

  /**
   * No move changes the board.
   */
  get over(): boolean {
    for (const direction of Object.keys(VECTORS) as Direction[]) {
      if (this.plan(direction).moved) return false;
    }
    return true;
  }

  /**
   * The biggest tile.
   */
  get highest(): number {
    return Math.max(...this.cells);
  }

  /**
   * Slides every tile as far as it goes, merging equal neighbours once per move, then adds a
   * new tile. Does nothing (and records nothing) when the move changes nothing.
   */
  move(direction: Direction): MoveResult {
    const plan = this.plan(direction);
    if (!plan.moved) return { moved: false, slides: [], spawned: undefined, gained: 0 };
    this.history.push({ cells: [...this.cells], score: this.score, rng: this.rng.state() });
    if (this.history.length > 50) this.history.shift();
    this.cells = plan.cells;
    this.score += plan.gained;
    this.best = Math.max(this.best, this.score);
    return { moved: true, slides: plan.slides, spawned: this.spawn(), gained: plan.gained };
  }

  /**
   * Takes back the last move, including the random tile it added.
   */
  undo(): boolean {
    const last = this.history.pop();
    if (last === undefined) return false;
    this.cells = last.cells;
    this.score = last.score;
    this.rng = Rng.fromState(last.rng);
    return true;
  }

  /**
   * Starts a new game, keeping the best score.
   */
  restart(): void {
    this.cells.fill(0);
    this.score = 0;
    this.history.length = 0;
    this.spawn();
    this.spawn();
  }

  /**
   * Everything needed to resume, as plain data.
   */
  save(): PuzzleState {
    return {
      size: this.size,
      cells: [...this.cells],
      score: this.score,
      best: this.best,
      rng: this.rng.state(),
    };
  }

  /**
   * Resumes a saved position (undo history starts empty).
   *
   * @throws {RangeError} if the data does not fit this board.
   */
  load(state: PuzzleState): void {
    if (state.size !== this.size || state.cells.length !== this.cells.length) {
      throw new RangeError('Puzzle.load: the saved board has another size');
    }
    this.cells = [...state.cells];
    this.score = state.score;
    this.best = state.best;
    this.rng = Rng.fromState(state.rng);
    this.history.length = 0;
  }

  private spawn(): MoveResult['spawned'] {
    const empty: number[] = [];
    for (const [index, value] of this.cells.entries()) {
      if (value === 0) empty.push(index);
    }
    if (empty.length === 0) return undefined;
    const index = empty[this.rng.int(0, empty.length - 1)] ?? 0;
    const value = this.rng.chance(0.1) ? 4 : 2;
    this.cells[index] = value;
    return { x: index % this.size, y: Math.floor(index / this.size), value };
  }

  private plan(direction: Direction): {
    moved: boolean;
    cells: number[];
    slides: Slide[];
    gained: number;
  } {
    const [dx, dy] = VECTORS[direction];
    const n = this.size;
    const cells = new Array<number>(n * n).fill(0);
    const slides: Slide[] = [];
    let gained = 0;
    let moved = false;
    for (let line = 0; line < n; line++) {
      const stop: { x: number; y: number }[] = [];
      for (let step = 0; step < n; step++) {
        const x = dx === 0 ? line : dx > 0 ? n - 1 - step : step;
        const y = dy === 0 ? line : dy > 0 ? n - 1 - step : step;
        stop.push({ x, y });
      }
      let write = 0;
      let last: { value: number; slot: number } | undefined;
      for (const from of stop) {
        const value = this.at(from.x, from.y);
        if (value === 0) continue;
        let slot = write;
        let merged = false;
        if (last !== undefined && last.value === value) {
          slot = last.slot;
          merged = true;
          const to = stop[slot] ?? from;
          cells[to.y * n + to.x] = value * 2;
          gained += value * 2;
          last = undefined;
        } else {
          const to = stop[slot] ?? from;
          cells[to.y * n + to.x] = value;
          last = { value, slot };
          write += 1;
        }
        const to = stop[slot] ?? from;
        slides.push({ fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, value, merged });
        if (to.x !== from.x || to.y !== from.y) moved = true;
      }
    }
    return { moved, cells, slides, gained };
  }
}
