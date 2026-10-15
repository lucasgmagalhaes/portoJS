import type { JsonValue } from '@portojs/core';
import type { Coroutine, CoroutineYield } from './coroutine.ts';
import type { Game } from './game.ts';
import type { GameObject } from './game-object.ts';

/**
 * A component class: constructed with the object it is attached to and its options.
 */
export type ComponentConstructor<C extends Component = Component, O = never> = new (
  gameObject: GameObject,
  options: O,
) => C;

/**
 * Matches a component class for lookups, including abstract base classes.
 */
export type ComponentType<C extends Component = Component> = abstract new (...args: never[]) => C;

/**
 * Base class of everything that gives a {@link GameObject} behavior, like Unity's
 * `MonoBehaviour`. Extend it and implement the lifecycle methods you need; every method below
 * is optional.
 *
 * Lifecycle, in order: `awake` (right after creation), `onEnable`, `start` (before the first
 * update), then `fixedUpdate` every step. `onDisable` and `onDestroy` close it. `onOffline`,
 * `onSave` and `onLoad` connect it to offline progress and saves.
 *
 * @example
 * class Spinner extends Component {
 *   angle = 0;
 *   fixedUpdate(deltaTime: number) {
 *     this.angle += 90 * deltaTime;
 *   }
 * }
 */
export abstract class Component {
  /**
   * Stable name used as this component's key in saves. Defaults to the class name, which a
   * minifier may change, so give saved components an explicit one.
   */
  static typeId: string | undefined = undefined;

  /**
   * Components with a lower value run first within a step. Default `0`.
   */
  static executionOrder = 0;

  /**
   * @internal Set by the game once `start` has run.
   */
  startCalled = false;

  /**
   * @internal Set by the game when the component is destroyed.
   */
  isDestroyed = false;

  /**
   * @internal Last known effective activity, used to fire `onEnable` and `onDisable`.
   */
  wasActive = false;

  private enabledFlag = true;

  /**
   * @param gameObject the object this component is attached to.
   */
  constructor(readonly gameObject: GameObject) {}

  /**
   * The game this component lives in.
   */
  get game(): Game {
    return this.gameObject.game;
  }

  /**
   * Whether the component itself is switched on. See also {@link Component.isActive}.
   */
  get enabled(): boolean {
    return this.enabledFlag;
  }

  set enabled(value: boolean) {
    if (value === this.enabledFlag) return;
    this.enabledFlag = value;
    this.game.refreshActivity(this);
  }

  /**
   * `true` when the component is enabled and its object is active in the hierarchy.
   */
  get isActive(): boolean {
    return !this.isDestroyed && this.enabledFlag && this.gameObject.activeInHierarchy;
  }

  /**
   * Called once, right after the component is created and added.
   */
  awake?(): void;

  /**
   * Called when the component becomes active.
   */
  onEnable?(): void;

  /**
   * Called once, before the first `fixedUpdate` while active.
   */
  start?(): void;

  /**
   * Called every fixed step while active, with the step length in seconds.
   */
  fixedUpdate?(deltaTime: number): void;

  /**
   * Called when the component stops being active.
   */
  onDisable?(): void;

  /**
   * Called when the component is destroyed.
   */
  onDestroy?(): void;

  /**
   * Credits away-time. `elapsedMs` is already capped and scaled by the offline settings.
   * Prefer a closed form over looping.
   */
  onOffline?(elapsedMs: number): void;

  /**
   * Returns this component's state as JSON for the save, or `undefined` to save nothing.
   */
  onSave?(): JsonValue | undefined;

  /**
   * Restores state from {@link Component.onSave} output. Receives `undefined` when the save has
   * nothing for this component (new game, or added after the save) and must then reset to
   * defaults. Throw `SaveCorruptedError` for data it cannot accept.
   */
  onLoad?(data: JsonValue | undefined): void;

  /**
   * Finds a component of `type` on the same object.
   */
  getComponent<C extends Component>(type: ComponentType<C>): C | undefined {
    return this.gameObject.getComponent(type);
  }

  /**
   * Starts a coroutine owned by this component, like Unity's `StartCoroutine`. The generator
   * runs its first segment immediately, then resumes after each `yield` is satisfied.
   *
   * @example
   * *blink() {
   *   while (true) {
   *     this.visible = !this.visible;
   *     yield new WaitForSeconds(0.5);
   *   }
   * }
   * this.startCoroutine(this.blink());
   */
  startCoroutine(routine: Iterator<CoroutineYield>): Coroutine {
    return this.game.startCoroutine(this, routine);
  }

  /**
   * Stops every coroutine this component started.
   */
  stopAllCoroutines(): void {
    this.game.stopCoroutines(this);
  }

  /**
   * Destroys this component.
   */
  destroy(): void {
    this.gameObject.removeComponent(this);
  }
}
