# Writing plugins

The core has no idea what a "resource" or a "prestige" is. It provides:

- a fixed-timestep loop (`start`, `stop`, `update`, `advance`)
- a registry of **systems** that tick, save and fast-forward
- a typed event bus
- versioned saves and offline crediting

Everything else is a plugin. `createGame` is just `createCore` with the built-in plugins installed.

## Anatomy

```ts
import { createCore, definePlugin } from 'portojs';

interface CounterApi {
  readonly count: number;
  bump(): void;
}

const counter = definePlugin<CounterApi, { bumped: { count: number } }>('counter', (kernel) => {
  let count = 0;

  kernel.registerSystem({
    id: 'counter', // also the key in saves
    tick: (dtMs) => {
      count += dtMs / 1000;
    }, // one fixed step
    offline: (ms) => {
      count += ms / 1000;
    }, // away-time, already capped/scaled
    serialize: () => count, // JSON
    deserialize: (data) => {
      count = typeof data === 'number' ? data : 0;
    }, // undefined => defaults
  });

  return {
    get count() {
      return count;
    },
    bump() {
      count += 1;
      kernel.emit('bumped', { count });
    },
  };
});

const game = createCore({ plugins: [counter] });
game.bump();
game.on('bumped', ({ count }) => console.log(count)); // fully typed
```

The object returned from `setup` is merged onto the game with its types. A plugin API member that collides with a core member (`save`, `load`, `on`, ...) throws at creation.

## The `System` contract

| Member               | Called when            | Notes                                                 |
| -------------------- | ---------------------- | ----------------------------------------------------- |
| `tick(dtMs)`         | every fixed step       | order of registration                                 |
| `offline(elapsedMs)` | away-time is credited  | prefer closed forms; use `forEachOfflineStep` to loop |
| `serialize()`        | `save()`               | return JSON; omit for stateless systems               |
| `deserialize(data)`  | `load()` and `reset()` | `undefined` means "use defaults"; throw to reject     |

`load()` is atomic: if any `deserialize` throws, previous state is restored.

## The `Kernel`

| Member               | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `registerSystem`     | add a system (ids must be unique)                           |
| `require<Api>(name)` | get another plugin's API; plugins are set up in array order |
| `emit`, `on`         | typed events                                                |
| `now()`, `clock`     | game time                                                   |
| `stepMs`             | fixed step length                                           |

## Depending on other plugins

```ts
const quests = definePlugin<QuestsApi>('quests', (kernel) => {
  const game = kernel.require<ResourcesApi<'gold', never, never>>('resources');
  // ... use game.amount('gold')
  return {/* ... */};
});

createCore({ plugins: [resources({/* ... */}), quests] }); // order matters
```

To listen to another plugin's events with types, declare them as the third type parameter: `definePlugin<Api, MyEvents, OtherEvents>(...)`.

## Tips

- Keep systems deterministic: no `Date.now()` or `Math.random()` inside `tick`. Take time from the kernel, and seed randomness from state you save.
- Test with `ManualClock`: `clock.advance(ms); game.update();` is fully deterministic.
- Keep state JSON-friendly. Use `BigNum#toJSON()` / `BigNum.fromJSON()` for large values.
- Provide a closed-form `offline` whenever your system is linear in time.
