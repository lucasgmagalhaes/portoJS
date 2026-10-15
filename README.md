# PortoJS

[![CI](https://github.com/lucasgmagalhaes/portoJS/actions/workflows/ci.yml/badge.svg)](https://github.com/lucasgmagalhaes/portoJS/actions/workflows/ci.yml) [![codecov](https://codecov.io/gh/lucasgmagalhaes/portoJS/graph/badge.svg)](https://codecov.io/gh/lucasgmagalhaes/portoJS)

A headless TypeScript game engine with a **Unity-style model**: a `Game` runs a stable fixed-timestep loop, you build it from **game objects** and **components**, and everything is saved, versioned and fast-forwarded for you. Idle and incremental mechanics (big numbers, generators, offline progress, prestige) are components you add only if you want them.

It runs in browsers, Node and Electron, and has zero runtime dependencies.

```
pnpm add portojs
```

## Why

Games that run over time share a lot of plumbing: a loop that does not drift, a clock you can fake in tests, saves that survive version changes, and progress while the player is away. Idle games add numbers that outgrow `Number` and offline gains nobody can exploit.

`portojs` handles that plumbing once, with tests, and stays **game-agnostic**: the core knows about time, components, saves and offline progress, and nothing else. Resources, generators, prestige and achievements live in `portojs/idle`, built on the same public API you use for your own components.

## Minimal example

```ts
import { Game, Generator, Resource, format } from 'portojs';

const game = new Game({ offline: { maxMs: 8 * 3_600_000, efficiency: 0.5 } });

const gold = game.createObject('Gold').addComponent(Resource, { initial: 10 });
const miner = game.createObject('Miner').addComponent(Generator, {
  cost: { resource: gold, base: 10, growth: 1.15 },
  produces: gold,
  rate: 1,
});

const saved = localStorage.getItem('save');
if (saved) game.importSave(saved);

game.start();
miner.buy('max');
setInterval(() => localStorage.setItem('save', game.exportSave()), 10_000);

game.on('tick', () => {
  console.log(format(gold.amount, { notation: 'suffix' }));
});
```

## Your own components

Behavior goes in components, like Unity's `MonoBehaviour`:

```ts
import { Component, Game, GameEvent } from 'portojs';

class Health extends Component {
  static override typeId = 'Health';
  readonly died = new GameEvent();
  hp = 100;

  override fixedUpdate(deltaTime: number): void {
    this.hp -= 5 * deltaTime;
    if (this.hp <= 0) this.died.invoke();
  }

  override onSave() {
    return this.hp;
  }

  override onLoad(data?: unknown) {
    this.hp = typeof data === 'number' ? data : 100;
  }
}

const game = new Game();
game.createObject('Player').addComponent(Health);
```

## Features

| Area                 | What you get                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Game model**       | `Game`, `GameObject`, `Component` with `awake`, `start`, `fixedUpdate`, `onEnable`, `onDisable`, `onDestroy`; `GameEvent`                                                                     |
| **Authoring**        | Coroutines (`WaitForSeconds`, `WaitUntil`), `Prefab` templates with `game.instantiate`, JSON scenes with `loadScene`                                                                          |
| **Tick loop**        | Fixed timestep with accumulator, independent of FPS, bounded catch-up for throttled tabs, deterministic with a fake clock                                                                     |
| **Clock**            | Injectable time source, `ManualClock` for tests, protection against the system clock going back or jumping                                                                                    |
| **Saves**            | Each component saves itself. Versioned, chained migrations, Base64 export/import, checksum, atomic load with rollback                                                                         |
| **Offline progress** | Components get `onOffline(ms)`; max offline time and efficiency; safe against clock edge cases                                                                                                |
| **Big numbers**      | Immutable `BigNum` (`mantissa × 10^exponent`), exponents up to ~9e15, JSON-safe, property-tested against doubles                                                                              |
| **Formatting**       | Scientific, engineering, suffix (`1.5T`) and custom formatters, with correct rounding carry                                                                                                   |
| **Idle mechanics**   | Opt-in components: `Resource`, `Generator` (bulk buy, closed-form offline), `Upgrade`, `Prestige` (stackable layers), `Achievement`, `Unlock`, `AutoBuyer`, `Challenge`, `Boost`, `DataStore` |
| **UI bindings**      | `useGame` hooks for React and Vue                                                                                                                                                             |
| **Quality**          | Strict TypeScript, no `any`, ESM + CJS + `.d.ts`, unit, property-based and browser tests                                                                                                      |

## Entry points

```ts
import { Game, Component } from 'portojs'; // everything
import { BigNum, format } from 'portojs/bignum'; // just the big-number type (~2 KB brotli)
import { Game, Component, GameEvent } from 'portojs/core'; // the game-agnostic runtime
import { Resource, Generator, Prestige } from 'portojs/idle'; // the idle mechanics
import { useGame } from 'portojs/react'; // or 'portojs/vue'
```

All entries share one copy of each class, so `instanceof` works across them in both ESM and CJS.

## Packages

PortoJS is a monorepo managed with [Lerna](https://lerna.js.org). Install the `portojs` umbrella, or only the packages you need:

| Package            | What it is                                                             |
| ------------------ | ---------------------------------------------------------------------- |
| `portojs`          | Everything below, with the subpath entries shown above                 |
| `@portojs/core`    | Big numbers, clock, fixed-timestep engine, events, offline math, saves |
| `@portojs/runtime` | `Game`, `GameObject`, `Component`, coroutines, prefabs, JSON scenes    |
| `@portojs/idle`    | Opt-in idle mechanics as components                                    |
| `@portojs/react`   | `useGame` for React                                                    |
| `@portojs/vue`     | `useGame` for Vue                                                      |

## Performance

Measured with `pnpm bench` on Node 24 with 10,000 generators:

| Operation                                     | Time (mean) |
| --------------------------------------------- | ----------- |
| One 100 ms step, generators feeding resources | ~0.5 ms     |
| One 100 ms step, generators in chained tiers  | ~0.7 ms     |
| Offline, 24 h, closed form                    | ~4 ms       |
| Buy "max" of a generator                      | ~0.2 µs     |

Numbers vary by machine; run the benchmark yourself.

## Documentation

Full site (guides, API reference and an in-browser playground): `pnpm docs:dev`. The same content as plain files:

- [Getting started](docs/getting-started.md)
- [Components and the game model](docs/components.md): lifecycle, saves, writing your own
- [Offline progress](docs/offline-progress.md): how away-time is computed, capped and credited
- [Saves and migrations](docs/saves-and-migrations.md): versioning, export/import, corruption handling
- [Prestige](docs/prestige.md): resets, formulas, layers and permanent bonuses
- [UI bindings](docs/bindings.md): `useGame` for React and Vue
- [ECS and rendering](docs/ecs-and-render.md): `@portojs/ecs`, `@portojs/render`, batching and benchmarks
- [Coming from Unity or Phaser](docs/from-unity.md): how the concepts map
- [Engineering audit and roadmap](docs/roadmap.md): measured state, open findings and the release process
- [Example game](examples/clicker): a small clicker running in the browser (Vite). Run it with `cd examples/clicker && pnpm install && pnpm dev`

## Development

```
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # build runs through Lerna
pnpm bench
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- [x] Prefab-style templates to create many similar objects
- [x] A scene description format (JSON) that builds objects and components
- [x] Coroutines for sequenced timed behavior
- [ ] Optional compressed save format
- [ ] Svelte and Solid bindings
- [ ] More cost curves and a cost-curve visualiser for balancing
- [ ] Localisable number suffix sets
- [ ] Off-main-thread simulation (Web Worker helper)
- [ ] Documentation site with its own theme, a component catalogue and tutorials (planned for the end)
- [ ] Devtools: inspect objects and components, fast-forward time, edit values

## License

[MIT](LICENSE)
