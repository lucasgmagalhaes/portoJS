/**
 * The Unity-style Game, GameObject and Component runtime of PortoJS, with coroutines, prefabs and JSON scenes.
 *
 * @module @portojs/runtime
 */

export { Component } from './component.ts';
export type { ComponentConstructor, ComponentType } from './component.ts';
export { Coroutine, WaitForSeconds, WaitUntil, WaitWhile, YieldInstruction } from './coroutine.ts';
export type { CoroutineYield } from './coroutine.ts';
export { Game } from './game.ts';
export type {
  CreateObjectOptions,
  GameEvents,
  GameOfflineOptions,
  GameOptions,
  InstantiateOptions,
  LoadOptions,
  OfflineSource,
} from './game.ts';
export { GameEvent } from './game-event.ts';
export type { GameEventListener } from './game-event.ts';
export { GameObject } from './game-object.ts';
export { Prefab } from './prefab.ts';
export type { PrefabBuilder } from './prefab.ts';
export { ComponentRegistry, SceneError, loadScene } from './scene.ts';
export type { Scene, SceneComponent, SceneObject } from './scene.ts';
export { Time } from './time.ts';
export { Timer } from './timers.ts';
