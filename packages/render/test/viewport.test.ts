import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  Camera2D,
  SortingLayers,
  SpriteBatch,
  applyViewport,
  computeViewport,
  containerToViewport,
} from '../src/index.ts';
import type { ScaleMode } from '../src/index.ts';

const base = { designWidth: 320, designHeight: 180 };

describe('computeViewport', () => {
  it('fit letterboxes: all of the design is visible', () => {
    const layout = computeViewport({
      ...base,
      mode: 'fit',
      containerWidth: 1000,
      containerHeight: 1000,
    });
    expect(layout.cssWidth).toBe(1000);
    expect(layout.cssHeight).toBe(562.5);
    expect(layout.offsetX).toBe(0);
    expect(layout.offsetY).toBe(218.75);
    expect([layout.worldWidth, layout.worldHeight]).toEqual([320, 180]);
    expect(layout.zoom).toBeCloseTo(1000 / 320, 9);
  });

  it('fill covers the container and crops the design', () => {
    const layout = computeViewport({
      ...base,
      mode: 'fill',
      containerWidth: 1000,
      containerHeight: 1000,
    });
    expect([layout.cssWidth, layout.cssHeight, layout.offsetX, layout.offsetY]).toEqual([
      1000, 1000, 0, 0,
    ]);
    expect(layout.worldHeight).toBe(180);
    expect(layout.worldWidth).toBeCloseTo(180, 9);
  });

  it('fixedWidth and fixedHeight keep one design dimension', () => {
    const w = computeViewport({
      ...base,
      mode: 'fixedWidth',
      containerWidth: 640,
      containerHeight: 640,
    });
    expect(w.worldWidth).toBe(320);
    expect(w.worldHeight).toBe(320);
    const h = computeViewport({
      ...base,
      mode: 'fixedHeight',
      containerWidth: 640,
      containerHeight: 360,
    });
    expect(h.worldHeight).toBe(180);
    expect(h.worldWidth).toBeCloseTo(320, 9);
  });

  it('stretch distorts: the buffer keeps the design size', () => {
    const layout = computeViewport({
      ...base,
      mode: 'stretch',
      containerWidth: 900,
      containerHeight: 300,
      pixelRatio: 2,
    });
    expect([layout.cssWidth, layout.cssHeight]).toEqual([900, 300]);
    expect([layout.pixelWidth, layout.pixelHeight]).toEqual([640, 360]);
    expect(layout.zoom).toBe(2);
  });

  it('pixelPerfect only uses whole scales, and at least 1', () => {
    const big = computeViewport({
      ...base,
      mode: 'pixelPerfect',
      containerWidth: 1000,
      containerHeight: 700,
    });
    expect(big.cssWidth).toBe(960);
    expect(big.cssHeight).toBe(540);
    const small = computeViewport({
      ...base,
      mode: 'pixelPerfect',
      containerWidth: 100,
      containerHeight: 100,
    });
    expect(small.cssWidth).toBe(320);
    expect(small.offsetX).toBe(-110);
  });

  it('multiplies the drawing buffer by the pixel ratio', () => {
    const layout = computeViewport({
      ...base,
      mode: 'fit',
      containerWidth: 640,
      containerHeight: 360,
      pixelRatio: 2,
    });
    expect([layout.pixelWidth, layout.pixelHeight]).toEqual([1280, 720]);
    expect(layout.zoom).toBe(4);
  });

  it('validates its input', () => {
    const ok = { ...base, mode: 'fit' as const, containerWidth: 10, containerHeight: 10 };
    expect(() => computeViewport({ ...ok, containerWidth: 0 })).toThrow(RangeError);
    expect(() => computeViewport({ ...ok, designHeight: NaN })).toThrow(RangeError);
    expect(() => computeViewport({ ...ok, pixelRatio: -1 })).toThrow(RangeError);
  });

  it('always yields a positive buffer whose pixel/world ratio is the zoom', () => {
    const modes: ScaleMode[] = [
      'fit',
      'fill',
      'stretch',
      'fixedWidth',
      'fixedHeight',
      'pixelPerfect',
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...modes),
        fc.integer({ min: 1, max: 4000 }),
        fc.integer({ min: 1, max: 4000 }),
        fc.double({ min: 0.5, max: 4, noNaN: true }),
        (mode, cw, ch, ratio) => {
          const layout = computeViewport({
            ...base,
            mode,
            containerWidth: cw,
            containerHeight: ch,
            pixelRatio: ratio,
          });
          expect(layout.pixelWidth).toBeGreaterThanOrEqual(1);
          expect(layout.pixelHeight).toBeGreaterThanOrEqual(1);
          expect(layout.zoom * layout.worldWidth).toBeCloseTo(layout.pixelWidth, 6);
        },
      ),
    );
  });

  it('maps container points to buffer pixels and drives a camera', () => {
    const layout = computeViewport({
      ...base,
      mode: 'fit',
      containerWidth: 1000,
      containerHeight: 1000,
    });
    const centre = containerToViewport(layout, 500, 500);
    expect(centre.x).toBeCloseTo(layout.pixelWidth / 2, 9);
    expect(centre.y).toBeCloseTo(layout.pixelHeight / 2, 9);
    const camera = new Camera2D();
    camera.x = 160;
    camera.y = 90;
    applyViewport(camera, layout);
    const world = camera.screenToWorld(centre.x, centre.y);
    expect(world.x).toBeCloseTo(160, 6);
    expect(world.y).toBeCloseTo(90, 6);
    const corner = containerToViewport(layout, 0, 218.75);
    const cornerWorld = camera.screenToWorld(corner.x, corner.y);
    expect(Math.abs(cornerWorld.x)).toBeLessThan(1 / layout.zoom);
    expect(Math.abs(cornerWorld.y)).toBeLessThan(1 / layout.zoom);
  });
});

describe('SortingLayers', () => {
  const layers = new SortingLayers(['background', 'world', 'ui']);

  it('orders by layer first, then by order', () => {
    expect(layers.key('background', 511)).toBeLessThan(layers.key('world', -512));
    expect(layers.key('world', 1)).toBeLessThan(layers.key('world', 2));
    expect(layers.key('ui')).toBeGreaterThan(layers.key('world', 511));
    expect(layers.names).toEqual(['background', 'world', 'ui']);
  });

  it('stays inside a signed 16-bit field with the maximum number of layers', () => {
    const many = new SortingLayers(Array.from({ length: 31 }, (_, i) => `l${i}`));
    expect(many.key('l30', 511)).toBeLessThanOrEqual(32767);
    expect(many.key('l0', -512)).toBeGreaterThanOrEqual(0);
  });

  it('sorts sprites in a batch the way the keys say', () => {
    const batch = new SpriteBatch();
    const a = { id: 1, width: 1, height: 1 };
    const b = { id: 2, width: 1, height: 1 };
    batch.add(a, { x: 0, y: 0, width: 1, height: 1, layer: layers.key('ui') });
    batch.add(b, { x: 0, y: 0, width: 1, height: 1, layer: layers.key('background') });
    expect(batch.build().groups.map((g) => g.texture.id)).toEqual([2, 1]);
  });

  it('ySort maps lower on screen to a higher order and clamps', () => {
    expect(SortingLayers.ySort(10)).toBeGreaterThan(SortingLayers.ySort(5));
    expect(SortingLayers.ySort(1e9)).toBe(511);
    expect(SortingLayers.ySort(-1e9)).toBe(-512);
    expect(SortingLayers.ySort(64, 16)).toBe(4);
  });

  it('validates names and orders', () => {
    expect(() => new SortingLayers(['a', 'a'])).toThrow(/duplicate/);
    expect(() => new SortingLayers(Array.from({ length: 32 }, (_, i) => `l${i}`))).toThrow(
      RangeError,
    );
    expect(() => layers.key('nope')).toThrow(RangeError);
    expect(() => layers.key('world', 512)).toThrow(RangeError);
    expect(() => layers.key('world', 0.5)).toThrow(RangeError);
  });
});
