# Example games

Runnable games under `examples/`, each built from the packages and each with a headless test of its rules and a browser smoke test. Run one with `pnpm --filter portojs-<name>-example dev`.

| Example | What it shows | Packages |
| --- | --- | --- |
| [Shooter](/examples/shooter) | A vertical shooter on the ECS: seeded waves, circle collisions, particle explosions | `ecs`, `math`, `render`, `input` |
| [Platformer](/examples/platformer) | A Tiled level, merged collision rectangles, coyote time and jump buffer, a following camera | `tilemap`, `input`, `render` |
| [Puzzle](/examples/puzzle) | 2048 with swipes, tweens, undo that restores the random future, and saves | `math`, `input`, `tween`, `render` |
| [Clicker](https://github.com/lucasgmagalhaes/portojs/tree/main/examples/clicker) and [Sprites](https://github.com/lucasgmagalhaes/portojs/tree/main/examples/sprites) | A full idle game with offline progress, and 10,000 sprites on the GPU | `idle`, `runtime`, `render` |

Every game keeps its **rules in a file with no browser code** (`game.ts`). The test suite plays it in Node with a fixed seed, and `main.ts` only reads input, calls `step` and draws. That split is the one to copy.
