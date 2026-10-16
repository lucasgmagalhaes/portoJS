import { ManualClock } from '@portojs/core';
import { Game } from '@portojs/runtime';
import { beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld, RigidBody2D, loadRapier } from '../src/index.ts';
import type { Rapier } from '../src/index.ts';

let rapier: Rapier;

beforeAll(async () => {
  rapier = await loadRapier();
});

function setup(gravity?: { x: number; y: number }): { game: Game; physics: PhysicsWorld } {
  const game = new Game({ clock: new ManualClock(0), stepMs: 20 });
  const options = gravity === undefined ? { rapier } : { rapier, gravity };
  const physics = game.createObject('Physics').addComponent(PhysicsWorld, options);
  return { game, physics };
}

describe('PhysicsWorld', () => {
  it('pulls dynamic bodies down and is deterministic', () => {
    const fall = (): number => {
      const { game } = setup();
      const ball = game.createObject('Ball').addComponent(RigidBody2D, {
        shape: { kind: 'circle', radius: 0.5 },
        y: -10,
      });
      game.advance(1000);
      return ball.y;
    };
    const first = fall();
    expect(first).toBeGreaterThan(-10 + 4);
    expect(fall()).toBe(first);
  });

  it('honours custom gravity and reports the body count', () => {
    const { game, physics } = setup({ x: 5, y: 0 });
    const body = game.createObject('Body').addComponent(RigidBody2D, {
      shape: { kind: 'box', width: 1, height: 1 },
    });
    game.advance(1000);
    expect(body.x).toBeGreaterThan(1);
    expect(body.y).toBeCloseTo(0, 5);
    expect(physics.bodyCount).toBe(1);
  });

  it('keeps fixed bodies still and stops a falling ball on them', () => {
    const { game } = setup();
    game.createObject('Floor').addComponent(RigidBody2D, {
      type: 'fixed',
      shape: { kind: 'box', width: 20, height: 1 },
      y: 5,
    });
    const ball = game.createObject('Ball').addComponent(RigidBody2D, {
      shape: { kind: 'circle', radius: 0.5 },
      y: 0,
    });
    game.advance(5000);
    expect(ball.y).toBeGreaterThan(3.9);
    expect(ball.y).toBeLessThan(4.1);
    expect(ball.velocity.y).toBeCloseTo(0, 1);
  });

  it('bounces with restitution', () => {
    const { game } = setup();
    game.createObject('Floor').addComponent(RigidBody2D, {
      type: 'fixed',
      shape: { kind: 'box', width: 20, height: 1 },
      y: 5,
      restitution: 1,
    });
    const ball = game.createObject('Ball').addComponent(RigidBody2D, {
      shape: { kind: 'circle', radius: 0.5 },
      restitution: 1,
    });
    let bounced = false;
    ball.collisionStarted.addListener(() => {
      bounced = true;
    });
    let fastestUp = 0;
    for (let step = 0; step < 100; step++) {
      game.advance(20);
      fastestUp = Math.min(fastestUp, ball.velocity.y);
    }
    expect(bounced).toBe(true);
    expect(fastestUp).toBeLessThan(-1);
  });

  it('raises collision events on the world and on both bodies, then ends them', () => {
    const { game, physics } = setup({ x: 0, y: 0 });
    const left = game.createObject('Left').addComponent(RigidBody2D, {
      shape: { kind: 'circle', radius: 0.5 },
      x: -2,
    });
    const right = game.createObject('Right').addComponent(RigidBody2D, {
      shape: { kind: 'circle', radius: 0.5 },
      x: 2,
    });
    const log: string[] = [];
    physics.collisionStarted.addListener(({ a, b }) => {
      log.push(`world start ${a.gameObject.name}-${b.gameObject.name}`);
    });
    physics.collisionEnded.addListener(() => {
      log.push('world end');
    });
    left.collisionStarted.addListener((other) => log.push(`left saw ${other.gameObject.name}`));
    right.collisionStarted.addListener((other) => log.push(`right saw ${other.gameObject.name}`));
    left.collisionEnded.addListener((other) => log.push(`left lost ${other.gameObject.name}`));
    right.collisionEnded.addListener((other) => log.push(`right lost ${other.gameObject.name}`));

    left.setVelocity(2, 0);
    right.setVelocity(-2, 0);
    game.advance(1000);
    expect(log.filter((line) => line.startsWith('world start'))).toHaveLength(1);
    expect(log).toContain('left saw Right');
    expect(log).toContain('right saw Left');

    left.setVelocity(-4, 0);
    right.setVelocity(4, 0);
    game.advance(2000);
    expect(log).toContain('world end');
    expect(log).toContain('left lost Right');
    expect(log).toContain('right lost Left');
  });

  it('sensors detect overlaps without pushing', () => {
    const { game } = setup({ x: 0, y: 0 });
    const zone = game.createObject('Zone').addComponent(RigidBody2D, {
      type: 'fixed',
      sensor: true,
      shape: { kind: 'box', width: 4, height: 4 },
    });
    const walker = game.createObject('Walker').addComponent(RigidBody2D, {
      shape: { kind: 'circle', radius: 0.25 },
      x: -5,
    });
    let entered = 0;
    zone.collisionStarted.addListener(() => {
      entered += 1;
    });
    walker.setVelocity(5, 0);
    game.advance(2000);
    expect(entered).toBe(1);
    expect(walker.velocity.x).toBeCloseTo(5, 3);
  });

  it('moves kinematic bodies by velocity and teleports with setPosition', () => {
    const { game } = setup();
    const platform = game.createObject('Platform').addComponent(RigidBody2D, {
      type: 'kinematic',
      shape: { kind: 'box', width: 2, height: 0.5 },
    });
    platform.setVelocity(1, 0);
    game.advance(1000);
    expect(platform.x).toBeCloseTo(1, 1);
    platform.setPosition(10, 20, 0.5);
    expect([platform.x, platform.y, platform.rotation]).toEqual([10, 20, 0.5]);
    platform.setPosition(3, 4);
    expect(platform.rotation).toBe(0.5);
  });

  it('applies impulses and the start pose', () => {
    const { game } = setup({ x: 0, y: 0 });
    const body = game.createObject('Body').addComponent(RigidBody2D, {
      shape: { kind: 'box', width: 1, height: 1 },
      x: 3,
      y: 4,
      rotation: 1,
      friction: 0.1,
      density: 2,
    });
    expect([body.x, body.y, body.rotation]).toEqual([3, 4, 1]);
    body.applyImpulse(2, 0);
    expect(body.velocity.x).toBeCloseTo(1, 5);
    game.advance(1000);
    expect(body.x).toBeGreaterThan(3.5);
  });

  it('removes a body when its component is destroyed', () => {
    const { game, physics } = setup({ x: 0, y: 0 });
    const a = game.createObject('A').addComponent(RigidBody2D, {
      shape: { kind: 'circle', radius: 1 },
    });
    const b = game.createObject('B').addComponent(RigidBody2D, {
      shape: { kind: 'circle', radius: 1 },
      x: 0.5,
    });
    let events = 0;
    physics.collisionStarted.addListener(() => {
      events += 1;
    });
    a.destroy();
    game.advance(100);
    expect(physics.bodyCount).toBe(1);
    expect(events).toBe(0);
    b.destroy();
    expect(physics.bodyCount).toBe(0);
  });

  it('requires a PhysicsWorld', () => {
    const game = new Game({ clock: new ManualClock(0) });
    expect(() =>
      game.createObject('Lonely').addComponent(RigidBody2D, {
        shape: { kind: 'circle', radius: 1 },
      }),
    ).toThrow('PhysicsWorld');
  });

  it('frees the Rapier world on destroy', () => {
    const { game, physics } = setup();
    game.createObject('Body').addComponent(RigidBody2D, {
      shape: { kind: 'circle', radius: 1 },
    });
    physics.destroy();
    expect(() => game.advance(100)).not.toThrow();
  });
});

describe('queries and layers', () => {
  function scene(layers?: string[]) {
    const game = new Game({ clock: new ManualClock(0), stepMs: 20 });
    const options = layers === undefined ? { rapier } : { rapier, layers, gravity: { x: 0, y: 0 } };
    const physics = game.createObject('Physics').addComponent(PhysicsWorld, options);
    const box = (
      name: string,
      x: number,
      y: number,
      extra: Partial<ConstructorParameters<typeof RigidBody2D>[1]> = {},
    ) =>
      game.createObject(name).addComponent(RigidBody2D, {
        type: 'fixed',
        shape: { kind: 'box', width: 2, height: 2 },
        x,
        y,
        ...extra,
      });
    return { game, physics, box };
  }

  it('raycasts to the nearest body with point, normal and distance', () => {
    const { game, physics, box } = scene(['a']);
    const near = box('Near', 5, 0);
    box('Far', 10, 0);
    game.advance(20);
    const hit = physics.raycast({ x: 0, y: 0 }, { x: 3, y: 0 }, 100);
    expect(hit?.body).toBe(near);
    expect(hit?.distance).toBeCloseTo(4, 5);
    expect(hit?.point.x).toBeCloseTo(4, 5);
    expect(hit?.normal.x).toBeCloseTo(-1, 5);
    expect(physics.raycast({ x: 0, y: 0 }, { x: 1, y: 0 }, 2)).toBeUndefined();
    expect(physics.raycast({ x: 0, y: 0 }, { x: 0, y: 1 }, 100)).toBeUndefined();
    expect(() => physics.raycast({ x: 0, y: 0 }, { x: 0, y: 0 }, 1)).toThrow(RangeError);
  });

  it('skips sensors unless asked, and the excluded body', () => {
    const { game, physics, box } = scene(['a']);
    const sensor = box('Sensor', 3, 0, { sensor: true });
    const wall = box('Wall', 8, 0);
    game.advance(20);
    expect(physics.raycast({ x: 0, y: 0 }, { x: 1, y: 0 }, 100)?.body).toBe(wall);
    expect(
      physics.raycast({ x: 0, y: 0 }, { x: 1, y: 0 }, 100, { includeSensors: true })?.body,
    ).toBe(sensor);
    expect(physics.raycast({ x: 0, y: 0 }, { x: 1, y: 0 }, 100, { exclude: wall })).toBeUndefined();
  });

  it('filters queries by layer', () => {
    const { game, physics, box } = scene(['ground', 'enemy']);
    const ground = box('Ground', 4, 0, { layer: 'ground' });
    const enemy = box('Enemy', 8, 0, { layer: 'enemy' });
    game.advance(20);
    const origin = { x: 0, y: 0 };
    const right = { x: 1, y: 0 };
    expect(physics.raycast(origin, right, 100)?.body).toBe(ground);
    expect(physics.raycast(origin, right, 100, { layers: ['enemy'] })?.body).toBe(enemy);
    expect(() => physics.raycast(origin, right, 100, { layers: ['nope'] })).toThrow(
      /unknown layer/,
    );
  });

  it('finds bodies overlapping a point, circle and box', () => {
    const { game, physics, box } = scene(['a']);
    const one = box('One', 0, 0);
    const two = box('Two', 3, 0);
    game.advance(20);
    expect(physics.overlapPoint(0.5, 0.5)).toEqual([one]);
    expect(physics.overlapPoint(10, 10)).toEqual([]);
    expect(new Set(physics.overlapCircle(1.5, 0, 1.2))).toEqual(new Set([one, two]));
    expect(physics.overlapBox(3, 0, 1, 1)).toEqual([two]);
    expect(physics.overlapBox(3, 3, 1, 1, Math.PI / 4)).toEqual([]);
    expect(physics.overlapCircle(0, 0, 0.5, { exclude: one })).toEqual([]);
  });

  it('collides only with the layers a body lists', () => {
    const { game, box } = scene(['player', 'enemy', 'coin']);
    const floor = box('Floor', 0, 5, { layer: 'player' });
    const dynamic = (name: string, layer: string, collidesWith: string[]) =>
      game.createObject(name).addComponent(RigidBody2D, {
        shape: { kind: 'circle', radius: 0.5 },
        y: 0,
        layer,
        collidesWith,
      });
    const solid = dynamic('Solid', 'enemy', ['player']);
    const ghost = dynamic('Ghost', 'coin', ['coin']);
    solid.setVelocity(0, 20);
    ghost.setVelocity(0, 20);
    const hits: string[] = [];
    solid.collisionStarted.addListener((other) => hits.push(`solid:${other.gameObject.name}`));
    ghost.collisionStarted.addListener((other) => hits.push(`ghost:${other.gameObject.name}`));
    game.advance(1000);
    expect(hits).toContain(`solid:${floor.gameObject.name}`);
    expect(hits.some((h) => h.startsWith('ghost'))).toBe(false);
    expect(ghost.y).toBeGreaterThan(solid.y);
  });

  it('validates layers', () => {
    const game = new Game({ clock: new ManualClock(0) });
    expect(() =>
      game.createObject('P').addComponent(PhysicsWorld, {
        rapier,
        layers: Array.from({ length: 17 }, (_, i) => `l${i}`),
      }),
    ).toThrow(RangeError);
    const dup = new Game({ clock: new ManualClock(0) });
    expect(() =>
      dup.createObject('P').addComponent(PhysicsWorld, { rapier, layers: ['a', 'a'] }),
    ).toThrow(/duplicate/);
    const { box } = scene(['a']);
    expect(() => box('X', 0, 0, { layer: 'zzz' })).toThrow(/unknown layer/);
  });
});
