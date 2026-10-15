import { Gamepads } from './gamepad.ts';
import type { GamepadsOptions } from './gamepad.ts';
import { Keyboard } from './keyboard.ts';
import type { KeyboardOptions } from './keyboard.ts';
import { Pointer } from './pointer.ts';
import type { PointerTarget } from './pointer.ts';

/**
 * Options for {@link Input}.
 */
export interface InputOptions {
  /**
   * Where key events are heard. Default `window`.
   */
  readonly keyboardTarget?: EventTarget;
  /**
   * Element pointer events come from, usually the canvas. Default `window`.
   */
  readonly pointerTarget?: PointerTarget;
  /**
   * Keyboard options.
   */
  readonly keyboard?: KeyboardOptions;
  /**
   * Gamepad options.
   */
  readonly gamepads?: GamepadsOptions;
}

function defaultTarget(): EventTarget {
  const target = (globalThis as { window?: EventTarget }).window;
  if (target === undefined) {
    throw new Error('Input: no window found, pass keyboardTarget and pointerTarget');
  }
  return target;
}

/**
 * All input devices behind one object, with named actions.
 *
 * Bindings are strings: `key:Space`, `pointer:Button0`, `pad:0:1` (pad 0, button 1).
 *
 * @example
 * const input = new Input({ pointerTarget: canvas });
 * input.bind('jump', 'key:Space', 'pad:0:0');
 * game.on('tick', () => {
 *   if (input.wasPressed('jump')) player.jump();
 *   input.endFrame();
 * });
 */
export class Input {
  /**
   * Keyboard state.
   */
  readonly keyboard: Keyboard;
  /**
   * Mouse, touch and pen state.
   */
  readonly pointer: Pointer;
  /**
   * Gamepad state.
   */
  readonly gamepads: Gamepads;

  private readonly actions = new Map<string, readonly string[]>();

  /**
   * @throws {Error} if there is no `window` and the targets are not given.
   */
  constructor(options: InputOptions = {}) {
    this.keyboard = new Keyboard(options.keyboardTarget ?? defaultTarget(), options.keyboard);
    this.pointer = new Pointer(options.pointerTarget ?? defaultTarget());
    this.gamepads = new Gamepads(options.gamepads);
  }

  /**
   * Binds an action to one or more inputs, replacing earlier bindings of that action.
   *
   * @throws {Error} if a binding does not start with `key:`, `pointer:` or `pad:`.
   */
  bind(action: string, ...bindings: string[]): void {
    for (const binding of bindings) {
      if (!/^(key|pointer|pad):./.test(binding)) {
        throw new Error(`Input: invalid binding "${binding}"`);
      }
    }
    this.actions.set(action, bindings);
  }

  /**
   * Whether any input of the action is held.
   */
  isDown(action: string): boolean {
    return this.any(action, 'isDown');
  }

  /**
   * Whether any input of the action went down since the last step.
   */
  wasPressed(action: string): boolean {
    return this.any(action, 'wasPressed');
  }

  /**
   * Whether any input of the action went up since the last step.
   */
  wasReleased(action: string): boolean {
    return this.any(action, 'wasReleased');
  }

  /**
   * A value from `-1` to `1`: `1` while `positive` is down, `-1` while `negative` is down, `0`
   * when neither or both are.
   */
  axis(negative: string, positive: string): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  /**
   * Ends the step: forgets pressed and released edges and the wheel delta, then reads the
   * gamepads for the next step.
   */
  endFrame(): void {
    this.keyboard.state.endFrame();
    this.pointer.endFrame();
    this.gamepads.state.endFrame();
    this.gamepads.poll();
  }

  /**
   * Removes every listener.
   */
  dispose(): void {
    this.keyboard.dispose();
    this.pointer.dispose();
  }

  private any(action: string, query: 'isDown' | 'wasPressed' | 'wasReleased'): boolean {
    const bindings = this.actions.get(action);
    if (bindings === undefined) return false;
    for (const binding of bindings) {
      if (this.check(binding, query)) return true;
    }
    return false;
  }

  private check(binding: string, query: 'isDown' | 'wasPressed' | 'wasReleased'): boolean {
    const colon = binding.indexOf(':');
    const kind = binding.slice(0, colon);
    const id = binding.slice(colon + 1);
    if (kind === 'key') return this.keyboard.state[query](id);
    if (kind === 'pointer') return this.pointer.state[query](id);
    return this.gamepads.state[query](id);
  }
}
