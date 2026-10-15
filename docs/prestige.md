# Prestige

Prestige lets players reset a run in exchange for permanent points that boost later runs. In `portojs` it is **a component, not part of the core**, and it only uses the public `Economy` API.

## Adding a prestige layer

```ts
const gold = game.createObject('Gold').addComponent(Resource);
const autoClicker = game.createObject('AutoClicker').addComponent(Upgrade, {/* ... */});

const ascension = game.createObject('Ascension').addComponent(Prestige, {
  basedOn: gold, // the run total of this resource decides the reward
  gain: { threshold: 1e6 }, // floor(sqrt(earned / 1e6))
  minimum: 1, // smallest reward that allows prestiging
  keep: { upgrades: [autoClicker] }, // survives the reset
  bonuses: [{ all: true, perPoint: 0.1 }], // +10% production per point
});
```

### Reward formula

`gain` is either a preset or your own function of the basis value (a `BigNum`):

```ts
gain: { threshold: 1e6 }                             // scale · (basis / threshold) ^ exponent
gain: { threshold: 1e9, exponent: 1 / 3, scale: 5 }  // cube root, times 5
gain: (basis) => basis.log10() - 5                   // any function returning a BigNumLike
```

The preset returns `0` below `threshold`. Results are floored and negative values count as `0`. For a resource basis, the value is `resource.earned`: everything produced or added since the last reset, not the current balance, so spending does not lower the reward.

### What is kept

`keep` accepts `resources`, `generators` and `upgrades` lists of components. Everything else returns to its initial state, and run totals restart from zero.

### Bonuses

Each bonus targets `{ all: true }`, `{ resource }` or `{ generator }` and is either:

- `perPoint: 0.1` giving `1 + 0.1 × points`
- `multiplier: (points, lifetime) => ...` for anything else

Bonuses are economy modifiers re-evaluated every step, so they also apply to offline progress and survive saves automatically.

## Using it

```ts
ascension.pending; // BigNum: points a reset would grant now
ascension.canPrestige; // boolean
ascension.perform(); // BigNum | undefined (undefined = nothing happened)
ascension.points; // balance
ascension.lifetime; // total ever gained, unaffected by spending
ascension.count;
ascension.spend(3); // boolean, for a prestige shop

ascension.performed.addListener(({ gained, points, count }) => {
  console.log(gained.toString());
});
```

## Stacking layers

Base a layer on another one to stack them. The higher layer uses the points the lower layer has produced since the higher layer last reset it, and by default wipes the lower layer's points when performed:

```ts
const ascension = game.createObject('Ascension').addComponent(Prestige, {
  basedOn: gold,
  gain: { threshold: 1e6 },
  bonuses: [{ all: true, perPoint: 1 }],
});

const transcendence = game.createObject('Transcendence').addComponent(Prestige, {
  basedOn: ascension, // a layer, not a resource
  gain: { threshold: 100 },
  bonuses: [{ all: true, multiplier: (points) => points.mul(10).add(1) }],
  resetsLower: true, // default
});
```

Performing `transcendence` clears `ascension.points`, but keeps `ascension.lifetime` and `ascension.count`. Pass `resetsLower: false` to keep the lower layer's points.

## Design notes

- **Points are a balance.** Spending them (a shop) lowers the bonus if your bonus uses `points`. Use `lifetime` in a function bonus if purchases should not reduce the bonus.
- **Do it at the right time.** `canPrestige` is true as soon as the reward reaches `minimum`; players decide when the reset is worth it. Show `pending` in the UI.
- **Other reset rules.** `Economy.of(game).resetRun(keep)` is the primitive prestige uses. A component of your own can use it too (see [Components and the game model](components.md)).
