import { Input, Keyboard, Pointer } from '@portojs/input';
import { describe, expect, it } from 'vitest';
import { FakeEventTarget } from '../src/index.ts';

describe('FakeEventTarget', () => {
  it('drives a Keyboard', () => {
    const target = new FakeEventTarget();
    const keyboard = new Keyboard(target);
    target.keyDown('Space');
    expect(keyboard.isDown('Space')).toBe(true);
    target.keyUp('Space');
    expect(keyboard.isDown('Space')).toBe(false);
  });

  it('drives a Pointer: press, move, release, wheel', () => {
    const target = new FakeEventTarget();
    const pointer = new Pointer(target);
    target.pointerDown({ x: 10, y: 20 });
    expect(pointer.wasPressed('Button0')).toBe(true);
    expect([pointer.x, pointer.y]).toEqual([10, 20]);
    target.pointerMove({ x: 30, y: 40 });
    expect([pointer.x, pointer.y]).toEqual([30, 40]);
    target.pointerUp({ x: 30, y: 40 });
    expect(pointer.wasReleased('Button0')).toBe(true);
    target.wheel(45);
    expect(pointer.wheel).toBe(45);
  });

  it('supports several fingers and other buttons', () => {
    const target = new FakeEventTarget();
    const pointer = new Pointer(target);
    target.pointerDown({ x: 1, y: 1, id: 1 });
    target.pointerDown({ x: 9, y: 9, id: 2, button: 2 });
    expect(pointer.touches.size).toBe(2);
    expect(pointer.isDown('Button2')).toBe(true);
  });

  it('click is a press and a release', () => {
    const target = new FakeEventTarget();
    const pointer = new Pointer(target);
    target.click({ x: 5, y: 5 });
    expect(pointer.wasPressed('Button0')).toBe(true);
    expect(pointer.wasReleased('Button0')).toBe(true);
    expect(pointer.isDown('Button0')).toBe(false);
  });

  it('feeds named actions of an Input', () => {
    const target = new FakeEventTarget();
    const input = new Input({ keyboardTarget: target, pointerTarget: target });
    input.bind('jump', 'key:Space');
    input.bind('shoot', 'pointer:Button0');
    target.keyDown('Space');
    target.click({ x: 1, y: 1 });
    expect(input.wasPressed('jump')).toBe(true);
    expect(input.wasPressed('shoot')).toBe(true);
    input.endFrame();
    expect(input.wasPressed('jump')).toBe(false);
    expect(input.isDown('jump')).toBe(true);
  });

  it('fires any event with the given fields', () => {
    const target = new FakeEventTarget();
    let seen: unknown;
    target.addEventListener(
      'custom',
      (event) => (seen = (event as Event & { value?: number }).value),
    );
    target.fire('custom', { value: 7 });
    expect(seen).toBe(7);
  });
});
