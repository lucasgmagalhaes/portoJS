/**
 * Keyboard, pointer (mouse, touch, pen) and gamepad input for PortoJS, with per-step pressed and released edges and named actions.
 *
 * @module @portojs/input
 */

export { ButtonState } from './button-state.ts';
export { Gamepads } from './gamepad.ts';
export type { GamepadLike, GamepadProvider, GamepadsOptions } from './gamepad.ts';
export { Input } from './input.ts';
export type { InputOptions } from './input.ts';
export { InputComponent } from './input-component.ts';
export { Keyboard } from './keyboard.ts';
export type { KeyboardOptions } from './keyboard.ts';
export { Pointer } from './pointer.ts';
export type { PointerPosition, PointerStreamEvent, PointerTarget } from './pointer.ts';
export { GestureRecognizer } from './gestures.ts';
export type {
  GestureOptions,
  GesturePoint,
  PanGesture,
  PinchGesture,
  SwipeDirection,
  SwipeGesture,
} from './gestures.ts';
