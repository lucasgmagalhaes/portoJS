# Shooter

A vertical shooter. Components are typed arrays, systems are loops over queries, and everything random comes from one seeded generator, so a run can be replayed exactly.

<<< ../../examples/shooter/src/game.ts{ts}

## How it works

- `Motion` and `Body` describe what every entity is. `world.query(Motion, Body)` finds them all and the loops read the arrays directly.
- The simulation never draws. It pushes `Explosion`s into a list; `main.ts` turns each into a `ParticleEmitter` burst.
- Enemy spawns, their speed and size come from `Rng(seed)`, so the tests assert the same score for the same seed.
- Losing a life gives 1.5 s of protection; the ship blinks while it runs.

Controls: arrows or WASD, Space to fire, Enter to restart; touch drags the ship and fires.
