# Physics

`@portojs/physics` adds 2D rigid bodies and collisions as components, on top of [Rapier](https://rapier.rs). Rapier ships as prebuilt WebAssembly: nothing in PortoJS is written in Rust, and the package is optional.

```
pnpm add @portojs/physics @dimforge/rapier2d-compat
```

## A world and some bodies

```ts
import { Game } from '@portojs/runtime';
import { PhysicsWorld, RigidBody2D, loadRapier } from '@portojs/physics';

const rapier = await loadRapier();
const game = new Game();
game.createObject('Physics').addComponent(PhysicsWorld, { rapier });

game.createObject('Floor').addComponent(RigidBody2D, {
  type: 'fixed',
  shape: { kind: 'box', width: 20, height: 1 },
  y: 5,
});

const ball = game.createObject('Ball').addComponent(RigidBody2D, {
  shape: { kind: 'circle', radius: 0.5 },
  restitution: 0.8,
});
```

- `PhysicsWorld` steps the simulation once per fixed update, so physics follows the game's fixed timestep and gives the same result for the same sequence of steps. Add one per game before any body.
- The y axis points down, like `Camera2D` in `@portojs/render`, so the default gravity is `{ x: 0, y: 9.81 }`. Pass `gravity` to change it, for example `{ x: 0, y: 0 }` for a top-down game.
- Units are yours: treat one unit as a metre for realistic motion and scale to pixels in the camera.

## Bodies

`RigidBody2D` has one collider and three types:

| Type        | Behaviour                                                 |
| ----------- | --------------------------------------------------------- |
| `dynamic`   | Simulated: gravity, forces, collisions (default)          |
| `fixed`     | Never moves: floors, walls                                |
| `kinematic` | Moves only by the velocity or position you set: platforms |

Shapes are `{ kind: 'box', width, height }` (centred) and `{ kind: 'circle', radius }`. Options also include `x`, `y`, `rotation`, `restitution`, `friction`, `density` and `sensor`.

Read `x`, `y` and `rotation` after a step to place a sprite. Move bodies with `setVelocity`, `applyImpulse` or `setPosition`; read `velocity`.

## Collisions and sensors

```ts
ball.collisionStarted.addListener((other) => console.log('hit', other.gameObject.name));
physics.collisionEnded.addListener(({ a, b }) => console.log('apart', a, b));
```

Each body raises `collisionStarted` and `collisionEnded` with the other body, and the world raises both with the pair. A body with `sensor: true` detects overlaps and raises the events without pushing anything: use it for triggers and pickup zones.

## Beyond the wrapper

`physics.world` is the Rapier `World`, and `physics.rapier` the module, for joints, ray casts and everything else Rapier does.

The package is covered by automated tests that run the real Rapier in Node: gravity, determinism, resting contact, bounce, events, sensors, kinematic motion, impulses and clean-up.
