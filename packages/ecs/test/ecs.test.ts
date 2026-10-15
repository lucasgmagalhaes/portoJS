import { ManualClock } from '@portojs/core';
import { Game } from '@portojs/runtime';
import { describe, expect, it } from 'vitest';
import { EcsWorld, World, defineComponent, not } from '../src/index.ts';

const Position = defineComponent({ x: 'f32', y: 'f32' });
const Velocity = defineComponent({ vx: 'f32', vy: 'f32' });
const Frozen = defineComponent({ flag: 'u8' });

describe('World entities', () => {
  it('creates, destroys and recycles ids', () => {
    const world = new World({ capacity: 4 });
    const a = world.createEntity();
    const b = world.createEntity();
    expect([a, b]).toEqual([0, 1]);
    expect(world.size).toBe(2);
    world.destroyEntity(a);
    expect(world.isAlive(a)).toBe(false);
    expect(world.isAlive(b)).toBe(true);
    expect(world.size).toBe(1);
    expect(world.createEntity()).toBe(a);
    world.destroyEntity(99);
    world.destroyEntity(a);
    world.destroyEntity(a);
    expect(world.size).toBe(1);
  });

  it('throws at capacity and on bad options', () => {
    const world = new World({ capacity: 1 });
    world.createEntity();
    expect(() => world.createEntity()).toThrow(RangeError);
    expect(() => new World({ capacity: 0 })).toThrow(RangeError);
    expect(() => new World({ maxComponents: 0 })).toThrow(RangeError);
  });

  it('limits the number of component types', () => {
    const world = new World({ maxComponents: 1 });
    world.use(Position);
    expect(() => world.use(Velocity)).toThrow(/more than 1 component types/);
  });
});

describe('World components', () => {
  it('stores data in typed arrays and resets it on add', () => {
    const world = new World();
    const pos = world.use(Position);
    const e = world.createEntity();
    world.addComponent(e, Position, { x: 3, y: 4 });
    expect(pos.x[e]).toBe(3);
    expect(pos.y[e]).toBe(4);
    expect(pos.x).toBeInstanceOf(Float32Array);
    world.addComponent(e, Position, { x: 9 });
    expect(pos.x[e]).toBe(9);
    expect(pos.y[e]).toBe(0);
  });

  it('adds, checks and removes components', () => {
    const world = new World();
    const e = world.createEntity();
    expect(world.hasComponent(e, Position)).toBe(false);
    world.addComponent(e, Position);
    expect(world.hasComponent(e, Position)).toBe(true);
    world.removeComponent(e, Position);
    world.removeComponent(e, Position);
    world.removeComponent(e, Velocity);
    expect(world.hasComponent(e, Position)).toBe(false);
    world.destroyEntity(e);
    expect(world.hasComponent(e, Position)).toBe(false);
    world.removeComponent(e, Position);
  });

  it('rejects components on dead entities', () => {
    const world = new World();
    expect(() => world.addComponent(0, Position)).toThrow(/not alive/);
  });

  it('clears components when an id is recycled', () => {
    const world = new World();
    const e = world.createEntity();
    world.addComponent(e, Position);
    world.destroyEntity(e);
    const again = world.createEntity();
    expect(again).toBe(e);
    expect(world.hasComponent(again, Position)).toBe(false);
  });

  it('supports more than 32 component types', () => {
    const world = new World({ maxComponents: 40 });
    const many = Array.from({ length: 40 }, () => defineComponent({ v: 'u8' }));
    const e = world.createEntity();
    for (const def of many) world.addComponent(e, def, { v: 1 });
    for (const def of many) expect(world.hasComponent(e, def)).toBe(true);
    const gone = many[35] as (typeof many)[number];
    const kept = many[34] as (typeof many)[number];
    world.removeComponent(e, gone);
    expect(world.hasComponent(e, gone)).toBe(false);
    expect(world.hasComponent(e, kept)).toBe(true);
  });
});

describe('queries and systems', () => {
  it('matches include and exclude terms and refreshes on change', () => {
    const world = new World();
    const a = world.createEntity();
    const b = world.createEntity();
    const c = world.createEntity();
    world.addComponent(a, Position);
    world.addComponent(a, Velocity);
    world.addComponent(b, Position);
    world.addComponent(c, Position);
    world.addComponent(c, Velocity);
    world.addComponent(c, Frozen);

    const moving = world.query(Position, Velocity, not(Frozen));
    expect(moving.entities).toEqual([a]);
    expect(world.query(Velocity, Position, not(Frozen))).toBe(moving);
    world.removeComponent(c, Frozen);
    expect(moving.entities).toEqual([a, c]);
    world.destroyEntity(a);
    expect(moving.entities).toEqual([c]);
    expect(world.query(Position).entities).toEqual([b, c]);
  });

  it('runs systems in order each update and can remove them', () => {
    const world = new World();
    const pos = world.use(Position);
    const vel = world.use(Velocity);
    const e = world.createEntity();
    world.addComponent(e, Position);
    world.addComponent(e, Velocity, { vx: 2, vy: 0 });
    const moving = world.query(Position, Velocity);
    const log: string[] = [];

    function move(_world: World, dt: number): void {
      for (const entity of moving.entities) {
        pos.x[entity] = (pos.x[entity] ?? 0) + (vel.vx[entity] ?? 0) * dt;
      }
      log.push('move');
    }
    function report(): void {
      log.push('report');
    }
    world.addSystem(report, { order: 1 });
    const removeMove = world.addSystem(move, { order: 0 });
    world.update(0.5);
    expect(pos.x[e]).toBe(1);
    expect(log).toEqual(['move', 'report']);
    removeMove();
    world.update(0.5);
    expect(pos.x[e]).toBe(1);
    expect(log).toEqual(['move', 'report', 'report']);
  });
});

describe('EcsWorld component', () => {
  it('runs systems on the fixed step of a game', () => {
    const game = new Game({ clock: new ManualClock(0), stepMs: 100 });
    const ecs = game.createObject('Ecs').addComponent(EcsWorld, { capacity: 8 });
    let total = 0;
    function accumulate(_world: World, dt: number): void {
      total += dt;
    }
    ecs.world.addSystem(accumulate);
    game.advance(1000);
    expect(total).toBeCloseTo(1, 9);
    ecs.gameObject.setActive(false);
    game.advance(1000);
    expect(total).toBeCloseTo(1, 9);
  });

  it('handles tens of thousands of entities', () => {
    const world = new World({ capacity: 50_000 });
    const pos = world.use(Position);
    const vel = world.use(Velocity);
    for (let i = 0; i < 50_000; i++) {
      const e = world.createEntity();
      world.addComponent(e, Position, { x: i });
      world.addComponent(e, Velocity, { vx: 1 });
    }
    const moving = world.query(Position, Velocity);
    expect(moving.entities).toHaveLength(50_000);
    for (const e of moving.entities) pos.x[e] = (pos.x[e] ?? 0) + (vel.vx[e] ?? 0);
    expect(pos.x[49_999]).toBe(50_000);
  });
});
