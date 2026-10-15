# A sprite game

You will draw ten thousand moving sprites. The simulation uses the ECS, and the drawing uses the WebGPU renderer with a WebGL2 fallback.

```
pnpm add @portojs/ecs @portojs/render
```

## Why an ECS

Game objects and components are great for a few hundred things with rich behaviour. For thousands of similar things, the `@portojs/ecs` package stores each component as typed arrays and keeps queries cached, so a system is a tight loop over numbers. Both models live side by side: an `EcsWorld` component can run an ECS inside a game.

<<< @/tutorials/code/sprites.ts{ts}

## Step by step

1. **Components.** `defineComponent({ vx: 'f32', vy: 'f32' })` declares a component as a struct of typed arrays. `Transform` and `Sprite` come from the render package.
2. **The world.** `spawnSprite` creates an entity with a transform and a sprite. A **query** such as `world.query(Transform, Velocity)` finds the entities that have both, and the system loops over `moving.entities`.
3. **The frame.** `createSpriteSystem` copies transforms and sprites into a `SpriteBatch`. The batch groups sprites by layer and texture, so every sprite with the same texture is one instanced draw call.
4. **The renderer.** `createRenderer(canvas)` asks for WebGPU and falls back to WebGL2. Both backends take the same `render(camera, batch.build())` call.

## How fast is it

On the reference machine, 10,000 entities cost about 0.4 ms per frame to simulate and batch, and 50,000 about 2 ms. Run `pnpm bench` to measure yours. The tests cover the batching logic and the moving system; the real GPU drawing is verified by browser tests against both backends.

## Next

Add [input](/input-and-audio) to move something yourself, or [physics](/tutorials/bouncing-ball) to make things collide.
