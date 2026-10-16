import type { JsonValue } from '@portojs/core';
import { Component } from '@portojs/runtime';
import type { GameObject } from '@portojs/runtime';
import type { ComponentDef } from './component-def.ts';
import { World } from './world.ts';
import type { WorldOptions } from './world.ts';

/**
 * Options of an {@link EcsWorld}: the world's sizing, and optionally what to save.
 */
export interface EcsWorldOptions extends WorldOptions {
  /**
   * ECS components to save with the game, by a stable name. When given, every live entity and
   * these components' values are in the save and restored on load, keeping entity ids. Components
   * that are not listed are not saved. Without this option the ECS data is not saved.
   */
  readonly components?: Readonly<Record<string, ComponentDef>>;
}

/**
 * Hosts an ECS {@link World} inside a game: its systems run on every fixed step, in game time,
 * while this component is active. The ECS data is saved only when you name the components to save
 * with the `components` option; see {@link EcsWorldOptions}.
 *
 * @example
 * const ecs = game.createObject('Ecs').addComponent(EcsWorld, { capacity: 50_000 });
 * ecs.world.addSystem(moveSystem);
 */
export class EcsWorld extends Component {
  static override typeId = 'EcsWorld';

  /**
   * The world whose systems this component runs.
   */
  readonly world: World;

  /**
   * @param gameObject the object this component is attached to.
   * @param options world sizing.
   */
  constructor(gameObject: GameObject, options: EcsWorldOptions = {}) {
    super(gameObject);
    this.saved = options.components;
    this.world = new World({
      ...(options.capacity === undefined ? {} : { capacity: options.capacity }),
      ...(options.maxComponents === undefined ? {} : { maxComponents: options.maxComponents }),
    });
  }

  private readonly saved: Readonly<Record<string, ComponentDef>> | undefined;

  override fixedUpdate(deltaTime: number): void {
    this.world.update(deltaTime);
  }

  override onSave(): JsonValue | undefined {
    if (this.saved === undefined) return undefined;
    return this.world.snapshot(this.saved) as unknown as JsonValue;
  }

  override onLoad(data: JsonValue | undefined): void {
    if (this.saved === undefined) return;
    if (data === undefined) this.world.clear();
    else this.world.restore(data, this.saved);
  }
}
