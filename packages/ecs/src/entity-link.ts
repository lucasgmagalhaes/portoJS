import type { JsonValue } from '@portojs/core';
import { Component } from '@portojs/runtime';
import type { Game, GameObject } from '@portojs/runtime';
import type { ComponentDef, Schema, Values } from './component-def.ts';
import { EcsWorld } from './ecs-world.ts';
import type { World } from './world.ts';

/**
 * An ECS component to put on a linked entity when it is created.
 */
export interface LinkedComponent {
  readonly component: ComponentDef;
  readonly values?: Readonly<Record<string, number>>;
}

/**
 * Options of an {@link EntityLink}.
 */
export interface EntityLinkOptions {
  /**
   * The world to create the entity in. Default: the game's {@link EcsWorld}.
   */
  readonly world?: World;
  /**
   * ECS components the entity starts with.
   */
  readonly components?: readonly LinkedComponent[];
}

/**
 * Ties a game object to an ECS entity: the entity is created with the object and destroyed with
 * it, and the entity id is saved so the link survives a load. Use it to give a few important
 * objects (the player, a boss) fast ECS data, or to find the object behind an entity.
 *
 * Saving the entity's data needs the {@link EcsWorld} to list its `components`. The link loads
 * after the world, so the restored entity is waiting for it.
 *
 * @example
 * const link = player.addComponent(EntityLink, { components: [{ component: Position }] });
 * world.use(Position).x[link.entity] = 10;
 * EntityLink.objectOf(game, someEntity)?.name;
 */
export class EntityLink extends Component {
  static override typeId = 'EntityLink';
  static override executionOrder = 10;

  /**
   * The game object that owns an entity, or `undefined`.
   */
  static objectOf(game: Game, entity: number): GameObject | undefined {
    for (const link of game.findObjectsOfType(EntityLink)) {
      if (link.entity === entity) return link.gameObject;
    }
    return undefined;
  }

  private entityId: number;
  private seenVersion: number;
  private readonly ecs: World;
  private readonly initial: readonly LinkedComponent[];

  /**
   * @param gameObject the object this component is attached to.
   * @param options the world and starting components.
   * @throws if the game has no {@link EcsWorld} and no `world` was given.
   */
  constructor(gameObject: GameObject, options: EntityLinkOptions = {}) {
    super(gameObject);
    const world = options.world ?? gameObject.game.findObjectOfType(EcsWorld)?.world;
    if (world === undefined) throw new Error('EntityLink needs an EcsWorld component in the game');
    this.ecs = world;
    this.initial = options.components ?? [];
    this.entityId = this.create();
    this.seenVersion = world.restoreVersion;
  }

  /**
   * The linked entity's id. It can change after a load, so read it when you need it rather than
   * keeping it.
   */
  get entity(): number {
    return this.entityId;
  }

  /**
   * The world the entity lives in.
   */
  get world(): World {
    return this.ecs;
  }

  /**
   * Adds an ECS component to the entity.
   */
  add<S extends Schema>(component: ComponentDef<S>, values?: Values<S>): this {
    this.ecs.addComponent(this.entityId, component, values);
    return this;
  }

  /**
   * Whether the entity has an ECS component.
   */
  has(component: ComponentDef): boolean {
    return this.ecs.hasComponent(this.entityId, component);
  }

  /**
   * Removes an ECS component from the entity.
   */
  remove(component: ComponentDef): this {
    this.ecs.removeComponent(this.entityId, component);
    return this;
  }

  override onSave(): JsonValue {
    return { entity: this.entityId };
  }

  override onLoad(data: JsonValue | undefined): void {
    const saved =
      typeof data === 'object' && data !== null && !Array.isArray(data)
        ? data['entity']
        : undefined;
    if (typeof saved === 'number' && this.ecs.isAlive(saved)) {
      this.entityId = saved;
    } else if (this.seenVersion !== this.ecs.restoreVersion || !this.ecs.isAlive(this.entityId)) {
      this.entityId = this.create();
    }
    this.seenVersion = this.ecs.restoreVersion;
  }

  override onDestroy(): void {
    this.ecs.destroyEntity(this.entityId);
  }

  private create(): number {
    const entity = this.ecs.createEntity();
    for (const { component, values } of this.initial) {
      this.ecs.addComponent(entity, component, values);
    }
    return entity;
  }
}
