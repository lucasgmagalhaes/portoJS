# Coming from Unity or Phaser

PortoJS borrows its model from Unity: a `Game` holds `GameObject`s, and behavior lives in `Component`s with a lifecycle. It is **headless** (it draws nothing) and built around a fixed-timestep simulation, which makes it a good fit for games that run over time.

## Unity

| In Unity                           | In PortoJS                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `new GameObject("Name")`           | `game.createObject('Name')`                                                   |
| `AddComponent<T>()`                | `object.addComponent(T, options)`                                             |
| `GetComponent<T>()`                | `object.getComponent(T)` (returns `undefined` when missing)                   |
| `FindObjectOfType<T>()`            | `game.findObjectOfType(T)`                                                    |
| `MonoBehaviour`                    | `Component`                                                                   |
| `Awake`, `OnEnable`, `Start`       | `awake`, `onEnable`, `start`                                                  |
| `FixedUpdate()`                    | `fixedUpdate(deltaTime)`: seconds, fixed steps, independent of frame rate     |
| `OnDisable`, `OnDestroy`           | `onDisable`, `onDestroy`                                                      |
| `gameObject.SetActive(false)`      | `object.setActive(false)`                                                     |
| `component.enabled`                | `component.enabled`                                                           |
| `Destroy(obj)`                     | `object.destroy()` / `component.destroy()`                                    |
| `UnityEvent`                       | `GameEvent<T>` (`addListener`, `invoke`)                                      |
| `Time.fixedDeltaTime`, `Time.time` | `game.time.fixedDeltaTime`, `game.time.time`                                  |
| `PlayerPrefs` / save files         | `game.exportSave()` and `game.importSave()`: versioned, checksummed, migrated |
| Script Execution Order             | `static executionOrder` on a component class                                  |
| `StartCoroutine`, `WaitForSeconds` | `component.startCoroutine(gen())`, `new WaitForSeconds(s)`                    |
| Prefab, `Instantiate`              | `new Prefab(build)`, `game.instantiate(prefab, name, { params })`             |
| Scene asset                        | JSON scene and `loadScene(game, scene, registry)`                             |

### What is different

- **There is no `Update()`.** The simulation runs in fixed steps, so `fixedUpdate` is the only per-step hook. Rendering is yours and runs on its own schedule.
- **Saving is built in.** Components implement `onSave` and `onLoad`, and the game stores them under the object's name. A scene can be code or a JSON description (see [Scenes](components.md#scenes)); either way, a save restores the state of the objects, not their structure.
- **Away-time is a first-class idea.** `onOffline(elapsedMs)` lets a component fast-forward in closed form.
- **Time is injectable.** Pass a `ManualClock` in tests and move it yourself.

## Phaser

Phaser draws scenes you update every frame; PortoJS runs a simulation you draw however you like.

| In Phaser                    | In PortoJS                                                        |
| ---------------------------- | ----------------------------------------------------------------- |
| `new Phaser.Game(config)`    | `new Game(options)`                                               |
| Scene `update(time, delta)`  | A component's `fixedUpdate(deltaTime)`, or `game.on('tick', ...)` |
| `this.events.on('name', fn)` | `game.on('name', fn)` for game events, `GameEvent` on components  |
| `this.registry.set/get`      | the `DataStore` component: `set(key, value)` / `get(key)`         |
| `this.time.now`              | `game.now()` (an injectable clock)                                |

Phaser can draw while PortoJS runs the simulation:

```ts
const game = new Game();
const gold = game.createObject('Gold').addComponent(Resource);
game.start();

class Main extends Phaser.Scene {
  private label!: Phaser.GameObjects.Text;

  create() {
    this.label = this.add.text(16, 16, '');
  }

  update() {
    this.label.setText(format(gold.amount, { notation: 'suffix' }));
  }
}
```

PortoJS keeps its own loop, so Phaser's `update` only reads state and never advances the simulation.
