# PortoJS

A headless TypeScript engine for idle and incremental games. It runs in browsers, Node and Electron, has zero runtime dependencies, and solves the parts every idle game ends up rebuilding: **huge numbers, a stable tick loop, trustworthy offline progress, and versioned saves**.

```
pnpm add portojs
```

## Why

Idle games look simple until they are not. Numbers outgrow `Number`. `setInterval` drifts, and background tabs get throttled. Players close the game for a week and expect fair progress, and nobody wants to explain why the system clock moving back gave free gold. Saves change shape between versions and must not silently corrupt.

`portojs` handles those problems once, with tests, so you can focus on the game.

It is also **deliberately game-agnostic**: the core knows about time, ticks, saves and offline progress, and nothing else. Resources, generators, prestige and achievements are plugins on top of it. Use the batteries-included `createGame`, or compose your own mechanics.

## Entry points

```ts
import { createGame } from 'portojs'; // everything
import { BigNum, format } from 'portojs/bignum'; // just the big-number type (~2 KB brotli)
import { createCore, definePlugin } from 'portojs/core'; // the game-agnostic kernel (~5 KB)
import { resources, prestige } from 'portojs/mechanics'; // the built-in plugins
```

All entries share one copy of each class, so `instanceof BigNum` works across them in both ESM and CJS.

## Minimal example

```ts
import { createGame, format } from 'portojs';

const game = createGame({
  resources: { gold: { initial: 10 } },
  generators: {
    miner: { cost: { resource: 'gold', base: 10, growth: 1.15 }, produces: 'gold', rate: 1 },
  },
  offline: { maxMs: 8 * 3_600_000, efficiency: 0.5 }, // cap at 8 h, credit 50%
});

game.on('offline', ({ appliedMs }) =>
  console.log(`Welcome back! +${appliedMs / 1000}s of progress`),
);

const saved = localStorage.getItem('save');
if (saved) game.importSave(saved); // migrates old saves and credits offline time

game.start();
game.buy('miner', 'max'); // or game.buy('miner', 10)
setInterval(() => localStorage.setItem('save', game.exportSave()), 10_000);

game.on('tick', () => {
  console.log(format(game.amount('gold'), { notation: 'suffix' })); // "1.5T"
});
```

## Features

| Area                  | What you get                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Big numbers**       | Immutable `BigNum` (`mantissa × 10^exponent`), exponents up to ~9e15, JSON-serializable, property-tested against doubles    |
| **Formatting**        | Scientific, engineering, suffix (`1.5T`) and custom formatters, with correct rounding carry                                 |
| **Clock**             | Injectable time source, `ManualClock` for tests, protection against the system clock going back or jumping                  |
| **Tick loop**         | Fixed timestep with accumulator, independent of FPS, bounded catch-up for throttled tabs, deterministic with a fake clock   |
| **Resources**         | Resources, generators, bulk buying (`x1`, `x10`, `'max'` in O(1)), upgrades, multipliers and external modifiers             |
| **Cost curves**       | Linear, exponential or fully custom, with closed-form totals and max-affordable                                             |
| **Tiered generators** | Generators can feed other generators (dimension-style chains)                                                               |
| **Offline progress**  | Closed-form (exact for any duration), step-simulation fallback, max offline time, efficiency, safe against clock edge cases |
| **Prestige**          | Plugin: formula-based reward, keep rules, permanent bonuses, prestige-point shop                                            |
| **Achievements**      | Plugin: condition-based, with persistent effects                                                                            |
| **Saves**             | Versioned, chained migrations, Base64 export/import, checksum, corruption detection, atomic load with rollback              |
| **Events**            | Fully typed emitter (`tick`, `purchase`, `prestige`, `offline`, `offlineGains`, `achievementUnlocked`, ...)                 |
| **Plugins**           | Write your own mechanics against a small, typed kernel API                                                                  |
| **Quality**           | Strict TypeScript, no `any`, ESM + CJS + `.d.ts`, unit and property-based tests                                             |

## Performance

Measured with `pnpm bench` on Node 24 with 10,000 generators:

| Operation                                     | Time (mean) |
| --------------------------------------------- | ----------- |
| One 100 ms tick, generators feeding resources | ~0.6 ms     |
| One 100 ms tick, generators in chained tiers  | ~0.8 ms     |
| Offline, 24 h, closed form                    | ~5 ms       |
| Buy "max" of a generator                      | ~0.2 µs     |

Numbers vary by machine; run the benchmark yourself.

## Documentation

Full site (guides, API reference and an in-browser playground): `pnpm docs:dev`. The same content as plain files:

- [Getting started](docs/getting-started.md)
- [Offline progress](docs/offline-progress.md): how away-time is computed, capped and credited
- [Saves and migrations](docs/saves-and-migrations.md): versioning, export/import, corruption handling
- [Prestige](docs/prestige.md): resets, formulas and permanent bonuses
- [Writing plugins](docs/plugins.md): the game-agnostic core and how to extend it
- [Engineering audit and roadmap](docs/roadmap.md): measured state, open findings and the release process
- [Example game](examples/clicker): a small clicker running in the browser (Vite). Run it with `cd examples/clicker && pnpm install && pnpm dev`

## Development

```
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm bench
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- [ ] Auto-buyers and challenge/run modifiers as plugins
- [ ] Time-based unlocks and a generic "unlock" condition system
- [ ] Optional compressed save format
- [ ] Framework bindings (React, Vue, Svelte) as separate packages
- [ ] More cost curves and a cost-curve visualiser for balancing
- [ ] Localisable number suffix sets
- [ ] Off-main-thread simulation (Web Worker helper)
- [ ] Devtools: inspect state, fast-forward time, edit values

## License

[MIT](LICENSE)
