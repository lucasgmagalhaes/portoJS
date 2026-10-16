# Tweens and easing

`@portojs/tween` animates numbers, and big numbers, over game time. A tween is a function of elapsed time, so it follows `timeScale`, stops with `game.pause()` and is deterministic in tests.

```
pnpm add @portojs/tween
```

## Your first tween

Add a `TweenSystem` to the game and ask it for tweens:

```ts
import { Game } from '@portojs/runtime';
import { TweenSystem } from '@portojs/tween';

const game = new Game();
const { tweens } = game.createObject('Tweens').addComponent(TweenSystem);

const box = { x: 0, alpha: 1 };
tweens.to(box, { x: 200, alpha: 0 }, { duration: 0.5, ease: 'cubicOut' });
```

The start values are read when the tween starts, not when it is created, so tweens queued after a delay begin from where the property is then.

## Options

| Option                  | Meaning                                                               |
| ----------------------- | --------------------------------------------------------------------- |
| `duration`              | Seconds for one run. `0` jumps to the end.                            |
| `ease`                  | A built-in name such as `'backOut'`, or any `(t) => number` function. |
| `delay`                 | Seconds before it starts.                                             |
| `repeat`                | Extra runs after the first. `Infinity` loops forever.                 |
| `yoyo`                  | Play every second run backwards.                                      |
| `onUpdate`/`onComplete` | Callbacks. `onComplete` is not called for a killed tween.             |

`tweens.from(target, props, options)` starts at the given values and ends at the current ones.

## Easing

Built-ins: `linear` and the `In`, `Out` and `InOut` variants of `quad`, `cubic`, `quart`, `quint`, `sine`, `expo`, `circ`, `back`, `elastic` and `bounce`. `cubicBezier(x1, y1, x2, y2)` works like the CSS function and `steps(n)` makes a staircase.

## Controlling a tween

Every tween has `pause()`, `resume()`, `kill()`, `seek(seconds)` and `complete()`, a `finished` promise (`true` when completed, `false` when killed) and `tweens.killAll(target)`.

From a coroutine, wait with `untilFinished()`:

```ts
function* openDoor() {
  yield tweens.to(door, { y: -64 }, { duration: 1 }).untilFinished();
  door.open = true;
}
```

## Timelines

A timeline plays tweens in sequence, together or at labels:

```ts
tweens
  .timeline()
  .to(box, { x: 100 }, { duration: 1 })
  .to(box, { y: 50 }, { duration: 1 }, '<') // together with the previous one
  .wait(0.5)
  .call(() => sound.play())
  .label('end')
  .to(box, { alpha: 0 }, { duration: 0.3 });
```

A position is a time in seconds, a label, `'<'` (start with the previous) or `'>'` (after everything so far, the default).

## Big numbers

A property holding a `BigNum` is interpolated as a big number, so an idle counter can roll up smoothly:

```ts
tweens.to(wallet, { gold: BigNum.from('1e30') }, { duration: 2, ease: 'expoOut' });
```

## Without a game

`Tweens` has no dependency on `Game`. Call `tweens.update(deltaSeconds)` from your own loop, for example from `requestAnimationFrame`, to animate at the display rate rather than in 100 ms fixed steps.
