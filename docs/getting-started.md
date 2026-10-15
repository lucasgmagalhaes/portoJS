# Getting started

## Install

```
pnpm add portojs
```

PortoJS has no runtime dependencies and ships ESM, CJS and type declarations. It runs in browsers, Node 18+ and Electron.

## The model

If you know Unity, you already know it:

- A **`Game`** runs the loop, owns the clock and handles saves and offline progress.
- A **`GameObject`** is a named container. Create it with `game.createObject('Name')`.
- A **`Component`** gives an object behavior. Attach it with `object.addComponent(Type, options)`. Components have a lifecycle: `awake`, `onEnable`, `start`, `fixedUpdate(deltaTime)`, `onDisable`, `onDestroy`.
- A **`GameEvent`** is a typed event a component exposes (`addListener`, `invoke`).

## A first game

```ts
import { Game, Generator, Resource, format } from 'portojs';

const game = new Game();

const gold = game.createObject('Gold').addComponent(Resource, { initial: 10 });
const miner = game.createObject('Miner').addComponent(Generator, {
  cost: { resource: gold, base: 10, growth: 1.15 },
  produces: gold,
  rate: 1,
});

game.start();
miner.buy('max');
game.on('tick', () => {
  console.log(format(gold.amount, { notation: 'suffix' }));
});
```

References are real objects, so there are no string ids to mistype: `produces: gold` is checked by the compiler.

## Idle mechanics are optional

The `Game` knows nothing about resources or prestige. They are components from `portojs/idle` that you add when you want them: `Resource`, `Generator`, `Upgrade`, `Prestige`, `Achievement`, `Unlock`, `AutoBuyer`, `Challenge`, `Boost`, `DataStore`. A game that is not idle simply does not import them.

## Your own behavior

```ts
import { Component } from 'portojs';

class Spinner extends Component {
  angle = 0;

  override fixedUpdate(deltaTime: number): void {
    this.angle += 90 * deltaTime;
  }
}

game.createObject('Wheel').addComponent(Spinner);
```

With `noImplicitOverride` enabled (recommended), mark lifecycle methods `override`. See [Components and the game model](components.md).

## Saving and offline progress

```ts
const saved = localStorage.getItem('save');
if (saved) game.importSave(saved); // validates, migrates, credits time spent away
setInterval(() => localStorage.setItem('save', game.exportSave()), 10_000);
```

Each component saves itself, so you do not write serialization code for the built-in mechanics. See [Offline progress](offline-progress.md) and [Saves and migrations](saves-and-migrations.md).

## Entry points

```ts
import { Game } from 'portojs'; // everything
import { BigNum, format } from 'portojs/bignum'; // only the big-number type
import { Game, Component } from 'portojs/core'; // the game-agnostic runtime
import { Resource, Generator } from 'portojs/idle'; // the idle mechanics
```

## Testing your game

Inject a `ManualClock` to make time deterministic:

```ts
const clock = new ManualClock(0);
const game = new Game({ clock });
clock.advance(5_000);
game.update(); // runs exactly 50 fixed steps
```

Next: try the [playground](playground.md), or read [Components and the game model](components.md).
