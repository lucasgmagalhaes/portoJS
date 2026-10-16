import type { Rect } from './rect.ts';
import type { Vec2 } from './vec2.ts';

/**
 * A circle by centre and radius.
 */
export interface Circle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * Whether the point is inside or on the circle.
 */
export function pointInCircle(circle: Circle, x: number, y: number): boolean {
  return (x - circle.x) ** 2 + (y - circle.y) ** 2 <= circle.radius ** 2;
}

/**
 * Whether two circles overlap or touch.
 */
export function circleIntersectsCircle(a: Circle, b: Circle): boolean {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= (a.radius + b.radius) ** 2;
}

/**
 * Whether a circle overlaps or touches a rectangle.
 */
export function circleIntersectsRect(circle: Circle, rect: Rect): boolean {
  const nearestX = Math.max(rect.x, Math.min(circle.x, rect.right));
  const nearestY = Math.max(rect.y, Math.min(circle.y, rect.bottom));
  return (circle.x - nearestX) ** 2 + (circle.y - nearestY) ** 2 <= circle.radius ** 2;
}

/**
 * Even-odd test of a point against a simple polygon.
 */
export function pointInPolygon(polygon: readonly Vec2[], x: number, y: number): boolean {
  let inside = false;
  let previous = polygon.at(-1);
  for (const current of polygon) {
    if (
      previous !== undefined &&
      current.y > y !== previous.y > y &&
      x < ((previous.x - current.x) * (y - current.y)) / (previous.y - current.y) + current.x
    ) {
      inside = !inside;
    }
    previous = current;
  }
  return inside;
}

function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

function onSegment(a: Vec2, b: Vec2, p: Vec2): boolean {
  return (
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  );
}

/**
 * Whether segment `a1`-`a2` crosses or touches segment `b1`-`b2`.
 */
export function segmentsIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (o1 !== o2 && o3 !== o4) return true;
  return (
    (o1 === 0 && onSegment(a1, a2, b1)) ||
    (o2 === 0 && onSegment(a1, a2, b2)) ||
    (o3 === 0 && onSegment(b1, b2, a1)) ||
    (o4 === 0 && onSegment(b1, b2, a2))
  );
}

function separatedAlongEdges(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  let previous = a.at(-1);
  for (const current of a) {
    if (previous !== undefined) {
      const axisX = previous.y - current.y;
      const axisY = current.x - previous.x;
      let minA = Infinity;
      let maxA = -Infinity;
      for (const p of a) {
        const d = p.x * axisX + p.y * axisY;
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      let minB = Infinity;
      let maxB = -Infinity;
      for (const p of b) {
        const d = p.x * axisX + p.y * axisY;
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      if (maxA < minB || maxB < minA) return true;
    }
    previous = current;
  }
  return false;
}

/**
 * Separating Axis Theorem test for two convex polygons. Touching edges count as overlap.
 */
export function polygonsIntersect(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  return !separatedAlongEdges(a, b) && !separatedAlongEdges(b, a);
}
