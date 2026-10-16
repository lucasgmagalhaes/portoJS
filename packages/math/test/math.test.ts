import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  Color,
  Mat3,
  Rect,
  Rng,
  Vec2,
  Vec3,
  circleIntersectsCircle,
  circleIntersectsRect,
  clamp,
  inverseLerp,
  lerp,
  pointInCircle,
  pointInPolygon,
  polygonsIntersect,
  remap,
  segmentsIntersect,
  wrap,
} from '../src/index.ts';

describe('scalar helpers', () => {
  it('clamps, lerps and remaps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(inverseLerp(10, 20, 15)).toBe(0.5);
    expect(inverseLerp(3, 3, 9)).toBe(0);
    expect(remap(5, 0, 10, 100, 200)).toBe(150);
  });

  it('wraps negative values and rejects an empty range', () => {
    expect(wrap(-1, 0, 4)).toBe(3);
    expect(wrap(5, 0, 4)).toBe(1);
    expect(() => wrap(1, 2, 2)).toThrow(RangeError);
  });
});

describe('Vec2', () => {
  it('does arithmetic without mutating, or in place with out', () => {
    const a = new Vec2(3, 4);
    expect(a.add(new Vec2(1, 1))).toEqual(new Vec2(4, 5));
    expect(a).toEqual(new Vec2(3, 4));
    a.add(new Vec2(1, 1), a);
    expect(a).toEqual(new Vec2(4, 5));
    expect(new Vec2(3, 4).length()).toBe(5);
    expect(new Vec2(3, 4).sub(new Vec2(1, 1))).toEqual(new Vec2(2, 3));
    expect(new Vec2(3, 4).scale(2)).toEqual(new Vec2(6, 8));
    expect(new Vec2(1, 0).cross(new Vec2(0, 1))).toBe(1);
    expect(new Vec2(1, 2).dot(new Vec2(3, 4))).toBe(11);
    expect(new Vec2(0, 0).distanceTo(new Vec2(3, 4))).toBe(5);
  });

  it('normalises, rotates and clamps length', () => {
    expect(new Vec2(0, 0).normalize()).toEqual(new Vec2(0, 0));
    expect(new Vec2(0, 5).normalize()).toEqual(new Vec2(0, 1));
    const r = new Vec2(1, 0).rotate(Math.PI / 2);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(1);
    expect(new Vec2(10, 0).clampLength(3)).toEqual(new Vec2(3, 0));
    expect(new Vec2(1, 0).clampLength(3)).toEqual(new Vec2(1, 0));
    expect(Vec2.fromAngle(0, 2)).toEqual(new Vec2(2, 0));
    expect(new Vec2(0, 1).angle()).toBeCloseTo(Math.PI / 2);
    expect(new Vec2(0, 0).lerp(new Vec2(10, 20), 0.5)).toEqual(new Vec2(5, 10));
    expect(new Vec2(1, 2).equals(new Vec2(1, 2))).toBe(true);
    expect(new Vec2(1, 2).clone()).toEqual(new Vec2(1, 2));
  });

  it('keeps the dot product commutative', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, min: -1e6, max: 1e6 }),
        fc.double({ noNaN: true, min: -1e6, max: 1e6 }),
        fc.double({ noNaN: true, min: -1e6, max: 1e6 }),
        fc.double({ noNaN: true, min: -1e6, max: 1e6 }),
        (ax, ay, bx, by) => {
          const a = new Vec2(ax, ay);
          const b = new Vec2(bx, by);
          expect(a.dot(b)).toBe(b.dot(a));
        },
      ),
    );
  });
});

describe('Vec3', () => {
  it('does the basic algebra', () => {
    const x = new Vec3(1, 0, 0);
    const y = new Vec3(0, 1, 0);
    expect(x.cross(y)).toEqual(new Vec3(0, 0, 1));
    expect(x.dot(y)).toBe(0);
    expect(x.add(y)).toEqual(new Vec3(1, 1, 0));
    expect(x.sub(y)).toEqual(new Vec3(1, -1, 0));
    expect(x.scale(3)).toEqual(new Vec3(3, 0, 0));
    expect(new Vec3(2, 3, 6).length()).toBe(7);
    expect(new Vec3(0, 0, 0).normalize()).toEqual(new Vec3(0, 0, 0));
    expect(new Vec3(0, 0, 4).normalize()).toEqual(new Vec3(0, 0, 1));
    expect(x.lerp(y, 0.5)).toEqual(new Vec3(0.5, 0.5, 0));
    expect(x.lengthSquared()).toBe(1);
    expect(x.equals(x.clone())).toBe(true);
  });
});

describe('Rect', () => {
  const a = new Rect(0, 0, 10, 10);

  it('contains points with half-open edges', () => {
    expect(a.contains(0, 0)).toBe(true);
    expect(a.contains(10, 5)).toBe(false);
    expect(a.containsPoint(new Vec2(5, 5))).toBe(true);
    expect([a.right, a.bottom, a.centerX, a.centerY]).toEqual([10, 10, 5, 5]);
  });

  it('intersects, unions and inflates', () => {
    expect(a.intersects(new Rect(5, 5, 10, 10))).toBe(true);
    expect(a.intersects(new Rect(10, 0, 5, 5))).toBe(false);
    expect(a.intersection(new Rect(5, 5, 10, 10))).toEqual(new Rect(5, 5, 5, 5));
    expect(a.intersection(new Rect(20, 20, 1, 1))).toBeNull();
    expect(a.union(new Rect(20, 20, 5, 5))).toEqual(new Rect(0, 0, 25, 25));
    expect(a.inflate(2)).toEqual(new Rect(-2, -2, 14, 14));
    expect(a.inflate(-20).width).toBe(0);
    expect(a.clone()).toEqual(a);
  });
});

describe('Mat3', () => {
  it('composes and transforms points', () => {
    const m = Mat3.compose(10, 20, Math.PI / 2, 2);
    const p = m.transformPoint(new Vec2(1, 0));
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(22);
  });

  it('inverts so that m⁻¹ · m is the identity', () => {
    const m = Mat3.compose(3, -4, 0.7, 2, 3);
    const inv = m.invert() ?? new Mat3();
    const p = inv.transformPoint(m.transformPoint(new Vec2(5, 6)));
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(6);
    expect(Mat3.compose(0, 0, 0, 0, 0).invert()).toBeNull();
  });

  it('multiplies with the right operand applied first', () => {
    const translate = Mat3.compose(10, 0);
    const scale = Mat3.compose(0, 0, 0, 2);
    const p = translate.multiply(scale).transformPoint(new Vec2(1, 1));
    expect(p).toEqual(new Vec2(12, 2));
    expect(translate.clone().identity().a).toBe(1);
  });
});

describe('geometry', () => {
  it('tests circles and rectangles', () => {
    const c = { x: 0, y: 0, radius: 5 };
    expect(pointInCircle(c, 3, 4)).toBe(true);
    expect(pointInCircle(c, 4, 4)).toBe(false);
    expect(circleIntersectsCircle(c, { x: 10, y: 0, radius: 5 })).toBe(true);
    expect(circleIntersectsCircle(c, { x: 11, y: 0, radius: 5 })).toBe(false);
    expect(circleIntersectsRect(c, new Rect(4, 0, 4, 4))).toBe(true);
    expect(circleIntersectsRect(c, new Rect(6, 6, 4, 4))).toBe(false);
  });

  it('tests points in polygons', () => {
    const square = [new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 10), new Vec2(0, 10)];
    expect(pointInPolygon(square, 5, 5)).toBe(true);
    expect(pointInPolygon(square, 15, 5)).toBe(false);
  });

  it('tests segments, including touching and collinear cases', () => {
    const s = (x1: number, y1: number, x2: number, y2: number) =>
      [new Vec2(x1, y1), new Vec2(x2, y2)] as const;
    const hit = (p: readonly [Vec2, Vec2], q: readonly [Vec2, Vec2]) =>
      segmentsIntersect(p[0], p[1], q[0], q[1]);
    expect(hit(s(0, 0, 10, 10), s(0, 10, 10, 0))).toBe(true);
    expect(hit(s(0, 0, 10, 0), s(0, 5, 10, 5))).toBe(false);
    expect(hit(s(0, 0, 10, 0), s(10, 0, 20, 5))).toBe(true);
    expect(hit(s(0, 0, 5, 0), s(3, 0, 8, 0))).toBe(true);
    expect(hit(s(0, 0, 2, 0), s(3, 0, 8, 0))).toBe(false);
  });

  it('tests convex polygons with SAT', () => {
    const sq = (x: number, y: number) => [
      new Vec2(x, y),
      new Vec2(x + 10, y),
      new Vec2(x + 10, y + 10),
      new Vec2(x, y + 10),
    ];
    expect(polygonsIntersect(sq(0, 0), sq(5, 5))).toBe(true);
    expect(polygonsIntersect(sq(0, 0), sq(20, 0))).toBe(false);
  });
});

describe('Color', () => {
  it('parses and prints hex', () => {
    expect(Color.fromHex('#ff0000').toHex()).toBe('#ff0000');
    expect(Color.fromHex('#f00').r).toBe(1);
    expect(Color.fromHex('#ff000080').a).toBeCloseTo(128 / 255);
    expect(Color.fromHex('00ff00').g).toBe(1);
    expect(new Color(0, 0, 0, 0.5).toHex()).toBe('#00000080');
    expect(() => Color.fromHex('#12')).toThrow(RangeError);
  });

  it('converts HSL and interpolates', () => {
    expect(Color.fromHsl(0, 1, 0.5).toHex()).toBe('#ff0000');
    expect(Color.fromHsl(120, 1, 0.5).toHex()).toBe('#00ff00');
    expect(Color.fromHsl(240, 1, 0.25).toHex()).toBe('#000080');
    expect(Color.fromHsl(-120, 1, 0.5).toHex()).toBe('#0000ff');
    expect(Color.fromHsl(10, 0, 0.5).toHex()).toBe('#808080');
    expect(new Color(0, 0, 0).lerp(new Color(1, 1, 1), 0.5)).toEqual(new Color(0.5, 0.5, 0.5, 1));
    expect(new Color(1, 0, 0).clone()).toEqual(new Color(1, 0, 0, 1));
  });
});

describe('Rng', () => {
  it('matches the xoshiro128** reference for a known state', () => {
    const rng = Rng.fromState([1, 2, 3, 4]);
    expect(rng.nextUint32()).toBe(11520);
    expect(rng.nextUint32()).toBe(0);
    expect(rng.nextUint32()).toBe(5927040);
    expect(rng.nextUint32()).toBe(70819200);
  });

  it('is reproducible for a seed and differs between seeds', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const seqA = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 20 }, () => c.next())).not.toEqual(seqA);
  });

  it('restores from a saved state through JSON', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 10; i++) rng.next();
    const saved = JSON.parse(JSON.stringify(rng.state())) as [number, number, number, number];
    const restored = Rng.fromState(saved);
    expect(restored.next()).toBe(rng.next());
  });

  it('rejects invalid states', () => {
    expect(() => Rng.fromState([0, 0, 0, 0])).toThrow(RangeError);
    expect(() => Rng.fromState([1, 2, 3] as never)).toThrow(RangeError);
    expect(() => Rng.fromState([1, 2, 3, -1])).toThrow(RangeError);
  });

  it('never leaves ranges', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer({ min: -50, max: 50 }),
        fc.nat(100),
        (seed, min, extra) => {
          const rng = new Rng(seed);
          for (let i = 0; i < 20; i++) {
            const v = rng.int(min, min + extra);
            expect(v).toBeGreaterThanOrEqual(min);
            expect(v).toBeLessThanOrEqual(min + extra);
            const f = rng.float(2, 3);
            expect(f).toBeGreaterThanOrEqual(2);
            expect(f).toBeLessThan(3);
          }
        },
      ),
    );
  });

  it('is roughly uniform', () => {
    const rng = new Rng(1);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60_000; i++) {
      const face = rng.int(0, 5);
      counts[face] = (counts[face] ?? 0) + 1;
    }
    for (const n of counts) expect(Math.abs(n - 10_000)).toBeLessThan(500);
  });

  it('validates int arguments', () => {
    const rng = new Rng(1);
    expect(() => rng.int(5, 1)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
    expect(() => rng.int(0, 2 ** 33)).toThrow(RangeError);
    expect(rng.int(3, 3)).toBe(3);
  });

  it('picks, shuffles, forks and rolls chances', () => {
    const rng = new Rng(5);
    expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']));
    expect(() => rng.pick([])).toThrow(RangeError);
    const shuffled = rng.shuffle([1, 2, 3, 4, 5, 6]);
    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    const fork = rng.fork();
    expect(fork).not.toBe(rng);
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
    expect(typeof rng.chance()).toBe('boolean');
  });

  it('picks by weight and ignores zero weights', () => {
    const rng = new Rng(9);
    const counts = { common: 0, rare: 0, never: 0 };
    const entries = [
      { value: 'common' as const, weight: 9 },
      { value: 'rare' as const, weight: 1 },
      { value: 'never' as const, weight: 0 },
    ];
    for (let i = 0; i < 10_000; i++) counts[rng.weighted(entries)]++;
    expect(counts.never).toBe(0);
    expect(counts.rare).toBeGreaterThan(800);
    expect(counts.rare).toBeLessThan(1200);
    expect(() => rng.weighted([{ value: 1, weight: 0 }])).toThrow(RangeError);
    expect(() => rng.weighted([{ value: 1, weight: -1 }])).toThrow(RangeError);
    expect(() => rng.weighted([])).toThrow(RangeError);
  });
});
