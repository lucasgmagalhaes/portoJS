import { Bench } from 'tinybench';
import { ParticleEmitter, SpriteBatch } from '@portojs/render';

const COUNT = 50_000;

const emitter = new ParticleEmitter({
  texture: { id: 1, width: 16, height: 16 },
  max: COUNT,
  lifetime: 1e9,
  speed: [10, 100],
  gravity: { x: 0, y: 50 },
  size: { start: 8, end: 2 },
  color: { start: 0xffd800ff, end: 0xff300000 },
});
emitter.burst(COUNT);
const batch = new SpriteBatch(COUNT);

const bench = new Bench({ time: 1000, warmupTime: 200 });
bench.add(`particles: update ${COUNT} by 16 ms`, () => {
  emitter.update(0.016);
});
bench.add(`particles: draw ${COUNT} into a batch`, () => {
  batch.clear();
  emitter.draw(batch);
});

await bench.run();

console.log(`\nparticle benchmarks (Node ${process.version})\n`);
console.table(
  bench.tasks.map((task) => {
    const stats = task.result;
    if (!('latency' in stats)) return { task: task.name, 'mean (ms)': 'n/a' };
    return { task: task.name, 'mean (ms)': Number(stats.latency.mean.toFixed(3)) };
  }),
);
