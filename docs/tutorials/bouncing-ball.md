# A bouncing ball

You will drop a ball on a floor, let it bounce and count the bounces.

```
pnpm add @portojs/physics @dimforge/rapier2d-compat portojs
```

## The pieces

Physics is a component on top of Rapier, a physics engine delivered as WebAssembly. You load it once with `loadRapier()`, add a `PhysicsWorld` to the game, and give objects a `RigidBody2D`. The world steps once per fixed update, so the simulation follows the game clock and gives the same result every run.

<<< @/tutorials/code/bouncing-ball.ts{ts}

## Step by step

1. **A fixed floor.** `type: 'fixed'` bodies never move. `restitution` is how bouncy a surface is, from 0 to 1.
2. **A dynamic ball.** The default body type is `dynamic`: gravity and collisions move it. The y axis points down, like the renderer camera, so the default gravity pulls towards larger y.
3. **Collisions.** Every body has `collisionStarted` and `collisionEnded` events with the other body. A `sensor: true` body detects overlaps without pushing anything, which is how you build pickup zones.
4. **Reading the result.** After each step, `ball.x`, `ball.y` and `ball.rotation` hold the pose. Copy them to a sprite to see it.

Because the Rapier build is deterministic for a given sequence of steps, the tutorial test asserts how many bounces happen and where the ball rests.

## Next

Put the ball on screen with the [sprite game](/tutorials/sprite-game) pattern, or read the full [physics guide](/physics).
