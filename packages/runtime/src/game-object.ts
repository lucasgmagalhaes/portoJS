import type { Component, ComponentConstructor, ComponentType } from './component.ts';
import type { Game } from './game.ts';

/**
 * A named container of components, like Unity's `GameObject`. Create one with
 * `game.createObject(name)`, then attach behavior with {@link GameObject.addComponent}.
 *
 * Object names are unique within a game, because they key the object's data in saves.
 */
export class GameObject {
  private readonly attached: Component[] = [];
  private readonly childObjects: GameObject[] = [];
  private activeFlag: boolean;
  private destroyedFlag = false;
  private layerValue = 0;

  /**
   * A free-form label for finding objects with {@link Game.findObjectsWithTag}, like Unity's tag.
   * Empty by default. Tags are not saved.
   */
  tag = '';

  /**
   * @internal Use `game.createObject`.
   * @param game the owning game.
   * @param name unique name.
   * @param parent optional parent object.
   * @param active initial value of {@link GameObject.activeSelf}.
   */
  constructor(
    readonly game: Game,
    readonly name: string,
    readonly parent: GameObject | undefined,
    active: boolean,
  ) {
    this.activeFlag = active;
    parent?.childObjects.push(this);
  }

  /**
   * Whether this object itself is switched on.
   */
  get activeSelf(): boolean {
    return this.activeFlag;
  }

  /**
   * Whether this object and every ancestor are switched on.
   */
  get activeInHierarchy(): boolean {
    if (this.destroyedFlag || !this.activeFlag) return false;
    return this.parent === undefined || this.parent.activeInHierarchy;
  }

  /**
   * Whether the object has been destroyed.
   */
  get isDestroyed(): boolean {
    return this.destroyedFlag;
  }

  /**
   * Child objects.
   */
  get children(): readonly GameObject[] {
    return this.childObjects;
  }

  /**
   * Components attached to this object, in the order they were added.
   */
  get components(): readonly Component[] {
    return this.attached;
  }

  /**
   * A number from `0` to `31` for grouping objects, like Unity's layer. `0` by default. Find
   * objects with {@link Game.findObjectsOnLayer}. Layers are not saved.
   *
   * @throws {RangeError} when set to anything but an integer from `0` to `31`.
   */
  get layer(): number {
    return this.layerValue;
  }

  set layer(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 31) {
      throw new RangeError('GameObject.layer must be an integer from 0 to 31');
    }
    this.layerValue = value;
  }

  /**
   * Switches this object (and so its children) on or off.
   */
  setActive(active: boolean): void {
    if (active === this.activeFlag) return;
    this.activeFlag = active;
    this.game.refreshActivity(this);
  }

  /**
   * Creates a component of `type`, attaches it, and calls its `awake`.
   *
   * @example
   * const gold = game.createObject('Gold').addComponent(Resource, { initial: 10 });
   */
  addComponent<C extends Component, O = undefined>(
    type: ComponentConstructor<C, O>,
    ...options: undefined extends O ? [options?: O] : [options: O]
  ): C {
    if (this.destroyedFlag) throw new Error(`GameObject "${this.name}" is destroyed`);
    const component = new type(this, options[0] as O);
    this.attached.push(component);
    this.game.registerComponent(component);
    return component;
  }

  /**
   * Finds the first component that is an instance of `type`.
   */
  getComponent<C extends Component>(type: ComponentType<C>): C | undefined {
    for (const component of this.attached) {
      if (component instanceof type) return component;
    }
    return undefined;
  }

  /**
   * Finds every component that is an instance of `type`.
   */
  getComponents<C extends Component>(type: ComponentType<C>): C[] {
    const found: C[] = [];
    for (const component of this.attached) {
      if (component instanceof type) found.push(component);
    }
    return found;
  }

  /**
   * Finds every component of `type` on this object's descendants, depth first, and on the object
   * itself when `includeSelf` is `true` (the default).
   */
  getComponentsInChildren<C extends Component>(type: ComponentType<C>, includeSelf = true): C[] {
    const found: C[] = includeSelf ? this.getComponents(type) : [];
    for (const child of this.childObjects) found.push(...child.getComponentsInChildren(type));
    return found;
  }

  /**
   * Finds the first component of `type` on this object (when `includeSelf` is `true`, the
   * default) or its closest ancestor that has one.
   */
  getComponentInParent<C extends Component>(
    type: ComponentType<C>,
    includeSelf = true,
  ): C | undefined {
    const own = includeSelf ? this.getComponent(type) : undefined;
    return own ?? this.parent?.getComponentInParent(type);
  }

  /**
   * Like {@link GameObject.getComponent}, but throws when the component is missing.
   *
   * @throws {Error} if no component of `type` is attached.
   */
  requireComponent<C extends Component>(type: ComponentType<C>): C {
    const component = this.getComponent(type);
    if (component === undefined) {
      throw new Error(`GameObject "${this.name}" has no ${type.name} component`);
    }
    return component;
  }

  /**
   * Destroys and detaches one of this object's components.
   */
  removeComponent(component: Component): void {
    const index = this.attached.indexOf(component);
    if (index < 0) return;
    this.attached.splice(index, 1);
    this.game.unregisterComponent(component);
  }

  /**
   * Destroys this object, its components and its children.
   */
  destroy(): void {
    if (this.destroyedFlag) return;
    for (const child of [...this.childObjects]) child.destroy();
    for (const component of [...this.attached]) this.removeComponent(component);
    this.destroyedFlag = true;
    const siblings = this.parent?.childObjects;
    const index = siblings?.indexOf(this) ?? -1;
    if (index >= 0) siblings?.splice(index, 1);
    this.game.unregisterObject(this);
  }
}
