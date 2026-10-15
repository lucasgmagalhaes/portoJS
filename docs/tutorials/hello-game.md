# Hello, game

You will build a game with one object, give it behaviour as a component, run it for ten seconds and save it.

```
pnpm add portojs
```

## The model

A `Game` runs a loop with a fixed timestep. It holds **game objects**, and each object holds **components**: small classes with lifecycle methods (`awake`, `start`, `fixedUpdate`, `onDestroy`). If you know Unity, this is the same shape.

## A component

`fixedUpdate` runs every step and receives the step length in seconds, so behaviour does not depend on the frame rate. `onSave` and `onLoad` are how the component takes part in saves.

<<< @/tutorials/code/hello.ts{ts}

## What happens

1. `createHello` makes a `Game` with a `ManualClock`. The fake clock lets you move time by hand, which is how the tests stay exact; a real game omits it and uses the system clock.
2. `createObject('Player').addComponent(Health)` creates the object and attaches the component, which starts at 100 health and loses 5 per second.
3. `clock.advance(10_000)` then `game.update()` runs a hundred 100 ms steps. Health is now 50.
4. `exportSave()` returns a string. A new game that calls `importSave(text)` gets the same health back, because `onLoad` receives what `onSave` returned.

The `died` event is a `GameEvent`: listen with `health.died.addListener(...)` and react when it fires.

## Next

Saves, versions and migrations are covered in [Saves and migrations](/saves-and-migrations). To build something players can enjoy, continue with [Your first idle game](/tutorials/idle-game).
