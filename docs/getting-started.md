# Getting started

## Install

```
pnpm add portojs
```

PortoJS has no runtime dependencies and ships ESM, CJS and type declarations. It runs in browsers, Node 18+ and Electron.

## A first game

```ts
import { createGame, format } from 'portojs';

const game = createGame({
  resources: { gold: { initial: 10 } },
  generators: {
    miner: { cost: { resource: 'gold', base: 10, growth: 1.15 }, produces: 'gold', rate: 1 },
  },
});

game.start(); // begins ticking
game.buy('miner'); // x1; also game.buy('miner', 10) and game.buy('miner', 'max')
game.on('tick', () => {
  console.log(format(game.amount('gold'), { notation: 'suffix' }));
});
```

Ids are inferred from your config, so `game.buy('minr')` is a compile error.

## Concepts

- **The core** runs a fixed-timestep loop (100 ms by default), keeps a registry of systems, an event bus, saves and offline crediting. It knows nothing about any kind of game.
- **Plugins** add mechanics: `resources` (with generators and upgrades), `prestige`, `achievements`, `unlocks`, `autoBuyers`, `challenges`. `createGame` installs the first three from one config object; add the rest with the `plugins` option.
- **BigNum** is the number type. Use `game.amount('gold')` (a `BigNum`) with `format()` for display and `toNumber()` only when you must.

## Saving and offline progress

```ts
const saved = localStorage.getItem('save');
if (saved) game.importSave(saved); // validates, migrates, credits time spent away
setInterval(() => localStorage.setItem('save', game.exportSave()), 10_000);
```

See [Offline progress](offline-progress.md) and [Saves and migrations](saves-and-migrations.md).

## Entry points

```ts
import { createGame } from 'portojs'; // everything
import { BigNum, format } from 'portojs/bignum'; // only the big-number type
import { createCore, definePlugin } from 'portojs/core'; // the game-agnostic kernel
import { resources, prestige } from 'portojs/mechanics'; // the built-in plugins
```

## Testing your game

Inject a `ManualClock` to make time deterministic:

```ts
const clock = new ManualClock(0);
const game = createGame({ clock /* ... */ });
clock.advance(5_000);
game.update(); // runs exactly 50 fixed steps
```

Next: try the [playground](playground.md), or read [Writing plugins](plugins.md).
