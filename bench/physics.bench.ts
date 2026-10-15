import { Bench } from 'tinybench';
import { ManualClock } from '@portojs/core';
import { PhysicsWorld, RigidBody2D, loadRapier } from '@portojs/physics';
import { Game } from '@portojs/runtime';

const COUNTS = [500, 2000] as const;
const rapier = await loadRapier();

function makeScene(count: number): Game {
  const game = new Game({ clock: new ManualClock(0), stepMs: 16 });
  game.createObject('Physics').addComponent(PhysicsWorld, { rapier });
  game.createObject('Floor').addComponent(RigidBody2D, {
    type: 'fixed',
    shape: { kind: 'box', width: 400, height: 2 },
    y: 40,
  });
  for (let i = 0; i < count; i++) {
    game.createObject(`Ball${i}`).addComponent(RigidBody2D, {
      shape: { kind: 'circle', radius: 0.4 },
      x: (i % 100) - 50,
      y: Math.floor(i / 100) * -1.2,
      restitution: 0.3,
    });
  }
  game.advance(2000);
  return game;
}

const bench = new Bench({ time: 1000, warmupTime: 200 });
for (const count of COUNTS) {
  const game = makeScene(count);
  bench.add(`physics: one 16 ms step with ${count} circles (Rapier WebAssembly)`, () => {
    game.advance(16);
  });
}

await bench.run();
console.table(
  bench.tasks.map((task) => {
    const stats = task.result;
    if (!('latency' in stats)) return { task: task.name, 'mean (ms)': 'n/a' };
    return { task: task.name, 'mean (ms)': Number(stats.latency.mean.toFixed(3)) };
  }),
);
