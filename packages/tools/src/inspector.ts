import type { JsonValue } from '@portojs/core';
import type { Component, Game, GameObject } from '@portojs/runtime';

/**
 * A component as seen by the inspector.
 */
export interface ComponentInfo {
  /**
   * The component's `typeId`, or its class name when it has none.
   */
  readonly type: string;
  /**
   * Whether the component itself is enabled.
   */
  readonly enabled: boolean;
  /**
   * Whether it is running: enabled, on an active object.
   */
  readonly active: boolean;
  /**
   * What the component saves (`onSave`), or `undefined` when it saves nothing.
   */
  readonly state: JsonValue | undefined;
  /**
   * `true` when `setComponentState` can edit it (it has `onLoad`).
   */
  readonly editable: boolean;
}

/**
 * A game object as seen by the inspector.
 */
export interface ObjectInfo {
  /**
   * The object's name.
   */
  readonly name: string;
  /**
   * Whether the object itself is active.
   */
  readonly active: boolean;
  /**
   * The object's components.
   */
  readonly components: readonly ComponentInfo[];
  /**
   * Child objects.
   */
  readonly children: readonly ObjectInfo[];
}

/**
 * A snapshot of a whole game.
 */
export interface GameInfo {
  /**
   * Fixed steps run so far.
   */
  readonly tickCount: number;
  /**
   * Whether the loop is running.
   */
  readonly running: boolean;
  /**
   * Current game time in milliseconds.
   */
  readonly now: number;
  /**
   * Root objects with their children.
   */
  readonly objects: readonly ObjectInfo[];
}

function typeOf(component: Component): string {
  const type = component.constructor as { typeId?: string | undefined; name: string };
  return type.typeId ?? type.name;
}

function describeComponent(component: Component): ComponentInfo {
  return {
    type: typeOf(component),
    enabled: component.enabled,
    active: component.isActive,
    state: component.onSave?.(),
    editable: component.onLoad !== undefined,
  };
}

function describeObject(object: GameObject): ObjectInfo {
  const components: ComponentInfo[] = [];
  for (const component of object.components) components.push(describeComponent(component));
  const children: ObjectInfo[] = [];
  for (const child of object.children) children.push(describeObject(child));
  return { name: object.name, active: object.activeSelf, components, children };
}

/**
 * Reads the whole object tree of a game: names, components, and each component's saved state.
 * Plain data, so it can be logged, sent to a panel or compared in a test.
 *
 * @example
 * console.log(JSON.stringify(inspectGame(game), null, 2));
 */
export function inspectGame(game: Game): GameInfo {
  const objects: ObjectInfo[] = [];
  for (const object of game.objects) {
    if (object.parent === undefined) objects.push(describeObject(object));
  }
  return { tickCount: game.tickCount, running: game.running, now: game.now(), objects };
}

/**
 * Overwrites a component's state, the way loading a save would (`onLoad`). Use it to edit values
 * while the game runs.
 *
 * @throws {TypeError} if the component has no `onLoad`.
 */
export function setComponentState(component: Component, state: JsonValue): void {
  if (component.onLoad === undefined) {
    throw new TypeError(`${typeOf(component)} cannot be edited: it has no onLoad`);
  }
  component.onLoad(state);
}

/**
 * Finds a component by object name and component type, for scripts and consoles.
 *
 * @example
 * const gold = findComponent(game, 'Gold', 'Resource');
 */
export function findComponent(game: Game, objectName: string, type: string): Component | undefined {
  const object = game.find(objectName);
  if (object === undefined) return undefined;
  for (const component of object.components) {
    if (typeOf(component) === type) return component;
  }
  return undefined;
}

/**
 * Jumps a game forward in time. Short jumps run the real fixed steps; long ones are credited as
 * away-time, which uses the closed-form offline math and is instant however long they are.
 *
 * @param game the game.
 * @param ms game time to skip, in milliseconds.
 * @param mode `steps` runs every fixed step, `offline` credits it as time away (subject to the
 * game's offline cap and efficiency). Default `steps`.
 */
export function fastForward(game: Game, ms: number, mode: 'steps' | 'offline' = 'steps'): void {
  if (mode === 'offline') game.simulateOffline(ms);
  else game.advance(ms);
}
