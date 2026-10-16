# Platformer

A level drawn as text, turned into the JSON Tiled would save, parsed with `parseTiledMap` and played with `solidRects`.

<<< ../../examples/platformer/src/level.ts{ts}

<<< ../../examples/platformer/src/game.ts{ts}

## How it works

- `solidRects(view, 'ground', 'solid')` merges the solid tiles into a few rectangles; the player collides with those, one axis at a time.
- **Coyote time** (`CoyoteTime`, 0.1 s) lets a jump work just after walking off a ledge. The **jump buffer** (`InputBuffer`, 0.12 s) remembers a jump pressed just before landing. Releasing the button early cuts the jump.
- Coins, the start and the goal are objects of the map, so a level editor can move them.
- The camera is a `CameraController` that follows the player inside the map bounds.

To use a real map, save it from Tiled as JSON (CSV tile layers) and pass it to `parseTiledMap`.
