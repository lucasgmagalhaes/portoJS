# Testing your game

`@portojs/testing` makes game logic testable without a browser and without waiting: a game with a fake clock that you move yourself, helpers for offline progress and saves, and fake input events.

```
pnpm add -D @portojs/testing
```

It works with any test runner; the examples use Vitest.

## A game you control

```ts
import { createTestGame } from '@portojs/testing';
import { Generator, Resource } from 'portojs';

const { game, tick, elapse, advance, leaveAndReturn, runUntil } = createTestGame({
  offline: { maxMs: 8 * 3_600_000, efficiency: 0.5 },
});
const gold = game.createObject('Gold').addComponent(Resource);
game.createObject('Miner').addComponent(Generator, {
  cost: { resource: gold, base: 10, growth: 1.15 },
  produces: gold,
  rate: 1,
  initial: 1,
});

tick(10); // 10 fixed steps
advance(5000); // 5 seconds of game time
elapse(350); // 350 ms of real time pass; the loop runs from the clock
runUntil(() => gold.amount.gte(100)); // play until it is true, or 60 s of game time
leaveAndReturn(3_600_000); // save, one hour "closed", load: credits offline progress
```

The game is never started, so nothing moves unless you move it, and a test gives the same result every run. `elapse` behaves like a real page (time beyond the catch-up limit is dropped and credited as offline time), `advance` plays exact game time.

## Saves

Check that everything that should be saved is saved:

```ts
import { roundTrip, stableSave } from '@portojs/testing';

expect(stableSave(game)).toMatchSnapshot(); // the saved data, without the time and checksum

const copy = roundTrip(game, () => buildGame()); // save, then load into a fresh, identical game
expect(stableSave(copy)).toEqual(stableSave(game));
```

`buildGame` must create the same objects and components in the same order, as your game's setup code does.

## Input

`FakeEventTarget` stands in for the window or the canvas, so you can test controls and clicks:

```ts
import { FakeEventTarget } from '@portojs/testing';
import { Input } from '@portojs/input';

const target = new FakeEventTarget();
const input = new Input({ keyboardTarget: target, pointerTarget: target });
input.bind('jump', 'key:Space');

target.keyDown('Space');
expect(input.wasPressed('jump')).toBe(true);

target.click({ x: 120, y: 80 }); // press and release
target.pointerDown({ x: 10, y: 10, id: 2 }); // a second finger
target.wheel(45);
```

It also has `keyUp`, `pointerMove`, `pointerUp` and `fire(type, fields)` for any other event. To test gestures or per-object pointer events, give it to a `Pointer` and attach a `GestureRecognizer` or a `PointerSystem` to that.
