import { ManualClock } from '@portojs/core';
import { Game } from '@portojs/runtime';
import { describe, expect, it } from 'vitest';
import { EcsWorld, SnapshotError, World, defineComponent, not } from '../src/index.ts';

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

describe('World snapshot and restore', () => {
  const Health = defineComponent({ hp: 'u16' });
  const known = { Position, Health };

  function populated(): World {
    const world = new World({ capacity: 16 });
    const a = world.createEntity();
    const b = world.createEntity();
    const c = world.createEntity();
    world.addComponent(a, Position, { x: 1.5, y: -2 });
    world.addComponent(b, Health, { hp: 40 });
    world.addComponent(c, Position, { x: 9, y: 9 });
    world.addComponent(c, Health, { hp: 7 });
    world.destroyEntity(b);
    return world;
  }

  it('captures live entities and their named components as plain JSON', () => {
    const snapshot = populated().snapshot(known);
    expect(snapshot).toEqual({
      entities: [
        { id: 0, components: { Position: [1.5, -2] } },
        { id: 2, components: { Position: [9, 9], Health: [7] } },
      ],
    });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('restores into a fresh world with the same ids, data and free ids', () => {
    const snapshot = populated().snapshot(known);
    const world = new World({ capacity: 16 });
    world.restore(snapshot, known);
    expect(world.size).toBe(2);
    expect(world.isAlive(0)).toBe(true);
    expect(world.isAlive(1)).toBe(false);
    expect(world.isAlive(2)).toBe(true);
    expect(world.use(Position).x[2]).toBe(9);
    expect(world.use(Health).hp[2]).toBe(7);
    expect(world.hasComponent(0, Health)).toBe(false);
    expect(world.createEntity()).toBe(1);
    expect(world.createEntity()).toBe(3);
  });

  it('replaces what was there and keeps queries working', () => {
    const world = new World({ capacity: 16 });
    const query = world.query(Position);
    const stale = world.createEntity();
    world.addComponent(stale, Position, { x: 100, y: 100 });
    expect(query.entities).toEqual([0]);
    world.restore(populated().snapshot(known), known);
    expect(query.entities).toEqual([0, 2]);
    expect(world.use(Position).x[0]).toBe(1.5);
  });

  it('saves non-finite values as 0', () => {
    const world = new World({ capacity: 4 });
    const e = world.createEntity();
    world.addComponent(e, Position, { x: Infinity, y: NaN });
    expect(world.snapshot(known).entities[0]?.components['Position']).toEqual([0, 0]);
  });

  it('rejects bad snapshots and leaves the world untouched', () => {
    const world = new World({ capacity: 4 });
    const e = world.createEntity();
    world.addComponent(e, Health, { hp: 5 });
    const bad: unknown[] = [
      null,
      {},
      { entities: [{ id: -1, components: {} }] },
      { entities: [{ id: 4, components: {} }] },
      {
        entities: [
          { id: 0, components: {} },
          { id: 0, components: {} },
        ],
      },
      { entities: [{ id: 0 }] },
      { entities: [{ id: 0, components: { Nope: [1] } }] },
      { entities: [{ id: 0, components: { Position: [1] } }] },
      { entities: [{ id: 0, components: { Position: [1, 'x'] } }] },
    ];
    for (const snapshot of bad) {
      expect(() => world.restore(snapshot, known)).toThrow(SnapshotError);
    }
    expect(world.size).toBe(1);
    expect(world.use(Health).hp[0]).toBe(5);
  });

  it('createEntityAt and clear', () => {
    const world = new World({ capacity: 8 });
    world.createEntityAt(5);
    expect(world.isAlive(5)).toBe(true);
    expect(world.createEntity()).toBe(4);
    world.createEntityAt(2);
    expect(() => world.createEntityAt(2)).toThrow(/already alive/);
    expect(() => world.createEntityAt(8)).toThrow(RangeError);
    expect(() => world.createEntityAt(1.5)).toThrow(RangeError);
    world.clear();
    expect(world.size).toBe(0);
    expect(world.createEntity()).toBe(0);
  });
});
