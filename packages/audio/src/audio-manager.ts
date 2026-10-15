import { Component } from '@portojs/runtime';
import type { GameObject } from '@portojs/runtime';
import { AudioEngine } from './engine.ts';
import type { AudioEngineOptions } from './engine.ts';

/**
 * Owns an {@link AudioEngine} for a game: audio pauses while the component is inactive and the
 * context is closed when it is destroyed.
 *
 * @example
 * const audio = game.createObject('Audio').addComponent(AudioManager);
 * audio.engine.unlockOnGesture(window);
 */
export class AudioManager extends Component {
  static override typeId = 'AudioManager';

  /**
   * The mixer.
   */
  readonly engine: AudioEngine;

  private enabledOnce = false;

  /**
   * @param gameObject the object this component is attached to.
   * @param options engine options.
   */
  constructor(gameObject: GameObject, options: AudioEngineOptions = {}) {
    super(gameObject);
    this.engine = new AudioEngine(options);
  }

  override onEnable(): void {
    if (this.enabledOnce) void this.engine.resume();
    this.enabledOnce = true;
  }

  override onDisable(): void {
    void this.engine.suspend();
  }

  override onDestroy(): void {
    void this.engine.dispose();
  }
}
