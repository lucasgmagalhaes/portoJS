import { Bench } from 'tinybench';
import { Tweens } from '@portojs/tween';

const COUNT = 10_000;

function makeTweens(): Tweens {
  const tweens = new Tweens();
  for (let i = 0; i < COUNT; i++) {
    tweens.to(
      { x: 0, y: 0, alpha: 1 },
      { x: 100 + i, y: 50, alpha: 0 },
      { duration: 1e9, ease: 'cubicInOut' },
    );
  }
  return tweens;
}

const tweens = makeTweens();
const bench = new Bench({ time: 1000, warmupTime: 200 });
bench.add(`tween: update ${COUNT} tweens of 3 properties by 16 ms`, () => {
  tweens.update(0.016);
});

await bench.run();

console.log(`\ntween benchmarks (Node ${process.version})\n`);
console.table(
  bench.tasks.map((task) => {
    const stats = task.result;
    if (!('latency' in stats)) return { task: task.name, 'mean (ms)': 'n/a' };
    return { task: task.name, 'mean (ms)': Number(stats.latency.mean.toFixed(3)) };
  }),
);
