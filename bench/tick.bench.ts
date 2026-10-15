import { Bench } from 'tinybench';
import { ManualClock, createGame } from '../src/index.js';
import type { GeneratorDef } from '../src/index.js';

const COUNT = 10_000;
const RESOURCES = ['gold', 'gems', 'wood', 'iron'] as const;
type ResourceId = (typeof RESOURCES)[number];

function makeGame(chained: boolean) {
  const generators: Record<string, GeneratorDef<ResourceId, string>> = {};
  for (let i = 0; i < COUNT; i++) {
    const feeds = chained && i % 10 !== 9 ? { generator: `g${i + 1}` } : undefined;
    generators[`g${i}`] = {
      cost: { resource: 'gold', base: 10 + i, growth: 1.05 },
      produces: feeds ?? (RESOURCES[i % RESOURCES.length] as ResourceId),
      rate: 1 + (i % 7),
      initial: 1 + (i % 5),
    };
  }
  return createGame({
    clock: new ManualClock(0),
    resources: { gold: { initial: '1e30' }, gems: {}, wood: {}, iron: {} },
    generators,
  });
}

const flat = makeGame(false);
const chained = makeGame(true);

const bench = new Bench({ time: 1000, warmupTime: 200 });
bench
  .add(`tick: one 100 ms step, ${COUNT} generators feeding resources`, () => {
    flat.advance(100);
  })
  .add(`tick: one 100 ms step, ${COUNT} generators in chained tiers`, () => {
    chained.advance(100);
  })
  .add(`tick: one second of game time (10 steps), ${COUNT} generators`, () => {
    flat.advance(1000);
  })
  .add('offline: 24 h, closed form (flat)', () => {
    flat.simulateOffline(24 * 3_600_000);
  })
  .add('offline: 24 h, closed form (chained tiers)', () => {
    chained.simulateOffline(24 * 3_600_000);
  })
  .add('buy: max of one generator', () => {
    flat.buy('g42', 'max');
  })
  .add('save()', () => {
    flat.save();
  })
  .add('exportSave() (JSON + checksum + base64)', () => {
    flat.exportSave();
  });

await bench.run();

console.log(`\nleveling benchmarks, ${COUNT} generators (Node ${process.version})\n`);
console.table(
  bench.tasks.map((task) => {
    const stats = task.result;
    if (stats === undefined || !('latency' in stats)) {
      return { task: task.name, 'ops/s': 'n/a', 'mean (ms)': 'n/a', 'p99 (ms)': 'n/a' };
    }
    return {
      task: task.name,
      'ops/s': Math.round(stats.throughput.mean),
      'mean (ms)': Number(stats.latency.mean.toFixed(4)),
      'p99 (ms)': Number(stats.latency.p99.toFixed(4)),
    };
  }),
);
