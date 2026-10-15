# Components and the game model

The `Game` has no idea what a "resource" or a "prestige" is. It provides:

- a fixed-timestep loop (`start`, `stop`, `update`, `advance`) and a `Time` object
- game objects and components, with a Unity-style lifecycle
- a typed event bus for game-level events, and `GameEvent` for component-level ones
- versioned saves and offline crediting

Everything else is a component.

## Game objects

```ts
const game = new Game();
const player = game.createObject('Player');
const weapon = game.createObject('Sword', { parent: player });

game.find('Player'); // the object, or undefined
player.setActive(false); // switches the object and its children off
player.destroy(); // destroys its components and children
```

Names are unique per game, because they key an object's data in saves. A child is active only while its parent is.

## Components

```ts
class Counter extends Component {
  static override typeId = 'Counter';
  value = 0;

  override awake(): void {}
  override onEnable(): void {}
  override start(): void {}
  override fixedUpdate(deltaTime: number): void {
    this.value += deltaTime;
  }
  override onDisable(): void {}
  override onDestroy(): void {}
}

const counter = player.addComponent(Counter);
player.getComponent(Counter); // the first Counter, or undefined
player.requireComponent(Counter); // throws if missing
game.findObjectsOfType(Counter); // across the whole game
counter.enabled = false; // stops updates, fires onDisable
```

### Lifecycle

| Method                   | Called                                                                   |
| ------------------------ | ------------------------------------------------------------------------ |
| `awake()`                | Once, right after the component is created and attached                  |
| `onEnable()`             | When the component becomes active (enabled, and its object active)       |
| `start()`                | Once, before the first `fixedUpdate` while active                        |
| `fixedUpdate(deltaTime)` | Every fixed step while active. `deltaTime` is in seconds                 |
| `onDisable()`            | When the component stops being active                                    |
| `onDestroy()`            | When the component or its object is destroyed                            |
| `onOffline(elapsedMs)`   | Away-time is credited. Already capped and scaled by the offline settings |
| `onSave()` / `onLoad(d)` | Saving and loading. `onLoad(undefined)` means "reset to defaults"        |

Every method is optional. With `noImplicitOverride` on, write `override`.

Within a step, components run by `static executionOrder` (lower first, default `0`), then in the order they were added.

### Events

```ts
class Door extends Component {
  readonly opened = new GameEvent<{ by: string }>();
}

door.opened.addListener(({ by }) => console.log(by));
door.opened.invoke({ by: 'player' });
```

`addListener` returns an unsubscribe function. A `GameEvent` without a payload is invoked with no argument.

## Coroutines

A coroutine is a generator that pauses with `yield` and resumes later, like Unity's. It runs in game time (fixed steps), so it is deterministic with a fake clock.

```ts
import { Component, WaitForSeconds, WaitUntil } from 'portojs';
import type { CoroutineYield } from 'portojs';

class Wave extends Component {
  static override typeId = 'Wave';

  override start(): void {
    this.startCoroutine(this.run());
  }

  *run(): Generator<CoroutineYield> {
    while (true) {
      yield new WaitForSeconds(30); // game seconds
      yield new WaitUntil(() => this.ready);
      this.spawn();
      yield; // continue on the next step
    }
  }
}
```

- Waits: `WaitForSeconds(s)`, `WaitUntil(fn)`, `WaitWhile(fn)`, a bare `yield` (next step), or another coroutine (waits for it to finish). Subclass `YieldInstruction` for your own.
- `startCoroutine` returns a `Coroutine` with `stop()` and `isRunning`; `stopAllCoroutines()` stops every one of the component.
- A coroutine pauses while its component is inactive and ends when the component is destroyed.
- Coroutines are **not saved** and **do not advance during offline progress**. Keep state that must survive in the component and implement `onOffline` for away-time.

## Prefabs

A `Prefab` is a template for objects. Its builder receives the new object and optional parameters:

```ts
import { Generator, Prefab } from 'portojs';

const minerPrefab = new Prefab<{ base: number }>((object, { base }) => {
  object.addComponent(Generator, {
    cost: { resource: gold, base, growth: 1.15 },
    produces: gold,
    rate: 1,
  });
});

game.instantiate(minerPrefab, 'Miner1', { params: { base: 10 } });
game.instantiate(minerPrefab, 'Miner2', { params: { base: 100 }, parent: factory });
```

Names must still be unique. If the builder throws, the half-built object is destroyed.

## Scenes

A scene is plain JSON that builds objects and components, so levels and balance data can live in files. Register the component classes it may name, then load it:

```ts
import { ComponentRegistry, loadScene } from 'portojs';
import { idleComponents } from 'portojs/idle';

const registry = new ComponentRegistry().register(...idleComponents, Wave);

loadScene(
  game,
  {
    objects: [
      { name: 'Gold', components: [{ type: 'Resource', options: { initial: 10 } }] },
      {
        name: 'Miner',
        components: [
          {
            type: 'Generator',
            options: {
              cost: { resource: { $ref: 'Gold/Resource' }, base: 10, growth: 1.15 },
              produces: { $ref: 'Gold/Resource' },
              rate: 1,
            },
          },
        ],
      },
    ],
  },
  registry,
);
```

- `type` is the component's `typeId`. `options` is passed to its constructor; `enabled` and `active` set the initial state; `children` nests objects.
- `{ "$ref": "Gold" }` is the object named `Gold`, and `{ "$ref": "Gold/Resource" }` is its `Resource` component (`Gold/Resource#2` for the second). Objects are created in order, so a reference can only point at something created before it. Object names containing `/` cannot be referenced.
- Loading is all-or-nothing and throws `SceneError` with the path of the problem, so it is safe to feed it files you did not write. Keys named `__proto__` are rejected.
- A scene creates structure; saves still store component state by object name, so load the scene first and then `game.load(save)`.

## Time

`game.time` mirrors Unity's `Time`: `fixedDeltaTime` and `deltaTime` (seconds per step), `time` and `fixedTime` (seconds simulated), `tickCount`. Away-time is not added to `time`.

## Saving your own components

Implement `onSave` and `onLoad`. A save stores `data.objects[objectName][componentKey]`, where the key is the component's `static typeId` (a second component of the same type on the same object gets `#2`). Set `typeId` explicitly: the class name is the fallback, and a minifier may rename it.

```ts
class Health extends Component {
  static override typeId = 'Health';
  hp = 100;

  override onSave() {
    return this.hp;
  }

  override onLoad(data: JsonValue | undefined) {
    if (data !== undefined && typeof data !== 'number') {
      throw new SaveCorruptedError('Health: expected a number');
    }
    this.hp = data ?? 100;
  }
}
```

`game.load()` is atomic: if any `onLoad` throws, every component is restored to its previous state and the error is rethrown. Components missing from a save get `onLoad(undefined)`, and data for objects that no longer exist is ignored, so adding objects does not need a migration.

## Offline progress

Implement `onOffline(elapsedMs)` to react to away-time. Prefer a closed form over looping; if you must loop, use `forEachOfflineStep(totalMs, step)` to keep the work bounded. See [Offline progress](offline-progress.md).

## The idle mechanics

Imported from `portojs` or `portojs/idle`. They are ordinary components built on the same API.

| Component     | Purpose                                                        | Notes                                                   |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| `Resource`    | A currency (`amount`, `earned`, `rate`, `add`, `spend`)        | Exact offline production                                |
| `Generator`   | Produces a resource or another generator; bulk buying          | Cost curves: exponential, linear, custom                |
| `Upgrade`     | Levels that multiply generators, resources or everything       |                                                         |
| `Economy`     | Production, multipliers and purchase guards for the whole game | Created automatically by the first generator or upgrade |
| `Prestige`    | Reset for permanent points and bonuses; stackable layers       | See [prestige](prestige.md)                             |
| `Achievement` | Condition-based, with an optional persistent effect            |                                                         |
| `Unlock`      | Gates generators and upgrades behind a condition               | Permanent, saved                                        |
| `AutoBuyer`   | Buys a generator on a timer; switch with `enabled`             | Does not act while the player is away                   |
| `Challenge`   | Restart with a handicap, earn a permanent reward               | One challenge runs at a time                            |
| `Boost`       | Time-limited multipliers ("2x for 30 s")                       | Timers pause while away; no boost on offline gains      |
| `DataStore`   | Free-form saved data (`set` / `get`)                           | Values must be JSON                                     |

```ts
const gold = game.createObject('Gold').addComponent(Resource, { initial: 10 });
const miner = game.createObject('Miner').addComponent(Generator, {
  cost: { resource: gold, base: 10, growth: 1.15 },
  produces: gold,
  rate: 1,
});
const pick = game.createObject('Pick').addComponent(Upgrade, {
  cost: { resource: gold, base: 50, growth: 1 },
  effects: [{ generator: miner, multiplier: 2 }],
});
game.createObject('DeepMining').addComponent(Unlock, {
  condition: () => miner.bought.gte(10),
  gates: [pick],
});
game.createObject('MinerBot').addComponent(AutoBuyer, {
  target: miner,
  everyMs: 2000,
  enabled: true,
});
```

### The economy and purchase guards

`Economy` owns multipliers and guards. Reach it with `Economy.of(game)`:

```ts
const economy = Economy.of(game);
economy.setModifier('frenzy', { resource: gold }, 2); // or a function (context) => multiplier
economy.setPurchaseGuard('tutorial', (target) => target !== miner); // return false to forbid
economy.multiplierOf({ all: true });
economy.resetRun({ resources: [gold] }); // return the run to its start, keeping what you list
economy.purchased.addListener((purchase) => console.log(purchase.kind));
```

A dynamic modifier receives `{ offline }`, so a time-limited bonus can step aside while away-time is credited.

## Tips

- Keep components deterministic: take time from `game.now()` or `deltaTime`, never `Date.now()`, and seed randomness from state you save.
- Test with `ManualClock`: `clock.advance(ms); game.update();` is fully deterministic.
- Keep state JSON-friendly. Use `BigNum#toJSON()` and `BigNum.fromJSON()` for large values.
- Give every saved component a `typeId`.
