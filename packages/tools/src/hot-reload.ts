import type { Game } from '@portojs/runtime';

/**
 * Rebuilds a running game from new code without losing its state: saves it, destroys every
 * object, runs `setup` to create them again (with the freshly loaded component classes) and
 * loads the save into the new objects.
 *
 * Wire it to your bundler's hot-module API, for Vite:
 *
 * @example
 * // main.ts
 * import { setup } from './setup.ts';
 * setup(game);
 * if (import.meta.hot) {
 *   import.meta.hot.accept('./setup.ts', (next) => {
 *     if (next) reloadWithState(game, next.setup);
 *   });
 * }
 *
 * @param game the running game.
 * @param setup creates the objects and components, exactly as at start-up.
 * @returns the number of objects that were replaced.
 * @throws if `setup` or the load fails; the error is the one from your code or the save.
 */
export function reloadWithState(game: Game, setup: (game: Game) => void): number {
  const save = game.save();
  const roots = game.objects.filter(isRoot);
  for (const object of roots) object.destroy();
  setup(game);
  game.load(save, { offline: false });
  return roots.length;
}

function isRoot(object: { readonly parent: unknown }): boolean {
  return object.parent === undefined;
}
