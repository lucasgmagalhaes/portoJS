import { describe, expect, it } from 'vitest';
import { ParticleEmitter, SpriteBatch } from '../src/index.ts';
import type { ParticleOptions } from '../src/index.ts';

const texture = { id: 1, width: 4, height: 4 };

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function make(options: Partial<ParticleOptions> = {}): ParticleEmitter {
  return new ParticleEmitter({ texture, random: seeded(1), ...options });
}

function drawn(emitter: ParticleEmitter): { data: Float32Array; bits: Uint32Array; count: number } {
  const batch = new SpriteBatch();
  emitter.draw(batch);
  const { data, count } = batch.build();
  return { data, bits: new Uint32Array(data.buffer, data.byteOffset, data.length), count };
}

describe('emission', () => {
  it('bursts up to the maximum and drops the rest', () => {
    const emitter = make({ max: 5 });
    emitter.burst(3);
    expect(emitter.count).toBe(3);
    emitter.burst(10);
    expect(emitter.count).toBe(5);
  });

  it('emits at the rate, carrying fractions between updates', () => {
    const emitter = make({ rate: 10, lifetime: 100 });
    for (let i = 0; i < 25; i++) emitter.update(0.04);
    expect(emitter.count).toBe(10);
    emitter.emitting = false;
    emitter.update(1);
    expect(emitter.count).toBe(10);
    emitter.burst(2);
    expect(emitter.count).toBe(12);
  });

  it('retires particles when their life ends and keeps the others intact', () => {
    const emitter = make({ lifetime: [1, 3], speed: 0 });
    emitter.burst(200);
    emitter.update(1.5);
    const survivors = emitter.count;
    expect(survivors).toBeGreaterThan(0);
    expect(survivors).toBeLessThan(200);
    emitter.update(2);
    expect(emitter.count).toBe(0);
  });

  it('clears', () => {
    const emitter = make();
    emitter.burst(4);
    emitter.clear();
    expect(emitter.count).toBe(0);
  });

  it('validates its options', () => {
    expect(() => make({ max: 0 })).toThrow(RangeError);
    expect(() => make({ max: 1.5 })).toThrow(RangeError);
    expect(() => make({ rate: -1 })).toThrow(RangeError);
  });
});

describe('motion', () => {
  it('moves along the angle at the speed, from the emitter position', () => {
    const emitter = make({ speed: 10, angle: 0, lifetime: 10 });
    emitter.x = 5;
    emitter.y = 7;
    emitter.burst(1);
    emitter.update(2);
    const { data } = drawn(emitter);
    expect(data[0]).toBeCloseTo(25, 4);
    expect(data[1]).toBeCloseTo(7, 4);
  });

  it('points down for a quarter turn, since y grows downwards', () => {
    const emitter = make({ speed: 10, angle: Math.PI / 2, lifetime: 10 });
    emitter.burst(1);
    emitter.update(1);
    expect(drawn(emitter).data[1]).toBeCloseTo(10, 4);
  });

  it('applies gravity and drag', () => {
    const falling = make({ gravity: { x: 0, y: 100 }, lifetime: 10 });
    falling.burst(1);
    falling.update(1);
    expect(drawn(falling).data[1]).toBeCloseTo(100, 3);
    const slowing = make({ speed: 100, angle: 0, drag: 0.5, lifetime: 10 });
    slowing.burst(1);
    slowing.update(1);
    expect(drawn(slowing).data[0]).toBeCloseTo(50, 3);
  });

  it('spins', () => {
    const emitter = make({ spin: 2, rotation: 1, lifetime: 10 });
    emitter.burst(1);
    emitter.update(0.5);
    expect(drawn(emitter).data[4]).toBeCloseTo(2, 4);
  });
});

describe('spawn area', () => {
  it('stays inside a rectangle', () => {
    const emitter = make({ area: { kind: 'rect', width: 10, height: 4 }, lifetime: 10 });
    emitter.x = 100;
    emitter.y = 50;
    emitter.burst(300);
    const { data, count } = drawn(emitter);
    let spread = 0;
    for (let i = 0; i < count; i++) {
      const x = data[i * 12] ?? 0;
      const y = data[i * 12 + 1] ?? 0;
      expect(Math.abs(x - 100)).toBeLessThanOrEqual(5);
      expect(Math.abs(y - 50)).toBeLessThanOrEqual(2);
      spread = Math.max(spread, Math.abs(x - 100));
    }
    expect(spread).toBeGreaterThan(3);
  });

  it('stays inside a circle', () => {
    const emitter = make({ area: { kind: 'circle', radius: 6 }, lifetime: 10 });
    emitter.burst(300);
    const { data, count } = drawn(emitter);
    for (let i = 0; i < count; i++) {
      expect(Math.hypot(data[i * 12] ?? 0, data[i * 12 + 1] ?? 0)).toBeLessThanOrEqual(6.0001);
    }
  });
});

describe('look over life', () => {
  it('interpolates size and colour, and applies an easing curve', () => {
    const emitter = make({
      lifetime: 2,
      size: { start: 10, end: 0 },
      color: { start: 0xff000000, end: 0x00ff00ff },
    });
    emitter.burst(1);
    const fresh = drawn(emitter);
    expect(fresh.data[2]).toBe(10);
    expect(fresh.bits[11]).toBe(0xff000000);
    emitter.update(1);
    const half = drawn(emitter);
    expect(half.data[2]).toBeCloseTo(5, 4);
    expect(half.bits[11]).toBe(0x80800080);

    const eased = make({ lifetime: 2, size: { start: 10, end: 0 }, ease: (t) => t * t });
    eased.burst(1);
    eased.update(1);
    expect(drawn(eased).data[2]).toBeCloseTo(7.5, 4);
  });

  it('uses a constant size and colour when given numbers, and the layer', () => {
    const emitter = make({ size: 3, color: 0x11223344, layer: 4, lifetime: 5 });
    emitter.burst(2);
    emitter.update(1);
    const { data, bits, count } = drawn(emitter);
    expect(count).toBe(2);
    expect(data[2]).toBe(3);
    expect(bits[11]).toBe(0x11223344);
  });
});

describe('determinism', () => {
  it('gives the same particles for the same random source', () => {
    const run = (): number[] => {
      const emitter = make({ random: seeded(42), speed: [10, 50], lifetime: [1, 2], rate: 30 });
      for (let i = 0; i < 30; i++) emitter.update(0.05);
      return Array.from(drawn(emitter).data);
    };
    expect(run()).toEqual(run());
  });
});
