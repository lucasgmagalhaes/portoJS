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
