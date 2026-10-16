# Math and random numbers

`@portojs/math` has the small pieces almost every game needs: vectors, rectangles, a 2D transform, geometry tests, colours and a **seeded random number generator** whose state goes into the save.

```
pnpm add @portojs/math
```

## Vectors and rectangles

Methods return a new object, or write into `out` so a hot loop does not allocate.

```ts
import { Rect, Vec2 } from '@portojs/math';

const velocity = new Vec2(3, 4);
velocity.length(); // 5
velocity.add(new Vec2(1, 1), velocity); // in place, no allocation

const hitbox = new Rect(0, 0, 10, 10);
hitbox.intersects(new Rect(5, 5, 10, 10)); // true
```

## Transforms

`Mat3` is a 2D affine transform. `Mat3.compose(x, y, rotation, scaleX, scaleY)` scales, rotates and then translates; `multiply` applies its argument first; `invert` returns `null` for a singular matrix.

## Geometry

`pointInCircle`, `circleIntersectsCircle`, `circleIntersectsRect`, `pointInPolygon`, `segmentsIntersect` and `polygonsIntersect` (Separating Axis Theorem, convex polygons only).

## Seeded random numbers

`Rng` is xoshiro128\*\*. The same seed gives the same sequence on every platform, so tests, replays and offline progress are reproducible.

```ts
import { Rng } from '@portojs/math';

const rng = new Rng(42);
rng.int(1, 6); // inclusive, without modulo bias
rng.weighted([
  { value: 'common', weight: 9 },
  { value: 'rare', weight: 1 },
]);

const saved = rng.state(); // four integers, JSON-safe: put it in the save
const restored = Rng.fromState(saved);
```

Give each subsystem its own generator with `rng.fork()` so adding a random call in one place does not change the sequence somewhere else.

## Colours and scalars

`Color` parses and prints hex, converts from HSL and interpolates. `clamp`, `lerp`, `inverseLerp`, `remap` and `wrap` cover the usual scalar helpers.
