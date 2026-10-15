/**
 * Run a PortoJS game in a Web Worker and drive it from the main thread over a typed message channel.
 *
 * @module @portojs/worker
 */

export { connectGame } from './connect.ts';
export type { RemoteGame } from './connect.ts';
export { serveGame } from './serve.ts';
export type { Command, ServeOptions, ServedGame } from './serve.ts';
export type { FromWorker, PortLike, ToWorker } from './protocol.ts';
