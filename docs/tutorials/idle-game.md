# Your first idle game

You will build a small economy: gold from miners, miners from mines, an upgrade that doubles miners and a prestige layer. Then you will play it, close it and come back.

```
pnpm add portojs
```

## The economy

An idle game is a few resources and things that produce them. In PortoJS each is a component from the idle package:

- `Resource` is a balance (gold).
- `Generator` produces a resource, or another generator. A mine that produces miners gives you the compound growth idle games are known for.
- `Upgrade` applies multipliers, with levels and a price curve.
- `Prestige` resets the run for permanent points, and its bonuses boost generators.

<<< @/tutorials/code/idle-game.ts{ts}

## Prices

A generator `cost` is a curve. `{ base: 10, growth: 1.15 }` makes each unit 15% dearer than the last, and `buy('max')` buys as many as you can afford in one step using a closed form, however many that is. Other curves (linear, polynomial, stepped) are in [Balancing and devtools](/balancing-and-devtools), together with a chart to see them.

## Numbers

Idle games outgrow `Number`. Amounts are `BigNum` values, and `format(amount, { notation: 'suffix' })` prints them as players expect: `1.5T`. The `label` function in step 2 is all you need on screen.

## Offline progress

The game is created with `offline: { maxMs: 8 * HOUR, efficiency: 0.5 }`. When a save is loaded two hours later, every component gets `onOffline(ms)`, and generators credit their exact production: the compound growth of a mine feeding miners feeding gold is solved as a polynomial, so an hour or a week costs the same to compute. The cap and the efficiency are yours to tune. Details are in [Offline progress](/offline-progress).

## Next

Look at your balance with the [simulator](/balancing-and-devtools), add events with `LiveEvent`, or put a UI on it with the [React, Vue, Svelte or Solid bindings](/bindings).
