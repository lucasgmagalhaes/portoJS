import { ButtonState } from './button-state.js';

/**
 * Options for {@link Keyboard}.
 */
export interface KeyboardOptions {
  /**
   * Key codes (such as `Space` or `ArrowUp`) whose default browser action is cancelled, so the
   * page does not scroll while the game uses them.
   */
  readonly preventDefault?: readonly string[];
}

interface KeyEventLike {
  readonly code: string;
  preventDefault?(): void;
}

/**
 * Keyboard state by physical key code (`KeyA`, `Space`, `ArrowLeft`...), independent of layout.
 *
 * @example
 * const keyboard = new Keyboard(window);
 * if (keyboard.isDown('ArrowLeft')) player.x -= 1;
 */
export class Keyboard {
  /**
   * The underlying button state.
   */
  readonly state = new ButtonState();

  private readonly prevent: ReadonlySet<string>;

  private readonly onKeyDown = (event: Event): void => {
    const key = event as unknown as KeyEventLike;
    if (this.prevent.has(key.code)) key.preventDefault?.();
    this.state.press(key.code);
  };

  private readonly onKeyUp = (event: Event): void => {
    const key = event as unknown as KeyEventLike;
    if (this.prevent.has(key.code)) key.preventDefault?.();
    this.state.release(key.code);
  };

  private readonly onBlur = (): void => {
    this.state.releaseAll();
  };

  /**
   * @param target where key events are heard, usually `window` or the canvas.
   * @param options extra behavior.
   */
  constructor(
    private readonly target: EventTarget,
    options: KeyboardOptions = {},
  ) {
    this.prevent = new Set(options.preventDefault ?? []);
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  /**
   * Whether the key is held.
   */
  isDown(code: string): boolean {
    return this.state.isDown(code);
  }

  /**
   * Whether the key went down since the last step.
   */
  wasPressed(code: string): boolean {
    return this.state.wasPressed(code);
  }

  /**
   * Whether the key went up since the last step.
   */
  wasReleased(code: string): boolean {
    return this.state.wasReleased(code);
  }

  /**
   * Stops listening.
   */
  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.state.releaseAll();
  }
}
