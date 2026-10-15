/**
 * leveling: a headless engine for idle and incremental games.
 *
 * - {@link createGame} builds a complete game from one declarative object.
 * - {@link createCore} + plugins gives you the game-agnostic kernel to compose your own.
 */
export * from './core/index.js';
export * from './mechanics/index.js';
export { createGame } from './game.js';
export type { Game, GameConfig, GameView } from './game.js';
