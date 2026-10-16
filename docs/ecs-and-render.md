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

## Text

Two ways to draw text, both into the same `SpriteBatch` as everything else.

### Bitmap fonts

A bitmap font is a texture of glyphs and a metrics file. `parseBmfont` reads the text format of AngelCode BMFont (also written by Hiero, ShoeBox and msdf-bmfont); only fonts with one texture page are supported.

```ts
import { BitmapFont, parseBmfont } from '@portojs/render';

const font = new BitmapFont(texture, parseBmfont(fntText));
font.draw(batch, 'Score: 120', { x: 10, y: 10, size: 24, color: 0xffd800ff });
```

`draw` accepts `size`, `maxWidth` (word wrapping, over-long words are broken), `align` (`left`, `center`, `right`), `lineSpacing`, `anchorX`/`anchorY` (`0.5` centres the block on `x`, `y`), `color` and `layer`. Kerning is applied, and a character the font lacks is drawn as `?` when the font has one. For text that does not change every frame, call `font.layout(text, options)` once and `font.drawLayout(batch, layout, options)` each frame; the layout also gives you the measured `width` and `height`.

### Canvas text

`CanvasText` draws with the browser's fonts on a canvas and uploads the result as a texture. It re-rasterises only when the text or style changes, and frees the old texture when it does.

```ts
import { CanvasText } from '@portojs/render';

const label = new CanvasText(renderer, (w, h) => new OffscreenCanvas(w, h));
label.set('Level 3', {
  font: 'bold 32px Arial',
  color: '#ffffff',
  stroke: { color: '#000000', width: 4 },
  resolution: window.devicePixelRatio,
});
label.draw(batch, { x: 400, y: 20, anchorX: 0.5 });
```

The font size must be in `px`. Use `rasterizeText` directly if you want the canvas without the cache. Both take the canvas as a function, so they work with `OffscreenCanvas` in a worker, a DOM canvas, or a fake in tests. Prefer bitmap fonts for text that changes often (a score counter), and canvas text for labels and for scripts a bitmap font does not cover.

## Camera control and several views

`CameraController` moves a `Camera2D` over time. Call `update(dt)` once per frame; it writes the camera.

```ts
import { CameraController } from '@portojs/render';

const controller = new CameraController(camera);
controller.setBounds({ x: 0, y: 0, width: 2000, height: 1000 }); // never show outside the world
controller.follow({
  target: () => player, // anything with x and y
  smoothTime: 0.2, // seconds to close most of the gap; 0 snaps
  deadZone: { width: 40, height: 20 }, // the target can move this far before the camera follows
  offset: { x: 30, y: 0 }, // look a little ahead
});
controller.shake(6, 0.3); // world units, seconds; shakes add up and fade out
controller.zoomTo(2, 0.5, easings.cubicOut); // smooth zoom, any (t) => t curve

controller.update(dt);
```

Following uses exponential smoothing, so the result does not depend on the frame rate. The bounds account for the current zoom and centre the camera when the world is smaller than the view. The shake does not change `controller.x` and `controller.y`, so it never drifts.

For split screen or a minimap, pass a viewport (in drawing-buffer pixels, origin top left) and give each camera the same size. Clear on the first call only:

```ts
renderer.render(mainCamera, mainBatch.build()); // clears the whole canvas
minimapCamera.setViewport(160, 120);
renderer.render(minimapCamera, minimapBatch.build(), {
  viewport: { x: canvas.width - 170, y: 10, width: 160, height: 120 },
  clear: false,
});
```

## ECS and game objects together

Use game objects and components for the few things that have rules and identity (the player, a boss, a shop), and the ECS for the many that are just data (bullets, particles, tiles). `EntityLink` joins the two:

```ts
import { EcsWorld, EntityLink, defineComponent } from '@portojs/ecs';

const Position = defineComponent({ x: 'f32', y: 'f32' });
const Health = defineComponent({ hp: 'u16' });

const ecs = game.createObject('Ecs').addComponent(EcsWorld, {
  components: { Position, Health }, // saved with the game, by these names
});

const player = game.createObject('Player').addComponent(EntityLink, {
  components: [{ component: Position }, { component: Health, values: { hp: 100 } }],
});

const health = ecs.world.use(Health);
health.hp[player.entity] -= 10; // fast, typed-array access
EntityLink.objectOf(game, someEntity)?.name; // from an entity back to its object
```

The entity is created with the object and destroyed with it.

### Saving

Without the `components` option the ECS data is not saved. With it, every live entity and the values of the listed components are in the save and come back with the same ids, so a link keeps pointing at the same entity. Components that are not listed are not saved, and values that are not finite are saved as `0`. A link whose object did not exist when the save was made gets a fresh entity.

You can also save a world yourself: `world.snapshot({ Position, Health })` returns plain JSON, and `world.restore(snapshot, { Position, Health })` replaces the world with it, rejecting a malformed snapshot with `SnapshotError` before anything changes.

An entity id is only stable between a save and the load that follows. Do not keep ids in long-lived places; read `link.entity` when you need it.

## Particles

`ParticleEmitter` emits and animates particles (sparks, smoke, coins) in typed arrays and draws them into the same `SpriteBatch` as everything else, so thousands cost one draw call. Measured on Node 24: 50,000 particles update in about 0.5 ms and draw into a batch in about 2 ms.

```ts
import { ParticleEmitter } from '@portojs/render';

const sparks = new ParticleEmitter({
  texture: dot,
  max: 2000,
  lifetime: [0.4, 0.8], // seconds, a range is picked per particle
  speed: [60, 140],
  angle: [-Math.PI, 0], // upwards: the world's y axis points down
  gravity: { x: 0, y: 200 },
  drag: 0.2, // fraction of the velocity lost per second
  size: { start: 6, end: 0 },
  color: { start: 0xffd800ff, end: 0xff300000 }, // 0xRRGGBBAA, fades to transparent
  area: { kind: 'circle', radius: 4 },
});

sparks.x = hit.x;
sparks.y = hit.y;
sparks.burst(24); // a puff
// or a stream: pass rate: 60 in the options, and toggle sparks.emitting

sparks.update(dt); // every frame
sparks.draw(batch); // before batch.build()
```

Particles beyond `max` are dropped, not queued. Pass a seeded `random` (for example `rng.next` from `@portojs/math`) for effects that repeat exactly, and `ease` to shape the change over life.
