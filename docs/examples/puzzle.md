# Puzzle (2048)

<<< ../../examples/puzzle/src/game.ts{ts}

## How it works

- `move` returns the slides (where each tile came from and went) so the app can animate them with `Tweens`, then shows the settled board and pops the new tile.
- The generator state is part of every undo snapshot and every save, so **undo brings back the same future**: the same move after an undo spawns the same tile.
- `save()` returns plain data. The app stores it in `localStorage` after each move and loads it at start.
- Swipes come from `GestureRecognizer` on a `Pointer`; arrows and WASD work too.
