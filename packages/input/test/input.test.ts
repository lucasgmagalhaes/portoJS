import { ManualClock } from '@portojs/core';
import { Component, Game } from '@portojs/runtime';
import { describe, expect, it } from 'vitest';
import { ButtonState, Gamepads, Input, InputComponent, Keyboard, Pointer } from '../src/index.js';
import type { GamepadLike } from '../src/index.js';

interface Fire {
  (type: string, props?: Record<string, unknown>): { defaultPrevented: boolean };
}

function makeTarget(extra: Record<string, unknown> = {}): { target: EventTarget; fire: Fire } {
  const target = Object.assign(new EventTarget(), extra);
  const fire: Fire = (type, props = {}) => {
    const state = { defaultPrevented: false };
    const event = Object.assign(new Event(type), props, {
      preventDefault() {
        state.defaultPrevented = true;
      },
    });
    target.dispatchEvent(event);
    return state;
  };
  return { target, fire };
}

describe('ButtonState', () => {
  it('tracks held buttons and per-frame edges', () => {
    const state = new ButtonState();
    state.press('a');
    state.press('a');
    expect(state.isDown('a')).toBe(true);
    expect(state.wasPressed('a')).toBe(true);
    expect(state.down).toEqual(['a']);
    state.endFrame();
    expect(state.wasPressed('a')).toBe(false);
    expect(state.isDown('a')).toBe(true);
    state.release('a');
    state.release('a');
    state.release('missing');
    expect(state.wasReleased('a')).toBe(true);
    expect(state.isDown('a')).toBe(false);
    state.endFrame();
    expect(state.wasReleased('a')).toBe(false);
  });

  it('releases everything at once', () => {
    const state = new ButtonState();
    state.press('a');
    state.press('b');
    state.releaseAll();
    expect(state.down).toEqual([]);
    expect(state.wasReleased('b')).toBe(true);
  });
});

describe('Keyboard', () => {
  it('follows key events, ignores repeat and clears on blur', () => {
    const { target, fire } = makeTarget();
    const keyboard = new Keyboard(target);
    fire('keydown', { code: 'KeyA' });
    fire('keydown', { code: 'KeyA', repeat: true });
    expect(keyboard.isDown('KeyA')).toBe(true);
    expect(keyboard.wasPressed('KeyA')).toBe(true);
    keyboard.state.endFrame();
    fire('keyup', { code: 'KeyA' });
    expect(keyboard.wasReleased('KeyA')).toBe(true);
    fire('keydown', { code: 'KeyB' });
    fire('blur');
    expect(keyboard.isDown('KeyB')).toBe(false);
  });

  it('cancels the default action of chosen keys only', () => {
    const { target, fire } = makeTarget();
    new Keyboard(target, { preventDefault: ['Space'] });
    expect(fire('keydown', { code: 'Space' }).defaultPrevented).toBe(true);
    expect(fire('keyup', { code: 'Space' }).defaultPrevented).toBe(true);
    expect(fire('keydown', { code: 'KeyA' }).defaultPrevented).toBe(false);
    expect(fire('keyup', { code: 'KeyA' }).defaultPrevented).toBe(false);
  });

  it('stops listening after dispose', () => {
    const { target, fire } = makeTarget();
    const keyboard = new Keyboard(target);
    fire('keydown', { code: 'KeyA' });
    keyboard.dispose();
    expect(keyboard.isDown('KeyA')).toBe(false);
    fire('keydown', { code: 'KeyB' });
    expect(keyboard.isDown('KeyB')).toBe(false);
  });
});

describe('Pointer', () => {
  const canvas = {
    width: 400,
    height: 200,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 100 }),
  };

  it('converts client coordinates to drawing-buffer pixels', () => {
    const { target, fire } = makeTarget(canvas);
    const pointer = new Pointer(target);
    fire('pointermove', { pointerId: 1, button: 0, clientX: 110, clientY: 70 });
    expect([pointer.x, pointer.y]).toEqual([200, 100]);
  });

  it('uses client coordinates when the target has no rectangle', () => {
    const { target, fire } = makeTarget();
    const pointer = new Pointer(target);
    fire('pointermove', { pointerId: 1, button: 0, clientX: 5, clientY: 6 });
    expect([pointer.x, pointer.y]).toEqual([5, 6]);
  });

  it('tracks buttons, touches and the wheel', () => {
    const { target, fire } = makeTarget(canvas);
    const pointer = new Pointer(target);
    fire('pointerdown', { pointerId: 1, button: 0, clientX: 10, clientY: 20 });
    fire('pointerdown', { pointerId: 2, button: 2, clientX: 60, clientY: 40 });
    expect(pointer.isDown('Button0')).toBe(true);
    expect(pointer.wasPressed('Button2')).toBe(true);
    expect(pointer.touches.size).toBe(2);
    fire('pointermove', { pointerId: 2, button: 0, clientX: 110, clientY: 70 });
    expect(pointer.touches.get(2)).toEqual({ x: 200, y: 100 });
    fire('wheel', { deltaY: 30 });
    fire('wheel', { deltaY: 15 });
    expect(pointer.wheel).toBe(45);
    pointer.endFrame();
    expect(pointer.wheel).toBe(0);
    expect(pointer.wasPressed('Button0')).toBe(false);
    fire('pointerup', { pointerId: 1, button: 0, clientX: 10, clientY: 20 });
    expect(pointer.wasReleased('Button0')).toBe(true);
    expect(pointer.touches.size).toBe(1);
    fire('pointercancel', { pointerId: 2, button: 2, clientX: 0, clientY: 0 });
    expect(pointer.touches.size).toBe(0);
    expect(pointer.isDown('Button2')).toBe(false);
  });

  it('stops listening after dispose', () => {
    const { target, fire } = makeTarget(canvas);
    const pointer = new Pointer(target);
    pointer.dispose();
    fire('pointerdown', { pointerId: 1, button: 0, clientX: 10, clientY: 20 });
    expect(pointer.isDown('Button0')).toBe(false);
  });
});

describe('Gamepads', () => {
  function pad(buttons: boolean[], axes: number[], connected = true): GamepadLike {
    return { connected, buttons: buttons.map((pressed) => ({ pressed })), axes };
  }

  it('polls buttons and applies the dead zone to axes', () => {
    let current: Array<GamepadLike | null> = [pad([true, false], [0.05, -0.8])];
    const pads = new Gamepads({ provider: () => current });
    pads.poll();
    expect(pads.isDown(0, 0)).toBe(true);
    expect(pads.isDown(0, 1)).toBe(false);
    expect(pads.axis(0, 0)).toBe(0);
    expect(pads.axis(0, 1)).toBe(-0.8);
    expect(pads.axis(3, 3)).toBe(0);
    pads.state.endFrame();
    current = [pad([false, false], [0, 0])];
    pads.poll();
    expect(pads.state.wasReleased('0:0')).toBe(true);
  });

  it('drops a pad that disconnects', () => {
    let current: Array<GamepadLike | null> = [pad([true], [0.9])];
    const pads = new Gamepads({ provider: () => current });
    pads.poll();
    current = [null];
    pads.poll();
    expect(pads.isDown(0, 0)).toBe(false);
    expect(pads.axis(0, 0)).toBe(0);
    current = [pad([true], [0.9], false)];
    pads.poll();
    expect(pads.isDown(0, 0)).toBe(false);
  });

  it('works without a browser and validates the dead zone', () => {
    expect(() => new Gamepads().poll()).not.toThrow();
    expect(() => new Gamepads({ deadzone: 1 })).toThrow(RangeError);
  });
});

describe('Input actions', () => {
  function make() {
    const keys = makeTarget();
    const pointerTarget = makeTarget();
    const input = new Input({
      keyboardTarget: keys.target,
      pointerTarget: pointerTarget.target,
      gamepads: { provider: () => [] },
    });
    return { input, keys, pointerTarget };
  }

  it('maps actions to keys, pointer buttons and gamepad buttons', () => {
    const { input, keys, pointerTarget } = make();
    input.bind('jump', 'key:Space', 'pointer:Button0', 'pad:0:1');
    expect(input.isDown('jump')).toBe(false);
    keys.fire('keydown', { code: 'Space' });
    expect(input.isDown('jump')).toBe(true);
    expect(input.wasPressed('jump')).toBe(true);
    input.endFrame();
    expect(input.wasPressed('jump')).toBe(false);
    keys.fire('keyup', { code: 'Space' });
    expect(input.wasReleased('jump')).toBe(true);
    input.endFrame();
    pointerTarget.fire('pointerdown', { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    expect(input.isDown('jump')).toBe(true);
    input.gamepads.state.press('0:1');
    expect(input.isDown('jump')).toBe(true);
    expect(input.isDown('unknown')).toBe(false);
  });

  it('builds a signed axis from two actions', () => {
    const { input, keys } = make();
    input.bind('left', 'key:ArrowLeft');
    input.bind('right', 'key:ArrowRight');
    expect(input.axis('left', 'right')).toBe(0);
    keys.fire('keydown', { code: 'ArrowRight' });
    expect(input.axis('left', 'right')).toBe(1);
    keys.fire('keydown', { code: 'ArrowLeft' });
    expect(input.axis('left', 'right')).toBe(0);
    keys.fire('keyup', { code: 'ArrowRight' });
    expect(input.axis('left', 'right')).toBe(-1);
  });

  it('rejects malformed bindings and needs a window by default', () => {
    const { input } = make();
    expect(() => input.bind('x', 'Space')).toThrow(/invalid binding/);
    expect(() => input.bind('x', 'mouse:0')).toThrow(/invalid binding/);
    expect(() => new Input()).toThrow(/no window/);
  });

  it('removes listeners on dispose', () => {
    const { input, keys } = make();
    input.dispose();
    keys.fire('keydown', { code: 'KeyA' });
    expect(input.keyboard.isDown('KeyA')).toBe(false);
  });
});

class Probe extends Component {
  readonly seen: boolean[] = [];
  input: Input | undefined;

  override fixedUpdate(): void {
    this.seen.push(this.input?.keyboard.wasPressed('KeyA') ?? false);
  }
}

describe('InputComponent', () => {
  it('keeps edges for exactly one step and cleans up on destroy', () => {
    const keys = makeTarget();
    const pointerTarget = makeTarget();
    const game = new Game({ clock: new ManualClock(0), stepMs: 100 });
    const component = game.createObject('Input').addComponent(InputComponent, {
      keyboardTarget: keys.target,
      pointerTarget: pointerTarget.target,
      gamepads: { provider: () => [] },
    });
    const probe = game.createObject('Probe').addComponent(Probe);
    probe.input = component.input;
    keys.fire('keydown', { code: 'KeyA' });
    game.advance(300);
    expect(probe.seen).toEqual([true, false, false]);
    expect(component.input.keyboard.isDown('KeyA')).toBe(true);
    component.destroy();
    keys.fire('keydown', { code: 'KeyB' });
    expect(component.input.keyboard.isDown('KeyB')).toBe(false);
  });
});
