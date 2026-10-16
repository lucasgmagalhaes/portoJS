# ECS and rendering

Two optional packages sit next to the Unity-style runtime: `@portojs/ecs` for data-oriented simulation and `@portojs/render` for batched 2D drawing with WebGPU and a WebGL2 fallback. Neither is needed for the headless runtime, and the umbrella `portojs` package does not include them, so they never reach a bundle that does not import them.

```
pnpm add @portojs/ecs @portojs/render
```

## ECS

Entities are integers, components are numeric data in typed arrays (struct-of-arrays) and systems are functions over queries.

```ts
import { World, defineComponent, not } from '@portojs/ecs';

const Position = defineComponent({ x: 'f32', y: 'f32' });
const Velocity = defineComponent({ vx: 'f32', vy: 'f32' });
const Frozen = defineComponent({ flag: 'u8' });

const world = new World({ capacity: 50_000 });
const pos = world.use(Position);
const vel = world.use(Velocity);

const entity = world.createEntity();
world.addComponent(entity, Position, { x: 10, y: 20 });
world.addComponent(entity, Velocity, { vx: 1, vy: 0 });

const moving = world.query(Position, Velocity, not(Frozen));
world.addSystem(function move(_world, dt) {
  for (const e of moving.entities) {
    pos.x[e] = (pos.x[e] ?? 0) + (vel.vx[e] ?? 0) * dt;
    pos.y[e] = (pos.y[e] ?? 0) + (vel.vy[e] ?? 0) * dt;
  }
});

world.update(1 / 60);
```

- Field types are `i8`, `u8`, `i16`, `u16`, `i32`, `u32`, `f32` and `f64`.
- A world allocates its arrays once, at `capacity` entities, so the arrays never move and `world.use()` results stay valid. Adding more entities than `capacity` throws.
- Queries are cached and refresh lazily when entities or components change. Do not add or remove components of matched entities while iterating `query.entities`; collect them first.
- Entity ids are recycled after `destroyEntity`, so drop references to destroyed entities.
- ECS data is not part of game saves. Keep what must persist in a component and rebuild the rest.

### Inside a game

`EcsWorld` is a regular component that runs the world's systems on every fixed step, in game time:

```ts
import { EcsWorld } from '@portojs/ecs';

const ecs = game.createObject('Ecs').addComponent(EcsWorld, { capacity: 50_000 });
ecs.world.addSystem(move);
```

## Rendering

```ts
import {
  Camera2D,
  SpriteBatch,
  createRenderer,
  createSpriteSystem,
  spawnSprite,
} from '@portojs/render';

const renderer = await createRenderer(canvas, { clearColor: [0.06, 0.06, 0.09, 1] });
const camera = new Camera2D(canvas.width, canvas.height);

const hero = renderer.createTexture(await createImageBitmap(blob));
const textures = new Map([[hero.id, hero]]);

const batch = new SpriteBatch();
world.addSystem(createSpriteSystem(world, textures, batch), { order: 100 });
spawnSprite(world, hero, { x: 0, y: 0 });

function frame(dt: number) {
  world.update(dt);
  renderer.render(camera, batch.build());
}
```

- `createRenderer` tries WebGPU first and falls back to WebGL2. Force one with `{ backend: 'webgl2' | 'webgpu' }`; `renderer.backend` tells which is in use.
- **Auto-batching.** `SpriteBatch` groups sprites by layer and texture. Each group is one instanced draw call, so 10,000 sprites that share a texture cost one call. Use an atlas and `u`, `v`, `uWidth`, `vHeight` to keep the number of textures low.
- World axes are screen-like (y down). The camera looks at `(x, y)`, with `zoom` and `rotation`; `screenToWorld` and `worldToScreen` convert between viewport pixels and world units.
- You can skip ECS entirely and call `batch.add(texture, { x, y, width, height })` yourself, or `batch.addRaw(...)` in hot loops to avoid allocating.
- Keep the drawing buffer and camera in sync: `renderer.resize(w, h); camera.setViewport(w, h)`.
- WebGL context loss is not handled yet.

### Measured

`pnpm exec tsx bench/ecs-render.bench.ts` on Node 24: moving and collecting sprites for 10,000 entities takes about 0.4 ms per frame, for 50,000 entities about 2.1 ms, and building the draw groups for 50,000 instances about 0.1 ms. These are CPU numbers; GPU time depends on the device.

The `examples/sprites` app draws 10,000 moving sprites. Run it with `pnpm --filter portojs-sprites-example dev`; add `?backend=webgl2` or `?count=50000` to the URL.

## Atlases, animation, layers and scaling

### Atlases

A sprite sheet packed by TexturePacker or Aseprite (JSON, hash or array format) becomes an `Atlas`: one texture, many named frames, one draw call.

```ts
import { Atlas, SpriteBatch, parseAtlasJson } from '@portojs/render';

const atlas = new Atlas(texture, parseAtlasJson(json));
atlas.draw(batch, 'hero_idle', { x: 100, y: 50, scale: 2 });
```

Trimmed frames are drawn so the visible part stays where it was in the source image, and the pivot refers to the untrimmed image. Rotated frames are not supported: turn rotation off in the packer.

### Animation

`Animator` plays clips and tells which frame to show; it does not draw. Aseprite tags become clips with their own durations and direction.

```ts
import { Animator, clipsFromAtlas } from '@portojs/render';

const animator = new Animator(clipsFromAtlas(atlas), {
  onEvent: (event) => sound.play(event),
});
animator.addTransition({ from: 'idle', to: 'run', when: () => player.moving });
animator.play('idle');

// every frame, with the delta in seconds
animator.update(dt);
atlas.draw(batch, animator.frame, { x, y });
```

A clip loops, plays once (`onComplete`) or ping-pongs, and can fire named events on chosen frames. `animator.speed` scales playback.

### Sorting layers

Layers are numbers; `SortingLayers` gives them names and an order inside each layer:

```ts
const layers = new SortingLayers(['background', 'world', 'effects', 'ui']);
batch.add(texture, { ...draw, layer: layers.key('world', SortingLayers.ySort(y, 4)) });
```

Sprites of one layer are grouped by texture, so an `order` inside a layer is honoured between layers of the key, not between textures of the same key. Give two sprites different keys when one must be in front of the other.

### Resizing and scaling

`computeViewport` turns the size of the space available into a canvas size, a position, a drawing-buffer size and camera settings for six modes: `fit`, `fill`, `stretch`, `fixedWidth`, `fixedHeight` and `pixelPerfect`.

```ts
const layout = computeViewport({
  mode: 'fit',
  designWidth: 320,
  designHeight: 180,
  containerWidth: container.clientWidth,
  containerHeight: container.clientHeight,
  pixelRatio: window.devicePixelRatio,
});
renderer.resize(layout.pixelWidth, layout.pixelHeight);
applyViewport(camera, layout);

const point = containerToViewport(layout, event.offsetX, event.offsetY);
const world = camera.screenToWorld(point.x, point.y);
```

Call it again from a `ResizeObserver`. It is a pure function, so it is easy to test.
