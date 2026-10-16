import { World, defineComponent } from '@portojs/ecs';
import type { Store , Query} from '@portojs/ecs';
import { Rng } from '@portojs/math';

/**
 * Where something is and how fast it moves, in world units (pixels) per second.
 */
export const Motion = defineComponent({ x: 'f32', y: 'f32', vx: 'f32', vy: 'f32' });

/**
 * What something is: `team` 0 is the ship, 1 a bullet, 2 an enemy. Bodies are circles.
 */
export const Body = defineComponent({ team: 'u8', radius: 'f32', hp: 'f32' });

export const SHIP = 0;
export const BULLET = 1;
export const ENEMY = 2;

/**
 * What the player is asking for this frame: a direction (each axis -1 to 1) and the fire button.
 */
export interface ShooterInput {
  x: number;
  y: number;
  fire: boolean;
}

/**
 * Something blew up at a place; the renderer turns these into particles.
 */
export interface Explosion {
  readonly x: number;
  readonly y: number;
  readonly big: boolean;
}

/**
 * Options of {@link Shooter}.
 */
export interface ShooterOptions {
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
}

const SHIP_SPEED = 320;
const BULLET_SPEED = 620;
const FIRE_INTERVAL = 0.18;
const INVULNERABLE_SECONDS = 1.5;

/**
 * A vertical shooter on top of the ECS. The simulation knows nothing about drawing: it fills
 * typed arrays and lists explosions, so it runs the same in a test, in a worker or in a browser.
 * Everything random comes from one seeded generator, so a run can be replayed exactly.
 *
 * @example
 * const game = new Shooter({ seed: 7 });
 * game.input.fire = true;
 * game.step(1 / 60);
 * for (const entity of game.bodies.entities) draw(game.motion.x[entity], game.motion.y[entity]);
 */
export class Shooter {
  readonly world: World;
  readonly width: number;
  readonly height: number;
  readonly input: ShooterInput = { x: 0, y: 0, fire: false };
  readonly explosions: Explosion[] = [];
  readonly motion: Store<typeof Motion.schema>;
  readonly body: Store<typeof Body.schema>;
  readonly bodies: Query;
  ship = 0;
  score = 0;
  lives = 3;
  wave = 1;
  over = false;
  private readonly rng: Rng;
  private cooldown = 0;
  private spawnTimer = 1;
  private invulnerable = 0;
  private killsInWave = 0;

  constructor(options: ShooterOptions = {}) {
    this.width = options.width ?? 480;
    this.height = options.height ?? 720;
    this.rng = new Rng(options.seed ?? 1);
    this.world = new World({ capacity: 2048 });
    this.motion = this.world.use(Motion);
    this.body = this.world.use(Body);
    this.bodies = this.world.query(Motion, Body);
    this.ship = this.spawnShip();
  }

  /**
   * Seconds of protection left after losing a life; the ship blinks while it runs.
   */
  get protection(): number {
    return this.invulnerable;
  }

  /**
   * Advances the game by `dt` seconds. Does nothing once the game is over.
   */
  step(dt: number): void {
    if (this.over) return;
    this.explosions.length = 0;
    this.steer(dt);
    this.shoot(dt);
    this.spawn(dt);
    this.move(dt);
    this.collide();
    this.invulnerable = Math.max(0, this.invulnerable - dt);
  }

  /**
   * Starts over with the same generator state continuing (a new run differs from the last).
   */
  restart(): void {
    for (const entity of [...this.bodies.entities]) this.world.destroyEntity(entity);
    this.ship = this.spawnShip();
    this.score = 0;
    this.lives = 3;
    this.wave = 1;
    this.killsInWave = 0;
    this.over = false;
    this.cooldown = 0;
    this.spawnTimer = 1;
    this.invulnerable = 0;
  }

  private spawnShip(): number {
    const entity = this.world.createEntity();
    this.world.addComponent(entity, Motion, { x: this.width / 2, y: this.height - 80 });
    this.world.addComponent(entity, Body, { team: SHIP, radius: 14, hp: 1 });
    return entity;
  }

  private steer(dt: number): void {
    const { x, y } = this.input;
    const length = Math.hypot(x, y) || 1;
    const scale = Math.min(1, Math.hypot(x, y)) / length;
    const mx = this.motion.x;
    const my = this.motion.y;
    const ship = this.ship;
    mx[ship] = clamp((mx[ship] ?? 0) + x * scale * SHIP_SPEED * dt, 14, this.width - 14);
    my[ship] = clamp((my[ship] ?? 0) + y * scale * SHIP_SPEED * dt, 14, this.height - 14);
  }

  private shoot(dt: number): void {
    this.cooldown -= dt;
    if (!this.input.fire || this.cooldown > 0) return;
    this.cooldown = FIRE_INTERVAL;
    const x = this.motion.x[this.ship] ?? 0;
    const y = this.motion.y[this.ship] ?? 0;
    this.spawnBullet(x - 8, y - 12);
    this.spawnBullet(x + 8, y - 12);
  }

  private spawnBullet(x: number, y: number): void {
    const entity = this.world.createEntity();
    this.world.addComponent(entity, Motion, { x, y, vy: -BULLET_SPEED });
    this.world.addComponent(entity, Body, { team: BULLET, radius: 4, hp: 1 });
  }

  private spawn(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = Math.max(0.25, 1.1 - this.wave * 0.08);
    const entity = this.world.createEntity();
    const big = this.rng.chance(0.15);
    this.world.addComponent(entity, Motion, {
      x: this.rng.float(24, this.width - 24),
      y: -24,
      vx: this.rng.float(-50, 50),
      vy: this.rng.float(70, 110) + this.wave * 12,
    });
    this.world.addComponent(entity, Body, {
      team: ENEMY,
      radius: big ? 26 : 14,
      hp: big ? 4 : 1,
    });
  }

  private move(dt: number): void {
    const { x, y, vx, vy } = this.motion;
    for (const entity of [...this.bodies.entities]) {
      x[entity] = (x[entity] ?? 0) + (vx[entity] ?? 0) * dt;
      y[entity] = (y[entity] ?? 0) + (vy[entity] ?? 0) * dt;
      const team = this.body.team[entity];
      if (team === SHIP) continue;
      const px = x[entity] ?? 0;
      const py = y[entity] ?? 0;
      if (team === ENEMY && (px < 0 || px > this.width)) vx[entity] = -(vx[entity] ?? 0);
      if (py < -60 || py > this.height + 60) this.world.destroyEntity(entity);
    }
  }

  private collide(): void {
    const entities = [...this.bodies.entities];
    for (const bullet of entities) {
      if (this.body.team[bullet] !== BULLET || !this.world.isAlive(bullet)) continue;
      for (const enemy of entities) {
        if (this.body.team[enemy] !== ENEMY || !this.world.isAlive(enemy)) continue;
        if (!this.touching(bullet, enemy)) continue;
        this.world.destroyEntity(bullet);
        this.hurt(enemy);
        break;
      }
    }
    if (this.invulnerable > 0) return;
    for (const enemy of entities) {
      if (this.body.team[enemy] !== ENEMY || !this.world.isAlive(enemy)) continue;
      if (!this.touching(this.ship, enemy)) continue;
      this.explode(enemy);
      this.lose();
      return;
    }
  }

  private touching(a: number, b: number): boolean {
    const reach = (this.body.radius[a] ?? 0) + (this.body.radius[b] ?? 0);
    const dx = (this.motion.x[a] ?? 0) - (this.motion.x[b] ?? 0);
    const dy = (this.motion.y[a] ?? 0) - (this.motion.y[b] ?? 0);
    return dx * dx + dy * dy <= reach * reach;
  }

  private hurt(enemy: number): void {
    const hp = (this.body.hp[enemy] ?? 1) - 1;
    this.body.hp[enemy] = hp;
    if (hp > 0) return;
    this.score += (this.body.radius[enemy] ?? 0) > 20 ? 50 : 10;
    this.explode(enemy);
    this.killsInWave += 1;
    if (this.killsInWave >= 10 + this.wave * 2) {
      this.wave += 1;
      this.killsInWave = 0;
    }
  }

  private explode(enemy: number): void {
    this.explosions.push({
      x: this.motion.x[enemy] ?? 0,
      y: this.motion.y[enemy] ?? 0,
      big: (this.body.radius[enemy] ?? 0) > 20,
    });
    this.world.destroyEntity(enemy);
  }

  private lose(): void {
    this.lives -= 1;
    this.explosions.push({
      x: this.motion.x[this.ship] ?? 0,
      y: this.motion.y[this.ship] ?? 0,
      big: true,
    });
    if (this.lives <= 0) {
      this.over = true;
      return;
    }
    this.invulnerable = INVULNERABLE_SECONDS;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
