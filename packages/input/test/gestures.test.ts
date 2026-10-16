import { describe, expect, it } from 'vitest';
import { GestureRecognizer } from '../src/index.ts';
import type { PointerStreamEvent } from '../src/index.ts';

function make() {
  const gestures = new GestureRecognizer();
  const log: string[] = [];
  gestures.tap.addListener((p) => log.push(`tap ${p.x},${p.y}`));
  gestures.doubleTap.addListener((p) => log.push(`double ${p.x},${p.y}`));
  gestures.longPress.addListener((p) => log.push(`long ${p.x},${p.y}`));
  gestures.swipe.addListener((s) => log.push(`swipe ${s.direction}`));
  gestures.panStart.addListener(() => log.push('panStart'));
  gestures.pan.addListener((p) => log.push(`pan ${p.dx},${p.dy}`));
  gestures.panEnd.addListener(() => log.push('panEnd'));
  gestures.pinch.addListener((p) => log.push(`pinch ${p.scale.toFixed(2)} ${p.delta.toFixed(2)}`));
  const send = (
    type: PointerStreamEvent['type'],
    pointerId: number,
    x: number,
    y: number,
    time: number,
    button = 0,
  ): void => gestures.feed({ type, pointerId, x, y, time, button });
  return { gestures, log, send };
}

describe('GestureRecognizer', () => {
  it('recognises a tap', () => {
    const { log, send } = make();
    send('down', 1, 50, 60, 0);
    send('up', 1, 52, 61, 100);
    expect(log).toEqual(['tap 52,61']);
  });

  it('ignores a press that is too long or moved too much to be a tap', () => {
    const { log, send } = make();
    send('down', 1, 0, 0, 0);
    send('up', 1, 0, 0, 400);
    send('down', 1, 0, 0, 1000);
    send('move', 1, 5, 5, 1010);
    send('up', 1, 20, 0, 1050);
    expect(log).toEqual([]);
  });

  it('turns two close taps into a tap and a double tap', () => {
    const { log, send } = make();
    send('down', 1, 10, 10, 0);
    send('up', 1, 10, 10, 50);
    send('down', 1, 14, 10, 200);
    send('up', 1, 14, 10, 250);
    send('down', 1, 14, 10, 300);
    send('up', 1, 14, 10, 350);
    expect(log).toEqual(['tap 10,10', 'tap 14,10', 'double 14,10', 'tap 14,10']);
  });

  it('does not double tap when the taps are far apart in time or space', () => {
    const { log, send } = make();
    send('down', 1, 0, 0, 0);
    send('up', 1, 0, 0, 50);
    send('down', 1, 0, 0, 1000);
    send('up', 1, 0, 0, 1050);
    send('down', 1, 200, 0, 1100);
    send('up', 1, 200, 0, 1150);
    expect(log.filter((l) => l.startsWith('double'))).toEqual([]);
  });

  it('raises a long press from update() and then no tap', () => {
    const { gestures, log, send } = make();
    send('down', 1, 5, 5, 0);
    gestures.update(499);
    expect(log).toEqual([]);
    gestures.update(500);
    gestures.update(900);
    send('up', 1, 5, 5, 1000);
    expect(log).toEqual(['long 5,5']);
  });

  it('does not long press when the finger moved, or with two fingers', () => {
    const { gestures, log, send } = make();
    send('down', 1, 0, 0, 0);
    send('move', 1, 30, 0, 100);
    gestures.update(1000);
    send('up', 1, 30, 0, 1100);
    send('down', 2, 0, 0, 2000);
    send('down', 3, 50, 0, 2000);
    gestures.update(5000);
    expect(log.some((l) => l.startsWith('long'))).toBe(false);
  });

  it('recognises swipes in four directions', () => {
    const { log, send } = make();
    const swipe = (x: number, y: number): void => {
      send('down', 1, 100, 100, 0);
      send('up', 1, 100 + x, 100 + y, 150);
    };
    swipe(80, 10);
    swipe(-80, 10);
    swipe(10, 80);
    swipe(10, -80);
    expect(log.filter((l) => l.startsWith('swipe'))).toEqual([
      'swipe right',
      'swipe left',
      'swipe down',
      'swipe up',
    ]);
  });

  it('reports swipe distance and velocity', () => {
    const { gestures, send } = make();
    let seen: { distance: number; velocity: number } | undefined;
    gestures.swipe.addListener((s) => (seen = { distance: s.distance, velocity: s.velocity }));
    send('down', 1, 0, 0, 0);
    send('up', 1, 100, 0, 200);
    expect(seen).toEqual({ distance: 100, velocity: 500 });
  });

  it('does not swipe when the stroke is slow', () => {
    const { log, send } = make();
    send('down', 1, 0, 0, 0);
    send('up', 1, 100, 0, 2000);
    expect(log.some((l) => l.startsWith('swipe'))).toBe(false);
  });

  it('pans with deltas, then ends', () => {
    const { log, send } = make();
    send('down', 1, 0, 0, 0);
    send('move', 1, 4, 0, 10);
    send('move', 1, 12, 0, 20);
    send('move', 1, 20, 5, 30);
    send('up', 1, 20, 5, 4000);
    expect(log).toEqual(['panStart', 'pan 12,0', 'pan 8,5', 'panEnd']);
  });

  it('ends a pan on cancel without swiping', () => {
    const { log, send } = make();
    send('down', 1, 0, 0, 0);
    send('move', 1, 50, 0, 10);
    send('cancel', 1, 50, 0, 20);
    expect(log).toEqual(['panStart', 'pan 50,0', 'panEnd']);
  });

  it('pinches with scale and delta, and stops when a finger lifts', () => {
    const { log, send } = make();
    send('down', 1, 0, 0, 0);
    send('down', 2, 100, 0, 5);
    send('move', 2, 200, 0, 10);
    send('move', 2, 150, 0, 15);
    send('up', 2, 150, 0, 20);
    send('move', 1, 30, 0, 25);
    send('up', 1, 30, 0, 30);
    expect(log).toEqual(['pinch 2.00 2.00', 'pinch 1.50 0.75']);
  });

  it('cancels a pan in progress when a second finger lands', () => {
    const { log, send } = make();
    send('down', 1, 0, 0, 0);
    send('move', 1, 40, 0, 10);
    send('down', 2, 100, 0, 20);
    expect(log).toEqual(['panStart', 'pan 40,0', 'panEnd']);
  });

  it('ignores other buttons and unknown pointers, and can reset', () => {
    const { gestures, log, send } = make();
    send('down', 1, 0, 0, 0, 2);
    send('up', 1, 0, 0, 50, 2);
    send('move', 9, 5, 5, 60);
    send('up', 9, 5, 5, 70);
    send('down', 1, 0, 0, 100);
    gestures.reset();
    send('up', 1, 0, 0, 150);
    expect(log).toEqual([]);
  });

  it('attaches to a pointer and stops', () => {
    const { gestures, log } = make();
    let listener: ((e: PointerStreamEvent) => void) | undefined;
    const pointer = {
      events: {
        addListener(l: (e: PointerStreamEvent) => void) {
          listener = l;
          return () => {
            listener = undefined;
          };
        },
      },
    };
    const stop = gestures.attach(pointer as never);
    listener?.({ type: 'down', pointerId: 1, x: 1, y: 1, button: 0, time: 0 });
    listener?.({ type: 'up', pointerId: 1, x: 1, y: 1, button: 0, time: 10 });
    expect(log).toEqual(['tap 1,1']);
    stop();
    expect(listener).toBeUndefined();
  });
});
