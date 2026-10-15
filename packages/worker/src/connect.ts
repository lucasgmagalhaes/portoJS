import type { JsonValue } from '@portojs/core';
import type { FromWorker, PortLike, ToWorker } from './protocol.ts';

/**
 * A game running in a worker, seen from the page.
 */
export interface RemoteGame<S extends JsonValue = JsonValue> {
  /**
   * Resolves with the first state, once the worker has built the game.
   */
  readonly ready: Promise<S>;
  /**
   * The latest state the worker published, or `undefined` until `ready`.
   */
  readonly state: S | undefined;
  /**
   * Runs `listener` with every new state. Returns a function that stops it.
   */
  subscribe(listener: (state: S) => void): () => void;
  /**
   * Calls a command in the worker. Rejects with the worker's error message when it fails.
   */
  call<R extends JsonValue = JsonValue>(name: string, arg?: JsonValue): Promise<R>;
  /**
   * The worker's save string.
   */
  save(): Promise<string>;
  /**
   * Loads a save string in the worker.
   */
  load(save: string): Promise<void>;
  /**
   * Stops the game in the worker, rejects pending calls and removes the listener.
   */
  dispose(): void;
}

interface Pending {
  readonly resolve: (value: JsonValue) => void;
  readonly reject: (error: Error) => void;
}

/**
 * Connects to a game served by `serveGame`. Pass the `Worker` you created, or one end of a
 * `MessageChannel`.
 *
 * @example
 * const worker = new Worker(new URL('./game.worker.ts', import.meta.url), { type: 'module' });
 * const remote = connectGame<{ gold: string }>(worker);
 * remote.subscribe((state) => console.log(state.gold));
 * await remote.call('buy', 'miner');
 */
export function connectGame<S extends JsonValue = JsonValue>(port: PortLike): RemoteGame<S> {
  const pending = new Map<number, Pending>();
  const listeners = new Set<(state: S) => void>();
  let nextId = 1;
  let latest: S | undefined;
  let disposed = false;

  let announceReady: (state: S) => void = () => undefined;
  const captureReady = (resolve: (state: S) => void): void => {
    announceReady = resolve;
  };
  const ready = new Promise<S>(captureReady);

  const onMessage = (event: MessageEvent): void => {
    const message = event.data as FromWorker;
    if (message.type === 'ready' || message.type === 'state') {
      const state = message.state as S;
      latest = state;
      if (message.type === 'ready') announceReady(state);
      for (const listener of [...listeners]) listener(state);
      return;
    }
    const waiting = pending.get(message.id);
    if (waiting === undefined) return;
    pending.delete(message.id);
    if (message.type === 'result') waiting.resolve(message.value);
    else waiting.reject(new Error(message.message));
  };

  const send = (message: ToWorker): void => {
    port.postMessage(message);
  };

  const call = <R extends JsonValue = JsonValue>(
    name: string,
    arg: JsonValue = null,
  ): Promise<R> => {
    if (disposed) return Promise.reject(new Error('RemoteGame is disposed'));
    const id = nextId;
    nextId += 1;
    const start = (resolve: (value: R) => void, reject: (error: Error) => void): void => {
      pending.set(id, { resolve: resolve as (value: JsonValue) => void, reject });
      send({ type: 'call', id, name, arg });
    };
    return new Promise<R>(start);
  };

  const subscribe = (listener: (state: S) => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    send({ type: 'dispose' });
    port.removeEventListener('message', onMessage);
    for (const waiting of pending.values()) waiting.reject(new Error('RemoteGame is disposed'));
    pending.clear();
    listeners.clear();
  };

  port.addEventListener('message', onMessage);
  port.start?.();

  return {
    ready,
    get state() {
      return latest;
    },
    subscribe,
    call,
    save: () => call<string>('save'),
    load: async (save) => {
      await call('load', save);
    },
    dispose,
  };
}
