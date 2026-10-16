/**
 * Vectors, rectangles, matrices, geometry helpers and a seeded random number generator.
 *
 * @module @portojs/math
 */

export { Vec2 } from './vec2.ts';
export { Vec3 } from './vec3.ts';
export { Rect } from './rect.ts';
export { Mat3 } from './mat3.ts';
export { Rng } from './rng.ts';
export type { RngState } from './rng.ts';
export {
  circleIntersectsCircle,
  circleIntersectsRect,
  pointInCircle,
  pointInPolygon,
  polygonsIntersect,
  segmentsIntersect,
} from './geometry.ts';
export type { Circle } from './geometry.ts';
export { clamp, inverseLerp, lerp, remap, wrap } from './scalar.ts';
export { Color } from './color.ts';
