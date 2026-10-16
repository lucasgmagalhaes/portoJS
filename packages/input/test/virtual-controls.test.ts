import { describe, expect, it } from 'vitest';
import { Input, VirtualControls } from '../src/index.ts';
import type { PointerStreamEvent, VirtualControlsOptions } from '../src/index.ts';

const stick = { kind: 'rect', x: 0, y: 200, width: 200, height: 200 } as const;
const options: VirtualControlsOptions = {
  joystick: { region: stick, radius: 50 },
  buttons: {
    jump: { kind: 'circle', x: 700, y: 330, radius: 40 },
    fire: { kind: 'rect', x: 600, y: 300, width: 40, height: 40 },
  },
};

function make(custom: VirtualControlsOptions = options) {
  const controls = new VirtualControls(custom);
  const send = (
    type: PointerStreamEvent['type'],
    id: number,
    x: number,
    y: number,
    button = 0,
  ): void => controls.feed({ type, pointerId: id, x, y, button, time: 0 });
  return { controls, send };
}

describe('joystick', () => {
  it('reads the push from the middle of the region', () => {
    const { controls, send } = make();
    send('down', 1, 100, 300);
    expect(controls.stickActive).toBe(true);
    expect([controls.x, controls.y]).toEqual([0, 0]);
    send('move', 1, 125, 300);
    expect(controls.x).toBeCloseTo(0.5, 9);
    send('move', 1, 100, 250);
    expect([controls.x, controls.y]).toEqual([0, -1]);
  });

  it('clamps to length 1 and zeroes inside the dead zone', () => {
    const { controls, send } = make();
    send('down', 1, 100, 300);
    send('move', 1, 300, 300);
    expect(controls.x).toBeCloseTo(1, 9);
    send('move', 1, 300, 500);
    expect(Math.hypot(controls.x, controls.y)).toBeCloseTo(1, 9);
    send('move', 1, 104, 300);
    expect([controls.x, controls.y]).toEqual([0, 0]);
  });

  it('centres a floating stick where the touch lands', () => {
    const { controls, send } = make({ joystick: { region: stick, radius: 50, floating: true } });
    send('down', 1, 30, 250);
    expect(controls.stickOrigin).toEqual({ x: 30, y: 250 });
    send('move', 1, 80, 250);
    expect(controls.x).toBeCloseTo(1, 9);
  });

  it('lets go when the finger lifts or is cancelled', () => {
    const { controls, send } = make();
    send('down', 1, 100, 300);
    send('move', 1, 150, 300);
    send('up', 1, 150, 300);
    expect(controls.stickActive).toBe(false);
    expect([controls.x, controls.y]).toEqual([0, 0]);
    send('down', 2, 100, 300);
    send('move', 2, 150, 300);
    send('cancel', 2, 150, 300);
    expect(controls.x).toBe(0);
  });

  it('ignores touches outside the region, other buttons and a second finger', () => {
    const { controls, send } = make();
    send('down', 1, 400, 100);
    expect(controls.stickActive).toBe(false);
    send('down', 2, 100, 300, 2);
    expect(controls.stickActive).toBe(false);
    send('down', 3, 100, 300);
    send('down', 4, 50, 300);
    send('move', 4, 0, 300);
    expect(controls.x).toBe(0);
    send('move', 3, 150, 300);
    expect(controls.x).toBeCloseTo(1, 9);
  });

  it('presses stick-left/right/up/down past half way, like keys', () => {
    const { controls, send } = make();
    send('down', 1, 100, 300);
    send('move', 1, 70, 300);
    expect(controls.isDown('stick-left')).toBe(true);
    expect(controls.wasPressed('stick-left')).toBe(true);
    expect(controls.isDown('stick-right')).toBe(false);
    controls.endFrame();
    send('move', 1, 100, 340);
    expect(controls.isDown('stick-left')).toBe(false);
    expect(controls.wasReleased('stick-left')).toBe(true);
    expect(controls.isDown('stick-down')).toBe(true);
    send('up', 1, 100, 340);
    expect(controls.isDown('stick-down')).toBe(false);
  });
});

describe('buttons', () => {
  it('press while a finger is on them, in a circle or a rectangle', () => {
    const { controls, send } = make();
    send('down', 1, 700, 330);
    expect(controls.isDown('jump')).toBe(true);
    expect(controls.wasPressed('jump')).toBe(true);
    send('down', 2, 620, 320);
    expect(controls.isDown('fire')).toBe(true);
    controls.endFrame();
    expect(controls.wasPressed('jump')).toBe(false);
    send('up', 1, 700, 330);
    expect(controls.isDown('jump')).toBe(false);
    expect(controls.wasReleased('jump')).toBe(true);
    send('down', 3, 735, 330);
    expect(controls.isDown('jump')).toBe(true);
    send('down', 4, 900, 900);
    expect(controls.isDown('fire')).toBe(true);
  });

  it('stay down until the last finger on them lifts', () => {
    const { controls, send } = make();
    send('down', 1, 700, 330);
    send('down', 2, 710, 330);
    send('up', 1, 700, 330);
    expect(controls.isDown('jump')).toBe(true);
    send('up', 2, 710, 330);
    expect(controls.isDown('jump')).toBe(false);
  });

  it('work together with the stick on other fingers', () => {
    const { controls, send } = make();
    send('down', 1, 100, 300);
    send('move', 1, 150, 300);
    send('down', 2, 700, 330);
    expect(controls.x).toBeCloseTo(1, 9);
    expect(controls.isDown('jump')).toBe(true);
  });

  it('are released together by reset()', () => {
    const { controls, send } = make();
    send('down', 1, 100, 300);
    send('move', 1, 150, 300);
    send('down', 2, 700, 330);
    controls.reset();
    expect([controls.x, controls.y]).toEqual([0, 0]);
    expect(controls.isDown('jump')).toBe(false);
    expect(controls.stickActive).toBe(false);
  });
});

describe('with Input', () => {
  it('drives named actions next to the keyboard', () => {
    const target = new EventTarget();
    const input = new Input({ keyboardTarget: target, pointerTarget: target });
    const controls = new VirtualControls(options);
    controls.attach(input.pointer);
    input.addSource('virtual', controls);
    input.bind('jump', 'key:Space', 'virtual:jump');
    input.bind('left', 'key:KeyA', 'virtual:stick-left');

    const touch = (type: string, id: number, x: number, y: number): void => {
      target.dispatchEvent(
        Object.assign(new Event(type), { pointerId: id, clientX: x, clientY: y, button: 0 }),
      );
    };
    touch('pointerdown', 1, 700, 330);
    expect(input.wasPressed('jump')).toBe(true);
    input.endFrame();
    expect(input.wasPressed('jump')).toBe(false);
    expect(input.isDown('jump')).toBe(true);
    touch('pointerdown', 2, 100, 300);
    touch('pointermove', 2, 60, 300);
    expect(input.isDown('left')).toBe(true);
  });

  it('stops listening', () => {
    const target = new EventTarget();
    const input = new Input({ keyboardTarget: target, pointerTarget: target });
    const controls = new VirtualControls(options);
    const stop = controls.attach(input.pointer);
    stop();
    target.dispatchEvent(
      Object.assign(new Event('pointerdown'), {
        pointerId: 1,
        clientX: 700,
        clientY: 330,
        button: 0,
      }),
    );
    expect(controls.isDown('jump')).toBe(false);
  });
});

describe('options', () => {
  it('validates the radius and the dead zone', () => {
    expect(() => new VirtualControls({ joystick: { region: stick, radius: 0 } })).toThrow(
      RangeError,
    );
    expect(() => new VirtualControls({ joystick: { region: stick, deadZone: 1 } })).toThrow(
      RangeError,
    );
    expect(() => new VirtualControls({ joystick: { region: stick, deadZone: -0.1 } })).toThrow(
      RangeError,
    );
    expect(() => new VirtualControls({})).not.toThrow();
  });
});
