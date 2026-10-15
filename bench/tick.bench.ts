import { Bench } from 'tinybench';
import { Game, Generator, ManualClock, Resource } from '../src/index.js';

const COUNT = 10_000;
const RESOURCE_NAMES = ['gold', 'gems', 'wood', 'iron'] as const;

function makeGame(chained: boolean) {
  const game = new Game({ clock: new ManualClock(0) });
  const resources: Resource[] = [];
  for (const name of RESOURCE_NAMES) {
    const initial = name === 'gold' ? '1e30' : 0;
    resources.push(game.createObject(name).addComponent(Resource, { initial }));
  }
  const gold = resources[0] as Resource;
  const generators: Generator[] = new Array<Generator>(COUNT);
  for (let i = COUNT - 1; i >= 0; i--) {
    const next = generators[i + 1];
    const feeds = chained && i % 10 !== 9 && next !== undefined ? next : undefined;
    generators[i] = game.createObject(`g${i}`).addComponent(Generator, {
      cost: { resource: gold, base: 10 + i, growth: 1.05 },
      produces: feeds ?? (resources[i % resources.length] as Resource),
      rate: 1 + (i % 7),
      initial: 1 + (i % 5),
    });
  }
  return { game, generators };
}

const flat = makeGame(false);
const chained = makeGame(true);
const target = flat.generators[42] as Generator;

const bench = new Bench({ time: 1000, warmupTime: 200 });
bench
  .add(`tick: one 100 ms step, ${COUNT} generators feeding resources`, () => {
    flat.game.advance(100);
  })
  .add(`tick: one 100 ms step, ${COUNT} generators in chained tiers`, () => {
    chained.game.advance(100);
  })
  .add(`tick: one second of game time (10 steps), ${COUNT} generators`, () => {
    flat.game.advance(1000);
  })
  .add('offline: 24 h, closed form (flat)', () => {
    flat.game.simulateOffline(24 * 3_600_000);
  })
  .add('offline: 24 h, closed form (chained tiers)', () => {
    chained.game.simulateOffline(24 * 3_600_000);
  })
  .add('buy: max of one generator', () => {
    target.buy('max');
  })
  .add('save()', () => {
    flat.game.save();
  })
  .add('exportSave() (JSON + checksum + base64)', () => {
    flat.game.exportSave();
  });

await bench.run();

console.log(`\nportojs benchmarks, ${COUNT} generators (Node ${process.version})\n`);
console.table(
  bench.tasks.map((task) => {
    const stats = task.result;
    if (!('latency' in stats)) {
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
