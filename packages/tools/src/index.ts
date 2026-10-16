/**
 * Developer tools for PortoJS: a headless balancing simulator and a game inspector.
 *
 * @module @portojs/tools
 */

export { simulate } from './simulate.ts';
export type { SimulationOptions, SimulationResult, SimulationSample } from './simulate.ts';
export { buyCheapest, buyInOrder } from './strategies.ts';
export type { PricedPurchasable, Purchasable } from './strategies.ts';
export { fastForward, findComponent, inspectGame, setComponentState } from './inspector.ts';
export type { ComponentInfo, GameInfo, ObjectInfo } from './inspector.ts';
export { Profiler } from './profiler.ts';
export type { ProfileEntry, ProfileFrame, ProfilePhase, ProfilerOptions } from './profiler.ts';
export { reloadWithState } from './hot-reload.ts';
