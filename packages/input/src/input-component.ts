import { Component } from '@portojs/runtime';
import type { GameObject } from '@portojs/runtime';
import { Input } from './input.js';
import type { InputOptions } from './input.js';

/**
 * Owns an {@link Input} for a game. It runs after every other component in each fixed step, so
 * `wasPressed` and `wasReleased` are true for exactly one step, and it removes the listeners
 * when destroyed.
 *
 * @example
 * const input = game.createObject('Input').addComponent(InputComponent, { pointerTarget: canvas });
 * input.input.bind('jump', 'key:Space');
 */
export class InputComponent extends Component {
  static override typeId = 'Input';
  static override executionOrder = 10_000;

  /**
   * The input devices and actions.
   */
  readonly input: Input;

  /**
   * @param gameObject the object this component is attached to.
   * @param options devices and targets.
   */
  constructor(gameObject: GameObject, options: InputOptions = {}) {
    super(gameObject);
    this.input = new Input(options);
  }

  override fixedUpdate(): void {
    this.input.endFrame();
  }

  override onDestroy(): void {
    this.input.dispose();
  }
}
