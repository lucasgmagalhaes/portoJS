import type { JsonValue } from '@portojs/core';
import type { Game } from '@portojs/runtime';
import type { FromWorker, PortLike, ToWorker } from './protocol.ts';

/**
 * A command the page can call: it runs inside the worker with the game, and returns JSON.
 */
export type Command = (game: Game, arg: JsonValue) => JsonValue | Promise<JsonValue>;

/**
 * Options of {@link serveGame}.
 */
export interface ServeOptions {
  /**
   * The channel to the page: `self` inside a worker, or one end of a `MessageChannel`.
   */
  readonly port: PortLike;
  /**
   * Builds the game. It runs once, inside the worker.
   */
  readonly create: () => Game;
  /**
   * Reads the state the page should see, as JSON. Called every `publishEveryMs`.
   */
  readonly select: (game: Game) => JsonValue;
  /**
   * Things the page may ask the game to do, by name.
   */
  readonly commands?: Readonly<Record<string, Command>>;
  /**
   * How often to send the state, in milliseconds. Default 100.
   */
  readonly publishEveryMs?: number;
  /**
   * Start the game's own loop. Default `true`; pass `false` to step it yourself (tests).
   */
  readonly autostart?: boolean;
}

/**
 * A game served to a page.
 */
export interface ServedGame {
  /**
   * The game running in the worker.
   */
  readonly game: Game;
  /**
   * Sends the current state to the page now.
   */
  publish(): void;
  /**
   * Stops the loop and the timer and removes the listener.
   */
  dispose(): void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs a game inside a worker and serves it to the page: the page sees the state from `select`
 * a few times a second and can call named commands. The simulation never touches the page's
 * main thread, so a heavy game cannot make the interface stutter. Pair it with `connectGame`
 * on the page.
 *
 * Besides your commands, `save` returns the exported save string and `load` imports one.
 *
 * @example
 * serveGame({
 *   port: self,
 *   create: () => buildGame(),
 *   select: (game) => ({ gold: format(game.find('Gold')!.requireComponent(Resource).amount) }),
 *   commands: { buy: (game) => buyMiner(game) },
 * });
 */
export function serveGame(options: ServeOptions): ServedGame {
  const { port } = options;
  const game = options.create();
  const commands = options.commands ?? {};

  const send = (message: FromWorker): void => {
    port.postMessage(message);
  };
  const publish = (): void => {
    send({ type: 'state', state: options.select(game) });
  };

  const run = async (id: number, name: string, arg: JsonValue): Promise<void> => {
    try {
      let value: JsonValue;
      if (name === 'save') {
        value = game.exportSave();
      } else if (name === 'load') {
        if (typeof arg !== 'string') throw new TypeError('load needs a save string');
        game.importSave(arg);
        value = null;
      } else {
        const command = commands[name];
        if (command === undefined) throw new Error(`Unknown command "${name}"`);
        value = await command(game, arg);
      }
      send({ type: 'result', id, value });
    } catch (error) {
      send({ type: 'error', id, message: messageOf(error) });
    }
  };

  const timer = setInterval(publish, options.publishEveryMs ?? 100);
  const dispose = (): void => {
    clearInterval(timer);
    port.removeEventListener('message', onMessage);
    game.dispose();
  };
  function onMessage(event: MessageEvent): void {
    const message = event.data as ToWorker;
    if (message.type === 'call') void run(message.id, message.name, message.arg);
    else dispose();
  }

  port.addEventListener('message', onMessage);
  port.start?.();
  if (options.autostart !== false) game.start();
  send({ type: 'ready', state: options.select(game) });
  return { game, publish, dispose };
}
