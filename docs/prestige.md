# Prestige

Prestige lets players reset a run in exchange for permanent points that boost later runs. In `leveling` it is **a plugin, not part of the core**, and it only uses the public `resources` API.

## Configuration

```ts
const game = createGame({
  resources: { gold: { initial: 0 } },
  generators: {/* ... */},
  upgrades: { autoClicker: {/* ... */} },
  prestige: {
    basedOn: 'gold', // run total of this resource decides the reward
    gain: { threshold: 1e6 }, // floor(sqrt(earned / 1e6))
    minimum: 1, // smallest reward that allows prestiging
    keep: { upgrades: ['autoClicker'] }, // survives the reset
    bonuses: [{ target: { all: true }, perPoint: 0.1 }], // +10% production per point
  },
});
```

### Reward formula

`gain` is either a preset or your own function of the run total (`BigNum`):

```ts
gain: { threshold: 1e6 }                              // scale · (earned / threshold) ^ exponent
gain: { threshold: 1e9, exponent: 1 / 3, scale: 5 }   // cube root, times 5
gain: (earned) => earned.log10() - 5                   // any function returning a BigNumLike
```

The preset returns `0` below `threshold`. Results are floored and negative values count as `0`. "Run total" is `earned(resource)`: everything produced or added since the last reset, not the current balance, so spending does not lower the reward.

### What is kept

`keep` accepts `resources`, `generators` and `upgrades` id lists. Everything else returns to its initial state, and run totals restart from zero.

### Bonuses

Each bonus targets `{ all: true }`, `{ resource: id }` or `{ generator: id }` and is either:

- `perPoint: 0.1` giving `1 + 0.1 × points`
- `multiplier: (points, lifetime) => ...` for anything else

Bonuses are re-evaluated every tick through `resources.setModifier`, so they also apply to offline progress and survive saves automatically.

## API

```ts
game.pendingPrestige(); // BigNum: points a reset would grant now
game.canPrestige(); // boolean
game.prestige(); // BigNum | undefined (undefined = nothing happened)
game.prestigePoints(); // balance
game.prestigeLifetime(); // total ever gained, unaffected by spending
game.prestigeCount();
game.spendPrestige(3); // boolean, for a prestige shop
```

Event:

```ts
game.on('prestige', ({ gained, points, count }) => {
  /* ... */
});
```

## Design notes

- **Points are a balance.** Spending them (a shop) lowers the bonus if your bonus uses `points`. Use `lifetime` in a function bonus if purchases should not reduce the bonus.
- **Do it at the right time.** `canPrestige()` is true as soon as the reward reaches `minimum`; players decide when the reset is worth it. Show `pendingPrestige()` in the UI.
- **Using it without `createGame`.** Install it after `resources`:

```ts
createCore({ plugins: [resources({/* ... */}), prestige({/* ... */})] });
```

- **Different layers.** Need a second prestige layer? Write a plugin with the same pattern (see [plugins](plugins.md)); `resources.resetRun(keep)` is the primitive both use.
