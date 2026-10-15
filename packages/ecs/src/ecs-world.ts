import { Component } from '@portojs/runtime';
import type { GameObject } from '@portojs/runtime';
import { World } from './world.ts';
import type { WorldOptions } from './world.ts';

/**
 * Hosts an ECS {@link World} inside a game: its systems run on every fixed step, in game time,
 * while this component is active. The ECS data is not part of saves; persist what you need
 * from your own components.
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
  constructor(gameObject: GameObject, options: WorldOptions = {}) {
    super(gameObject);
    this.world = new World(options);
  }

  override fixedUpdate(deltaTime: number): void {
    this.world.update(deltaTime);
  }
}
