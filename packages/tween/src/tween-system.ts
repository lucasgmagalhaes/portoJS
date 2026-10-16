import { Component } from '@portojs/runtime';
import { Tweens } from './tweens.ts';

/**
 * Hosts a {@link Tweens} manager inside a game: it advances on every fixed step in game time,
 * so tweens pause with the game and follow `timeScale`. Tweens are not part of saves, and are
 * killed when the object is destroyed.
 *
 * @example
 * const system = game.createObject('Tweens').addComponent(TweenSystem);
 * system.tweens.to(box, { x: 100 }, { duration: 1, ease: 'backOut' });
 */
export class TweenSystem extends Component {
  static override typeId = 'TweenSystem';

  /**
   * The manager this component advances.
   */
  readonly tweens = new Tweens();

  override fixedUpdate(deltaTime: number): void {
    this.tweens.update(deltaTime);
  }

  override onDestroy(): void {
    this.tweens.killAll();
  }
}
