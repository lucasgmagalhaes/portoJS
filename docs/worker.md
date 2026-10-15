# Running a game in a Web Worker

A big simulation can make the page stutter if it shares the main thread with the interface. `@portojs/worker` moves the game into a Web Worker: the worker runs the loop, and the page sees a stream of plain state and calls named commands.

```
pnpm add @portojs/worker
```

## The worker side

```ts
// game.worker.ts
import { format } from '@portojs/core';
import { Generator, Resource } from '@portojs/idle';
import { serveGame } from '@portojs/worker';
import { buildGame } from './game';

serveGame({
  port: self,
  create: buildGame,
  select: (game) => ({
    gold: format(game.find('Gold')!.requireComponent(Resource).amount, { notation: 'suffix' }),
  }),
  commands: {
    buyMiner: (game, count) =>
      game.find('Miner')!.requireComponent(Generator).buy(Number(count)).toNumber(),
  },
});
```

- `create` builds the game inside the worker, and the worker starts its loop.
- `select` returns what the page may see, as JSON, and is sent every `publishEveryMs` (default 100).
- `commands` are the only way in. They receive the game and a JSON argument and return JSON, or a promise of it. A thrown error reaches the page as a rejected promise.
- `save` and `load` exist without you writing them: they export and import a save string.

## The page side

```ts
import { connectGame } from '@portojs/worker';

const worker = new Worker(new URL('./game.worker.ts', import.meta.url), { type: 'module' });
const remote = connectGame<{ gold: string }>(worker);

await remote.ready; // the first state
remote.subscribe((state) => (label.textContent = state.gold));
await remote.call('buyMiner', 5);

localStorage.setItem('save', await remote.save());
await remote.load(localStorage.getItem('save')!);

remote.dispose(); // stops the game in the worker
```

`remote.state` always holds the latest state, so it also works with `useGame`-style bindings: wrap `subscribe` and `state` in a store.

## Notes

- Only JSON crosses the boundary. Keep big numbers as strings (`BigNum` saves as one) and format on whichever side is cheaper.
- The worker keeps running while the tab is in the background, with the browser's own throttling. The game's offline logic still applies, because it works from the clock.
- `PortLike` is the small interface the package needs. A `Worker`, a `MessagePort` and `self` inside a worker all fit, so the same code works with a `SharedWorker` port or an iframe channel.
- Tests drive it with a `MessageChannel` in plain Node, covering commands, errors, state updates, save and load and disposal.
