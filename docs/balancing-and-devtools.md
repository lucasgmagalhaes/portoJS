# Balancing and devtools

Tuning an idle game means answering "how long until the player reaches X?" many times. PortoJS gives you cost curves with a chart, a headless simulator and an inspector panel.

```
pnpm add @portojs/tools @portojs/devtools
```

## Cost curves

A generator or upgrade is priced by a curve. Five are built in; `exponential`, `linear`, `polynomial` and `stepped` have closed forms, so "buy max" is instant.

| Curve                                      | The n-th unit (from 0) costs     |
| ------------------------------------------ | -------------------------------- |
| `{ base, growth }`                         | `base × growth^n`                |
| `{ type: 'linear', base, increment }`      | `base + increment × n`           |
| `{ type: 'polynomial', base, power }`      | `base × (n + 1)^power`           |
| `{ type: 'stepped', base, growth, every }` | `base × growth^floor(n / every)` |
| `{ type: 'custom', cost, sum?, max? }`     | whatever your function returns   |

Polynomial batches under 33 units are summed exactly; larger ones use an integral estimate that is far below 0.1% off.

### See the curve

`costTable` lists prices and running totals, and `costChartSvg` draws curves on a logarithmic axis so exponential and polynomial growth can share one chart:

```ts
import { costChartSvg, costTable } from '@portojs/idle';

costTable({ base: 10, growth: 1.15 }, { count: 5 }).map((row) => row.unit.toNumber());

const svg = costChartSvg(
  [
    { label: 'exponential 1.15', curve: { base: 10, growth: 1.15 } },
    { label: 'polynomial 2', curve: { type: 'polynomial', base: 10, power: 2 } },
    { label: 'stepped', curve: { type: 'stepped', base: 10, growth: 2, every: 10 } },
  ],
  { count: 100, metric: 'cumulative' },
);
document.body.insertAdjacentHTML('beforeend', svg);
```

The SVG uses `currentColor`, so it follows your page text colour.

## The simulator

`simulate` fast-forwards a game with a scripted player and tells you when each milestone was reached. It advances the game with `game.advance`, so there is no real time and the result is deterministic: use it in a script, or in a test that fails when a tuning change moves a milestone.

```ts
import { buyCheapest, simulate } from '@portojs/tools';

const result = simulate({
  game,
  maxMs: 3_600_000,
  strategy: buyCheapest([miner, mine, upgrade]),
  milestones: {
    tenThousandGold: () => gold.amount.gte(10_000),
    millionGold: () => gold.amount.gte(1_000_000),
  },
  sample: () => ({ gold: gold.amount.toNumber() }),
});

result.reached.tenThousandGold; // game ms, or undefined if not reached
result.samples; // gold over time, for a chart
```

- The strategy runs once per `decisionMs` (default 1 second). `buyCheapest` keeps buying the cheapest affordable item; `buyInOrder` follows a fixed priority list. Write your own for prestige timing or skipping an upgrade: it is just `(game, elapsedMs) => void`.
- The run stops as soon as every milestone is reached.
- Build the game fresh for each run, with a `ManualClock`.

## The inspector

`inspectGame(game)` returns plain data for every object and component, including what each component saves. `setComponentState` writes a component's state back through its `onLoad`, and `fastForward` skips time: by real fixed steps, or as away time using the closed-form offline math, which is instant however long it is.

```ts
import { fastForward, findComponent, inspectGame, setComponentState } from '@portojs/tools';

console.log(JSON.stringify(inspectGame(game), null, 2));
setComponentState(findComponent(game, 'Gold', 'Resource')!, { amount: '1e20' });
fastForward(game, 86_400_000, 'offline');
```

### A React panel

`@portojs/devtools` is a React component over the inspector:

```tsx
import { Devtools } from '@portojs/devtools';

function App() {
  return <>{import.meta.env.DEV && <Devtools game={game} />}</>;
}
```

It shows the object tree with each component's state as editable JSON (press Apply to write it back through `onLoad`), the step counter and game time, and buttons to jump forward one minute, one hour or one day. It redraws every `refreshEveryTicks` steps (default 10), never overwrites a draft while you type, and takes a `className` so you can style it. React 18 or newer is a peer dependency. Ship it only in development builds.

## The profiler

`Profiler` measures how long each component type spends in `fixedUpdate`, `update` and `lateUpdate`. It wraps the methods of the live components, so the game needs no changes, and `detach()` puts them back.

```ts
import { Profiler } from '@portojs/tools';

const profiler = new Profiler().attach(game);
// after playing for a while
console.table(profiler.report().slice(0, 5)); // type, phase, calls, total, average, max (ms)
profiler.frames(); // the last 120 steps: fixedMs, frameMs and memory, for a graph
```

Components created after `attach` are picked up on the next step. Memory is sampled only if you give `memory: () => bytes` (Chrome offers `performance.memory.usedJSHeapSize`; other browsers have no honest number, so there is no default and no allocation counter). `<ProfilerPanel profiler={profiler} game={game} />` from `@portojs/devtools` shows the table and a bar per step. Profiling is for development: the wrapping costs a clock read per call.

## Hot reload that keeps the state

`reloadWithState(game, setup)` saves the game, destroys every object, runs your `setup` again with the freshly loaded component classes and loads the save into the new objects, without crediting offline time. With Vite:

```ts
import { reloadWithState } from '@portojs/tools';
import { setup } from './setup.ts';

setup(game);
if (import.meta.hot) {
  import.meta.hot.accept('./setup.ts', (next) => {
    if (next) reloadWithState(game, next.setup);
  });
}
```

Put the code that creates objects and components in `setup.ts` (and the component classes in files it imports). Editing a component then rebuilds the scene in place while the numbers you reached stay. Timers you started with `game.setTimeout` are not part of a save and keep running; state a component does not save in `onSave` starts fresh, which is the same rule as loading a save.

The simulator, the inspector, the profiler, the reload and the panels are covered by automated tests; the panels are rendered against a DOM in the test environment.
