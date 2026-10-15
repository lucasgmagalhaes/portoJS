# Coming from Phaser

Phaser is a framework for building **scenes** you draw and update every frame. PortoJS is a headless engine for **idle games**, where most of the per-frame logic (production, costs, offline progress, saves) is the same in every game. So the API is smaller and data-driven, but the concepts line up.

| In Phaser                       | In PortoJS                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `new Phaser.Game(config)`       | `createGame(config)`                                                            |
| Scene `update(time, delta)`     | `game.on('tick', ({ dtMs }) => ...)`: fixed steps, independent of frame rate    |
| Scene `create()`                | Build the game, then subscribe to events                                        |
| `this.events.on('name', fn)`    | `game.on('name', fn)`; returns an unsubscribe function                          |
| `this.registry.set/get`         | `registry()` plugin: `game.setData(key, value)` / `game.getData(key)`           |
| Plugins                         | `definePlugin(name, setup)` and the `plugins` option                            |
| `this.time.now`                 | `game.now()` (an injectable clock)                                              |
| Save in `localStorage` yourself | `game.exportSave()` / `game.importSave(text)`: versioned, checksummed, migrated |

## What is different

- **You declare, the engine simulates.** Instead of writing an `update` that adds `rate * delta` to a counter, you declare `generators` with a `rate` and call `game.buy('miner')`.
- **Time is explicit.** Pass a `ManualClock` in tests and move it yourself: `clock.advance(1000); game.update()`. The same code is deterministic.
- **Rendering is yours.** There is no display list. Read state (`game.amount('gold')`) and render with anything: the DOM, React or Vue (see [UI bindings](bindings.md)), a canvas, even Phaser itself.

## Using it with Phaser

Phaser can draw the game while PortoJS runs the economy:

```ts
const game = createGame({ resources: { gold: {} } /* ... */ });
game.start();

class Main extends Phaser.Scene {
  private label!: Phaser.GameObjects.Text;

  create() {
    this.label = this.add.text(16, 16, '');
  }

  update() {
    this.label.setText(format(game.amount('gold'), { notation: 'suffix' }));
  }
}
```

PortoJS keeps its own loop, so Phaser's `update` only reads state; it never has to advance the simulation.

## Free-form data

For data that is not a resource (tutorial flags, a player name, settings), install the registry plugin. It is saved with the game and cleared by `game.reset()`:

```ts
const game = createGame({ resources: { gold: {} }, plugins: [registry()] });
game.setData('tutorialDone', true);
game.getData('tutorialDone'); // true
```
