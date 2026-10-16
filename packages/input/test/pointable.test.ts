import { ManualClock } from '@portojs/core';
import { Game } from '@portojs/runtime';
import { describe, expect, it } from 'vitest';
import { Pointable, Pointer, PointerSystem, circleHitTest, rectHitTest } from '../src/index.ts';

function setup(toWorld?: (x: number, y: number) => { x: number; y: number }) {
  const target = new EventTarget();
  const fire = (type: string, pointerId: number, clientX: number, clientY: number, button = 0) => {
    target.dispatchEvent(Object.assign(new Event(type), { pointerId, clientX, clientY, button }));
  };
  const pointer = new Pointer(target);
  const game = new Game({ clock: new ManualClock(0) });
  const options = toWorld === undefined ? { pointer } : { pointer, toWorld };
  const system = game.createObject('PointerSystem').addComponent(PointerSystem, options);
  const log: string[] = [];
  const button = (name: string, x: number, y: number, size = 20, order = 0) => {
    const pointable = game.createObject(name).addComponent(Pointable, {
      hitTest: rectHitTest(() => ({ x, y, width: size, height: size })),
      order,
    });
    for (const event of [
      'pointerDown',
      'pointerUp',
      'click',
      'pointerEnter',
      'pointerExit',
      'dragStart',
      'drag',
      'dragEnd',
    ] as const) {
      pointable[event].addListener((hit) =>
        log.push(`${name}:${event}${event === 'drag' ? `:${hit.dx},${hit.dy}` : ''}`),
      );
    }
    return pointable;
  };
  return { game, system, pointer, fire, log, button };
}

describe('hit tests', () => {
  it('tests rectangles with half-open edges and follows a moving rect', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    const test = rectHitTest(() => rect);
    expect(test(0, 0)).toBe(true);
    expect(test(10, 5)).toBe(false);
    rect.x = 20;
    expect(test(25, 5)).toBe(true);
  });

  it('tests circles', () => {
    const test = circleHitTest(() => ({ x: 0, y: 0, radius: 5 }));
    expect(test(3, 4)).toBe(true);
    expect(test(4, 4)).toBe(false);
  });
});

describe('PointerSystem', () => {
  it('raises down, up and click on the object under the pointer', () => {
    const { fire, log, button } = setup();
    button('A', 0, 0);
    fire('pointerdown', 1, 5, 5);
    fire('pointerup', 1, 6, 6);
    expect(log).toEqual(['A:pointerEnter', 'A:pointerDown', 'A:pointerUp', 'A:click']);
  });

  it('ignores presses on empty space', () => {
    const { fire, log, button } = setup();
    button('A', 0, 0);
    fire('pointerdown', 1, 100, 100);
    fire('pointerup', 1, 100, 100);
    expect(log).toEqual([]);
  });

  it('does not click when the release is elsewhere, but still raises pointerUp', () => {
    const { fire, log, button } = setup();
    button('A', 0, 0);
    fire('pointerdown', 1, 5, 5);
    fire('pointerup', 1, 2, 2000);
    expect(log).not.toContain('A:click');
    expect(log).toContain('A:pointerUp');
  });

  it('gives the event to the highest order, then the newest', () => {
    const { fire, log, button } = setup();
    button('Old', 0, 0);
    button('New', 0, 0);
    button('Top', 0, 0, 20, 5);
    button('Low', 0, 0, 20, -1);
    fire('pointerdown', 1, 5, 5);
    expect(log).toEqual(['Top:pointerEnter', 'Top:pointerDown']);
    log.length = 0;
    fire('pointerup', 1, 5, 5);
    const { fire: fire2, log: log2, button: button2 } = setup();
    button2('Old', 0, 0);
    button2('New', 0, 0);
    fire2('pointerdown', 1, 5, 5);
    expect(log2).toEqual(['New:pointerEnter', 'New:pointerDown']);
  });

  it('skips disabled and inactive objects', () => {
    const { game, fire, log, button } = setup();
    const a = button('A', 0, 0);
    const b = button('B', 0, 0);
    b.enabled = false;
    fire('pointerdown', 1, 5, 5);
    expect(log).toEqual(['A:pointerEnter', 'A:pointerDown']);
    a.gameObject.setActive(false);
    log.length = 0;
    fire('pointerup', 1, 5, 5);
    fire('pointerdown', 1, 5, 5);
    expect(log.some((l) => l.startsWith('B'))).toBe(false);
    expect(game.objects).toHaveLength(3);
  });

  it('raises enter and exit as the pointer moves between objects', () => {
    const { fire, log, button } = setup();
    button('A', 0, 0);
    button('B', 50, 0);
    fire('pointermove', 1, 5, 5);
    fire('pointermove', 1, 8, 8);
    fire('pointermove', 1, 55, 5);
    fire('pointermove', 1, 500, 500);
    expect(log).toEqual(['A:pointerEnter', 'A:pointerExit', 'B:pointerEnter', 'B:pointerExit']);
  });

  it('tracks each pointer separately', () => {
    const { fire, log, button } = setup();
    button('A', 0, 0);
    button('B', 50, 0);
    fire('pointermove', 1, 5, 5);
    fire('pointermove', 2, 55, 5);
    fire('pointermove', 1, 500, 5);
    expect(log).toEqual(['A:pointerEnter', 'B:pointerEnter', 'A:pointerExit']);
  });

  it('drags: start after the threshold, deltas in world units, end on release without click', () => {
    const { fire, log, button } = setup((x, y) => ({ x: x / 2, y: y / 2 }));
    button('A', 0, 0, 100);
    fire('pointerdown', 1, 10, 10);
    fire('pointermove', 1, 12, 10);
    fire('pointermove', 1, 30, 20);
    fire('pointermove', 1, 50, 20);
    fire('pointerup', 1, 50, 20);
    expect(log.filter((l) => !l.includes('Enter'))).toEqual([
      'A:pointerDown',
      'A:dragStart',
      'A:drag:10,5',
      'A:drag:10,0',
      'A:pointerUp',
      'A:dragEnd',
    ]);
  });

  it('keeps dragging an object when the pointer leaves it', () => {
    const { fire, log, button } = setup();
    button('A', 0, 0);
    fire('pointerdown', 1, 5, 5);
    fire('pointermove', 1, 300, 300);
    expect(log).toContain('A:drag:295,295');
  });

  it('ends a drag and exits on cancel', () => {
    const { fire, log, button } = setup();
    button('A', 0, 0);
    fire('pointerdown', 1, 5, 5);
    fire('pointermove', 1, 15, 5);
    fire('pointercancel', 1, 15, 5);
    expect(log.slice(-2)).toEqual(['A:dragEnd', 'A:pointerExit']);
  });

  it('exposes pick() and stops listening when destroyed', () => {
    const { system, fire, log, button } = setup();
    const a = button('A', 0, 0);
    expect(system.pick(5, 5)).toBe(a);
    expect(system.pick(100, 100)).toBeUndefined();
    system.gameObject.destroy();
    fire('pointerdown', 1, 5, 5);
    expect(log).toEqual([]);
  });
});
