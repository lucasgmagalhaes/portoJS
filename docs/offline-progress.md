# Offline progress

Games that run over time must reward players for time spent away, without being exploitable and without freezing the page on load. `portojs` does this in three steps.

1. **Resolve** how much real time to credit.
2. **Credit** it by asking every active component to fast-forward.
3. **Report** what happened through events.

## 1. Resolving the span

The span between a save and "now" is resolved by `resolveOffline` (used internally on `load`):

```ts
import { resolveOffline } from 'portojs';

resolveOffline(savedAt, clock.now(), { maxMs: 8 * 3_600_000, efficiency: 0.5 });
// => { elapsedMs, appliedMs, status }
```

| Input                | `status`     | `appliedMs`                  |
| -------------------- | ------------ | ---------------------------- |
| Zero time            | `'none'`     | `0`                          |
| Clock went backwards | `'backward'` | `0` (and `elapsedMs` is `0`) |
| Shorter than `maxMs` | `'applied'`  | `elapsed × efficiency`       |
| Longer than `maxMs`  | `'capped'`   | `maxMs × efficiency`         |

- `maxMs` defaults to 24 hours. Use `Infinity` for no limit.
- `efficiency` is `0..1` and defaults to `1`. The cap is applied first, then efficiency.
- A clock that jumped far into the future is handled by the same cap, so cheating by changing the date yields at most `maxMs`.

Configure it once when creating the game:

```ts
const game = new Game({
  offline: { maxMs: 12 * 3_600_000, efficiency: 0.5, onLoad: true, background: true },
});
```

`onLoad` (default `true`) credits automatically in `game.load()` / `importSave()`. Pass `{ offline: false }` to a single load to skip it.

## 2. Crediting

The game calls `onOffline(appliedMs)` on every **active** component (enabled, and its object active), in execution order. What a component does with it is up to the component; the game stays agnostic.

```ts
class Plant extends Component {
  size = 0;

  override onOffline(elapsedMs: number): void {
    this.size += elapsedMs / 1000;
  }
}
```

The idle mechanics use two strategies. The `Economy` solves production for every generator at once:

### Closed form (preferred)

With no purchases happening, every generator emits at a constant rate per unit held. A generator that feeds a resource gives a linear gain. A chain (tier 2 feeds tier 1 feeds gold) gives a polynomial whose degree is the chain length. The economy solves those polynomials exactly, so **a week offline costs the same as a minute**, and the answer is exact rather than approximated by large steps.

```
tier 1: 1 unit, 3/s feeds tier 0:   count(t) = c0 + 3t
tier 0: feeds gold at 4/s:          gold(t) = 4 · (c0·t + 1.5·t²)
```

### Step simulation (fallback)

If generators form a feedback cycle (A feeds B feeds A, which grows exponentially) or a chain is longer than `maxChain` (default 64), there is no polynomial. The economy then simulates in big steps via `forEachOfflineStep`: step length is `max(1 s, span / maxSteps)` with `maxSteps` defaulting to 1000, so the work is bounded however long the player was away. Tune it by creating the economy yourself before the generators:

```ts
game.createObject('Economy').addComponent(Economy, { maxChain: 32, maxSteps: 500 });
```

Normal steps use fixed increments, which for chained tiers are slightly less accurate than the closed form. Offline can therefore be marginally higher than the same duration played live; for non-chained production they are identical.

### What does not run offline

`AutoBuyer` does not act while the player is away (offline progress has no purchases in it), and `Boost` timers pause and do not apply to offline gains. Both keep offline progress predictable and cheap.

## 3. Reporting

```ts
game.on('offline', ({ source, status, elapsedMs, appliedMs }) => {
  // source: 'load' | 'background' | 'manual'
});

Economy.of(game).offlineGains.addListener(({ elapsedMs, gains }) => {
  const earned = gains.get(gold); // a BigNum: exactly what was earned
});
```

The `offline` event is skipped only for zero time; it fires with `'backward'` so you can warn the player.

## Background tabs

Browsers throttle timers in hidden tabs. When the loop wakes up after a long pause, it runs at most `maxCatchUpTicks` steps (default 100) and **drops the rest**, reporting it via the `overflow` event. By default the dropped time is credited as offline time (same cap and efficiency), so nothing is lost and the page never freezes catching up. Disable with `offline: { background: false }`.

## Testing offline behaviour

Use a `ManualClock`:

```ts
const clock = new ManualClock(0);
const game = new Game({ clock });
const save = game.save();
clock.advance(2 * 3_600_000);
game.load(save); // credits two hours deterministically
```

Or call `game.simulateOffline(ms)` directly.

## Writing your own offline logic

Implement `onOffline(elapsedMs)` on a component. Prefer a closed form; if you must loop, use `forEachOfflineStep(totalMs, step)` to keep the work bounded.
