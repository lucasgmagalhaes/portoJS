import { CoyoteTime, InputBuffer } from '@portojs/input';
import { solidRects } from '@portojs/tilemap';
import type { SolidRect, TileMapView } from '@portojs/tilemap';
import { SPIKE_GID, TILE } from './level.ts';

/**
 * What the player asks for in one frame.
 */
export interface PlatformerInput {
  /**
   * `-1` left, `1` right.
   */
  axis: number;
  /**
   * The jump button went down this frame.
   */
  jumpPressed: boolean;
  /**
   * The jump button is held.
   */
  jumpHeld: boolean;
}

const WIDTH = 12;
const HEIGHT = 14;
const RUN_SPEED = 130;
const ACCELERATION = 900;
const GRAVITY = 1100;
const JUMP_SPEED = 380;
const CUT_JUMP = 0.45;
const MAX_FALL = 520;

/**
 * A platformer on a Tiled map. The ground comes from `solidRects`, which merges the solid tiles
 * into a few rectangles, and the feel comes from the two usual forgiveness tricks: coyote time
 * (a jump still works for a moment after walking off a ledge) and a jump buffer (a jump pressed
 * just before landing still happens). Releasing the button early cuts the jump short.
 *
 * Time is passed in explicitly, so the same input gives the same run every time.
 */
export class Platformer {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  onGround = false;
  facing = 1;
  coins = 0;
  deaths = 0;
  won = false;
  time = 0;
  readonly width = WIDTH;
  readonly height = HEIGHT;
  readonly walls: readonly SolidRect[];
  readonly collected = new Set<number>();
  private readonly coyote = new CoyoteTime(0.1);
  private readonly buffer = new InputBuffer(0.12);
  private readonly start: { x: number; y: number };

  constructor(private readonly view: TileMapView) {
    this.walls = solidRects(view, 'ground', 'solid');
    const spawn = this.objects('start')[0];
    this.start = { x: (spawn?.x ?? 0) + TILE / 2 - WIDTH / 2, y: (spawn?.y ?? 0) + TILE - HEIGHT };
    this.respawn();
  }

  /**
   * The map objects of a kind (`coin`, `start`, `goal`).
   */
  objects(kind: string): { id: number; x: number; y: number }[] {
    const found: { id: number; x: number; y: number }[] = [];
    for (const layer of this.view.map.layers) {
      if (layer.kind !== 'objects') continue;
      for (const object of layer.objects) {
        if (object.type === kind) found.push({ id: object.id, x: object.x, y: object.y });
      }
    }
    return found;
  }

  /**
   * Puts the player back at the start.
   */
  respawn(): void {
    this.x = this.start.x;
    this.y = this.start.y;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
  }

  /**
   * Advances the game by `dt` seconds.
   */
  step(dt: number, input: PlatformerInput): void {
    if (this.won) return;
    this.time += dt;
    if (input.jumpPressed) this.buffer.press(this.time);
    this.run(dt, input.axis);
    this.jump(input);
    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
    this.moveX(this.vx * dt);
    this.moveY(this.vy * dt);
    if (this.onGround) this.coyote.touch(this.time);
    this.touchThings();
  }

  private run(dt: number, axis: number): void {
    const target = axis * RUN_SPEED;
    const change = ACCELERATION * dt;
    this.vx += Math.max(-change, Math.min(change, target - this.vx));
    if (axis !== 0) this.facing = Math.sign(axis);
  }

  private jump(input: PlatformerInput): void {
    if (this.buffer.has(this.time) && this.coyote.allows(this.time)) {
      this.buffer.clear();
      this.coyote.spend();
      this.vy = -JUMP_SPEED;
      this.onGround = false;
    }
    if (!input.jumpHeld && this.vy < 0) this.vy *= CUT_JUMP;
  }

  private moveX(dx: number): void {
    this.x += dx;
    for (const wall of this.walls) {
      if (!this.overlaps(wall)) continue;
      this.x = dx > 0 ? wall.x - this.width : wall.x + wall.width;
      this.vx = 0;
    }
  }

  private moveY(dy: number): void {
    this.y += dy;
    this.onGround = false;
    for (const wall of this.walls) {
      if (!this.overlaps(wall)) continue;
      if (dy > 0) {
        this.y = wall.y - this.height;
        this.onGround = true;
      } else {
        this.y = wall.y + wall.height;
      }
      this.vy = 0;
    }
  }

  private overlaps(rect: SolidRect): boolean {
    return (
      this.x < rect.x + rect.width &&
      this.x + this.width > rect.x &&
      this.y < rect.y + rect.height &&
      this.y + this.height > rect.y
    );
  }

  private touchThings(): void {
    const map = this.view.map;
    if (this.y > map.height * TILE + 64 || this.touchesSpikes()) {
      this.deaths += 1;
      this.respawn();
      return;
    }
    for (const coin of this.objects('coin')) {
      if (this.collected.has(coin.id)) continue;
      if (this.hits(coin.x, coin.y, TILE, TILE)) {
        this.collected.add(coin.id);
        this.coins += 1;
      }
    }
    const goal = this.objects('goal')[0];
    if (goal && this.hits(goal.x, goal.y, TILE, TILE)) this.won = true;
  }

  private touchesSpikes(): boolean {
    const left = Math.floor((this.x + 1) / TILE);
    const right = Math.floor((this.x + this.width - 1) / TILE);
    const top = Math.floor((this.y + 1) / TILE);
    const bottom = Math.floor((this.y + this.height - 1) / TILE);
    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        if (this.view.tileAt('ground', tx, ty) === SPIKE_GID) return true;
      }
    }
    return false;
  }

  private hits(x: number, y: number, width: number, height: number): boolean {
    return (
      this.x < x + width && this.x + this.width > x && this.y < y + height && this.y + this.height > y
    );
  }
}
