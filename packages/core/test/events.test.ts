import { describe, expect, it } from 'vitest';
import { Emitter } from '../src/index.ts';

interface Events {
  hit: { damage: number };
  ping: undefined;
}

describe('Emitter', () => {
  it('delivers payloads to listeners in subscription order', () => {
    const bus = new Emitter<Events>();
    const seen: string[] = [];
    bus.on('hit', ({ damage }) => seen.push(`a${damage}`));
    bus.on('hit', ({ damage }) => seen.push(`b${damage}`));
    bus.emit('hit', { damage: 3 });
    expect(seen).toEqual(['a3', 'b3']);
  });

  it('unsubscribes through the returned function', () => {
    const bus = new Emitter<Events>();
    let calls = 0;
    const off = bus.on('ping', () => calls++);
    bus.emit('ping', undefined);
    off();
    bus.emit('ping', undefined);
    expect(calls).toBe(1);
    expect(bus.listenerCount('ping')).toBe(0);
  });

  it('supports the same function registered twice independently', () => {
    const bus = new Emitter<Events>();
    let calls = 0;
    const listener = (): void => {
      calls++;
    };
    const off1 = bus.on('ping', listener);
    bus.on('ping', listener);
    off1();
    bus.emit('ping', undefined);
    expect(calls).toBe(1);
  });

  it('once fires a single time', () => {
    const bus = new Emitter<Events>();
    let calls = 0;
    bus.once('ping', () => calls++);
    bus.emit('ping', undefined);
    bus.emit('ping', undefined);
    expect(calls).toBe(1);
  });

  it('allows unsubscribing during emit without skipping others', () => {
    const bus = new Emitter<Events>();
    const seen: number[] = [];
    const off = bus.on('ping', () => {
      seen.push(1);
      off();
    });
    bus.on('ping', () => seen.push(2));
    bus.emit('ping', undefined);
    bus.emit('ping', undefined);
    expect(seen).toEqual([1, 2, 2]);
  });

  it('runs every listener even if one throws, then rethrows', () => {
    const bus = new Emitter<Events>();
    let reached = false;
    bus.on('ping', () => {
      throw new Error('boom');
    });
    bus.on('ping', () => {
      reached = true;
    });
    expect(() => bus.emit('ping', undefined)).toThrow('boom');
    expect(reached).toBe(true);
  });

  it('aggregates multiple errors', () => {
    const bus = new Emitter<Events>();
    bus.on('ping', () => {
      throw new Error('one');
    });
    bus.on('ping', () => {
      throw new Error('two');
    });
    expect(() => bus.emit('ping', undefined)).toThrow(AggregateError);
  });

  it('emitting with no listeners is a no-op', () => {
    const bus = new Emitter<Events>();
    expect(() => bus.emit('hit', { damage: 1 })).not.toThrow();
  });

  it('clear removes listeners for one or all events', () => {
    const bus = new Emitter<Events>();
    bus.on('ping', () => undefined);
    bus.on('hit', () => undefined);
    bus.clear('ping');
    expect(bus.listenerCount('ping')).toBe(0);
    expect(bus.listenerCount('hit')).toBe(1);
    bus.clear();
    expect(bus.listenerCount('hit')).toBe(0);
  });
});
