import { Game, ManualClock } from 'portojs';
import { PhysicsWorld, RigidBody2D, loadRapier } from '@portojs/physics';

/**
 * Step 1: load Rapier once, then add a physics world to the game.
 */
export async function createBouncingBall() {
  const rapier = await loadRapier();
  const clock = new ManualClock(0);
  const game = new Game({ clock, stepMs: 20 });
  const physics = game.createObject('Physics').addComponent(PhysicsWorld, { rapier });

  const floor = game.createObject('Floor').addComponent(RigidBody2D, {
    type: 'fixed',
    shape: { kind: 'box', width: 20, height: 1 },
    y: 5,
    restitution: 0.9,
  });

  const ball = game.createObject('Ball').addComponent(RigidBody2D, {
    shape: { kind: 'circle', radius: 0.5 },
    y: 0,
    restitution: 0.9,
  });

  return { game, physics, floor, ball };
}

/**
 * Step 2: react to collisions and read positions after each step.
 */
export async function dropTheBall(seconds = 3) {
  const { game, ball } = await createBouncingBall();
  let bounces = 0;
  ball.collisionStarted.addListener(() => {
    bounces += 1;
  });
  let lowest = Number.NEGATIVE_INFINITY;
  for (let step = 0; step < (seconds * 1000) / 20; step++) {
    game.advance(20);
    lowest = Math.max(lowest, ball.y);
  }
  return { bounces, lowest, finalY: ball.y };
}
