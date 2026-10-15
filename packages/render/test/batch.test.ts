import { describe, expect, it } from 'vitest';
import { Camera2D, INSTANCE_FLOATS, SpriteBatch } from '../src/index.js';
import type { Texture } from '../src/index.js';

const a: Texture = { id: 1, width: 16, height: 16 };
const b: Texture = { id: 2, width: 16, height: 16 };

describe('SpriteBatch', () => {
  it('groups sprites by texture into one draw call each', () => {
    const batch = new SpriteBatch();
    batch.add(a, { x: 1, y: 1, width: 4, height: 4 });
    batch.add(b, { x: 2, y: 2, width: 4, height: 4 });
    batch.add(a, { x: 3, y: 3, width: 4, height: 4 });
    const { data, groups, count } = batch.build();
    expect(count).toBe(3);
    expect(groups.map((g) => [g.texture.id, g.start, g.count])).toEqual([
      [1, 0, 2],
      [2, 2, 1],
    ]);
    expect(data).toHaveLength(3 * INSTANCE_FLOATS);
    expect(data[0]).toBe(1);
    expect(data[INSTANCE_FLOATS]).toBe(3);
    expect(data[2 * INSTANCE_FLOATS]).toBe(2);
  });

  it('orders by layer and merges neighbouring groups of one texture', () => {
    const batch = new SpriteBatch();
    batch.add(b, { x: 0, y: 0, width: 1, height: 1, layer: 5 });
    batch.add(a, { x: 0, y: 0, width: 1, height: 1, layer: 1 });
    batch.add(b, { x: 0, y: 0, width: 1, height: 1, layer: 2 });
    batch.add(b, { x: 0, y: 0, width: 1, height: 1, layer: 3 });
    const { groups } = batch.build();
    expect(groups.map((g) => [g.texture.id, g.count])).toEqual([
      [1, 1],
      [2, 3],
    ]);
  });

  it('applies defaults and packs the colour bits', () => {
    const batch = new SpriteBatch();
    batch.add(a, { x: 5, y: 6, width: 7, height: 8, color: 0x11223344 });
    batch.add(a, { x: 0, y: 0, width: 1, height: 1 });
    const { data } = batch.build();
    const bits = new Uint32Array(data.buffer, data.byteOffset, data.length);
    expect(Array.from(data.subarray(0, 11))).toEqual([5, 6, 7, 8, 0, 0.5, 0.5, 0, 0, 1, 1]);
    expect(bits[11]).toBe(0x11223344);
    expect(bits[INSTANCE_FLOATS + 11]).toBe(0xffffffff);
  });

  it('grows past its initial capacity and can be reused', () => {
    const batch = new SpriteBatch(2);
    for (let i = 0; i < 1000; i++) batch.add(a, { x: i, y: 0, width: 1, height: 1 });
    expect(batch.count).toBe(1000);
    const first = batch.build();
    expect(first.count).toBe(1000);
    expect(first.data[999 * INSTANCE_FLOATS]).toBe(999);
    batch.clear();
    expect(batch.count).toBe(0);
    expect(batch.build().groups).toEqual([]);
    batch.add(b, { x: 7, y: 0, width: 1, height: 1 });
    const second = batch.build();
    expect(second.groups).toHaveLength(1);
    expect(second.data[0]).toBe(7);
  });
});

describe('Camera2D', () => {
  it('maps the camera centre to the middle of the screen', () => {
    const camera = new Camera2D(800, 600);
    camera.x = 100;
    camera.y = 50;
    const m = camera.viewProjection();
    expect((m[0] ?? 0) * 100 + (m[4] ?? 0) * 50 + (m[12] ?? 0)).toBeCloseTo(0, 6);
    expect((m[1] ?? 0) * 100 + (m[5] ?? 0) * 50 + (m[13] ?? 0)).toBeCloseTo(0, 6);
    expect(camera.worldToScreen(100, 50)).toEqual({ x: 400, y: 300 });
  });

  it('maps the viewport corners to clip space with y down', () => {
    const camera = new Camera2D(800, 600);
    const m = camera.viewProjection();
    const topLeft = camera.screenToWorld(0, 0);
    expect(topLeft).toEqual({ x: -400, y: -300 });
    expect((m[0] ?? 0) * topLeft.x + (m[12] ?? 0)).toBeCloseTo(-1, 6);
    expect((m[5] ?? 0) * topLeft.y + (m[13] ?? 0)).toBeCloseTo(1, 6);
  });

  it('round-trips screen and world coordinates with zoom and rotation', () => {
    const camera = new Camera2D(640, 480);
    camera.x = 12;
    camera.y = -7;
    camera.zoom = 2.5;
    camera.rotation = 0.7;
    const world = camera.screenToWorld(123, 321);
    const screen = camera.worldToScreen(world.x, world.y);
    expect(screen.x).toBeCloseTo(123, 6);
    expect(screen.y).toBeCloseTo(321, 6);
  });

  it('resizes and rejects bad sizes', () => {
    const camera = new Camera2D();
    camera.setViewport(100, 50);
    expect(camera.width).toBe(100);
    expect(() => camera.setViewport(0, 10)).toThrow(RangeError);
    expect(() => new Camera2D(10, -1)).toThrow(RangeError);
  });
});
