import { Bench } from 'tinybench';
import { World, defineComponent } from '@portojs/ecs';
import { SpriteBatch, Transform, createSpriteSystem, spawnSprite } from '@portojs/render';
import type { Texture } from '@portojs/render';

const COUNTS = [10_000, 50_000] as const;
const Velocity = defineComponent({ vx: 'f32', vy: 'f32' });

const atlas: Texture = { id: 1, width: 16, height: 16 };
const other: Texture = { id: 2, width: 16, height: 16 };
const textures = new Map([
  [atlas.id, atlas],
  [other.id, other],
]);

function makeScene(count: number) {
  const world = new World({ capacity: count });
  const transform = world.use(Transform);
  const velocity = world.use(Velocity);
  for (let i = 0; i < count; i++) {
    const entity = spawnSprite(world, i % 2 === 0 ? atlas : other, { x: i % 1000, y: i % 777 });
    world.addComponent(entity, Velocity, { vx: 1, vy: -1 });
  }
  const moving = world.query(Transform, Velocity);
  function move(_world: World, dt: number): void {
    for (const e of moving.entities) {
      transform.x[e] = (transform.x[e] ?? 0) + (velocity.vx[e] ?? 0) * dt;
      transform.y[e] = (transform.y[e] ?? 0) + (velocity.vy[e] ?? 0) * dt;
    }
  }
  const batch = new SpriteBatch(count);
  world.addSystem(move);
  world.addSystem(createSpriteSystem(world, textures, batch), { order: 100 });
  return { world, batch };
}

const bench = new Bench({ time: 1000, warmupTime: 200 });
for (const count of COUNTS) {
  const { world, batch } = makeScene(count);
  bench.add(`ecs: move system + sprite collection, ${count} entities`, () => {
    world.update(0.016);
  });
  bench.add(`batch: build ${count} instances into draw groups`, () => {
    batch.build();
  });
}

await bench.run();
console.table(
  bench.tasks.map((task) => ({
    task: task.name,
    'mean (ms)': task.result ? Number(task.result.latency.mean.toFixed(3)) : 0,
  })),
);
