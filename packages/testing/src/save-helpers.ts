import type { JsonObject } from '@portojs/core';
import type { Game } from '@portojs/runtime';

/**
 * The game's saved data with the parts that change on every save removed (the time and the
 * checksum), so it can be compared or kept as a snapshot.
 *
 * @example
 * expect(stableSave(game)).toMatchSnapshot();
 */
export function stableSave(game: Game): JsonObject {
  return game.save().data;
}

/**
 * Saves a game and loads the save into a fresh game made by `build`, then returns the fresh game.
 * Use it to check that everything that should be saved is.
 *
 * @param game the game to save.
 * @param build makes an identical, empty game (the same objects and components, in the same order).
 *
 * @example
 * const copy = roundTrip(game, () => buildGame());
 * expect(stableSave(copy)).toEqual(stableSave(game));
 */
export function roundTrip<G extends Game>(game: Game, build: () => G): G {
  const copy = build();
  copy.load(game.save(), { offline: false });
  return copy;
}
