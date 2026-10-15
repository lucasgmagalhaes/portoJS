import type { JsonValue } from '@portojs/core';

/**
 * The part of a `MessagePort`, `Worker` or `DedicatedWorkerGlobalScope` this package uses. All
 * three satisfy it, and so do the ports of a `MessageChannel`, which is how the tests run it.
 */
export interface PortLike {
  /**
   * Sends a structured-cloneable message to the other side.
   */
  postMessage(message: unknown): void;
  /**
   * Listens for messages; the payload is `event.data`.
   */
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  /**
   * Stops listening.
   */
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  /**
   * Starts delivery on a `MessagePort`; absent on workers, which deliver at once.
   */
  start?(): void;
}

/**
 * Messages from the page to the worker.
 */
export type ToWorker =
  | { readonly type: 'call'; readonly id: number; readonly name: string; readonly arg: JsonValue }
  | { readonly type: 'dispose' };

/**
 * Messages from the worker to the page.
 */
export type FromWorker =
  | { readonly type: 'ready'; readonly state: JsonValue }
  | { readonly type: 'state'; readonly state: JsonValue }
  | { readonly type: 'result'; readonly id: number; readonly value: JsonValue }
  | { readonly type: 'error'; readonly id: number; readonly message: string };
