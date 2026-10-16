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
export { Autosave } from './autosave.ts';
export type { AutosaveLoadResult, AutosaveOptions } from './autosave.ts';
export { IndexedDbSaveStorage, MemorySaveStorage, WebSaveStorage } from './storage.ts';
export type { IndexedDbSaveStorageOptions, SaveStorage, WebStorageLike } from './storage.ts';
export { SceneManager } from './scene-manager.ts';
export type {
  SceneBuilder,
  SceneContext,
  SceneLoadOptions,
  SceneManagerOptions,
  SceneSource,
  SceneTransition,
} from './scene-manager.ts';
export { Timer } from './timers.ts';
export { Pool } from './pool.ts';
export type { PoolOptions } from './pool.ts';
export { SaveSlots, SlotEmptyError } from './save-slots.ts';
export type { SaveSlotsOptions, SlotInfo } from './save-slots.ts';
export { CloudSync } from './cloud-sync.ts';
export type { CloudSyncOptions, ConflictPolicy, SyncResult } from './cloud-sync.ts';
