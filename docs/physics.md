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

## Layers and queries

Declare collision layers on the world, up to 16, and put bodies on them:

```ts
const physics = game.createObject('Physics').addComponent(PhysicsWorld, {
  rapier,
  layers: ['ground', 'player', 'enemy', 'pickup'],
});

game.createObject('Player').addComponent(RigidBody2D, {
  shape: { kind: 'circle', radius: 0.5 },
  layer: 'player',
  collidesWith: ['ground', 'enemy'], // passes through pickups' solids
});
```

A pair collides only when each body's layer is in the other's `collidesWith`. Without `layers`, everything collides with everything. A `sensor: true` body raises `collisionStarted` and `collisionEnded` without pushing anything.

Queries run against the bodies as of the last fixed step:

```ts
const hit = physics.raycast({ x: 0, y: 0 }, { x: 1, y: 0 }, 20, { layers: ['ground'] });
if (hit) console.log(hit.body.gameObject.name, hit.distance, hit.point, hit.normal);

physics.overlapPoint(x, y); // bodies under a point, for example a click
physics.overlapCircle(x, y, radius); // an explosion
physics.overlapBox(x, y, width, height, rotation); // a melee hit area
```

All of them take `{ layers, includeSensors, exclude }`; sensors are skipped unless you ask, and `exclude` ignores the body doing the casting. `body.rigidBody` and `physics.world` expose Rapier for anything not wrapped, such as shape casts.

## Joints

`physics.createJoint(bodyA, bodyB, spec, options)` connects two bodies with a constraint:

```ts
// a pendulum: a hinge at a world point
physics.createJoint(ceiling, bob, { kind: 'revolute' }, { worldAnchor: { x: 0, y: 0 } });

// a rope: at most 3 units between the centres, slack when closer
physics.createJoint(anchor, weight, { kind: 'rope', length: 3 });

// a spring pulling towards 2 units apart
physics.createJoint(wall, mass, { kind: 'spring', restLength: 2, stiffness: 50, damping: 2 });

// a piston: the second body slides along an axis
physics.createJoint(rail, slider, { kind: 'prismatic', axis: { x: 1, y: 0 } });

// a weld: the bodies move as one, keeping their current pose
physics.createJoint(hull, turret, { kind: 'fixed' });
```

Place the joint with `worldAnchor` (one point in the world, as the bodies are now) or with `anchorA` and `anchorB` (offsets from each body's centre, in its own space). Without any, the joint attaches at the bodies' centres. The returned `Joint` has `remove()` and `removed`; a joint also goes away when either body is destroyed.

## More shapes

Besides `box` and `circle`, a body can be a `capsule` (a `length` between the centres of its two round ends, lying along x, and a `radius`) or a `polygon`: the convex hull of the points you give, around the body's centre. For a concave outline, build several bodies and join them with a `fixed` joint. A polygon needs at least three points that are not in a line.
