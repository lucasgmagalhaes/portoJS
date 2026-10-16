import type { Insets } from './commands.ts';

/**
 * One piece of a nine-slice: where it goes and which part of the skin it shows.
 * Positions are relative to the top-left of the target; texture coordinates are `0` to `1`
 * within the skin.
 */
export interface Patch {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly u: number;
  readonly v: number;
  readonly uWidth: number;
  readonly vHeight: number;
}

/**
 * Splits a skin of `skinWidth` x `skinHeight` pixels into the patches that fill a
 * `width` x `height` target: corners keep their pixel size, edges stretch along one axis and the
 * centre along both. When the target is smaller than the insets, the insets shrink to fit.
 * Empty patches are left out.
 */
export function nineSlice(
  width: number,
  height: number,
  skinWidth: number,
  skinHeight: number,
  insets: Insets,
): Patch[] {
  const hScale = Math.min(1, width / Math.max(1, insets.left + insets.right));
  const vScale = Math.min(1, height / Math.max(1, insets.top + insets.bottom));
  const left = insets.left * hScale;
  const right = insets.right * hScale;
  const top = insets.top * vScale;
  const bottom = insets.bottom * vScale;
  const xs = [0, left, width - right, width];
  const ys = [0, top, height - bottom, height];
  const us = [0, insets.left, skinWidth - insets.right, skinWidth];
  const vs = [0, insets.top, skinHeight - insets.bottom, skinHeight];
  const patches: Patch[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x0 = xs[col] ?? 0;
      const x1 = xs[col + 1] ?? 0;
      const y0 = ys[row] ?? 0;
      const y1 = ys[row + 1] ?? 0;
      const u0 = us[col] ?? 0;
      const u1 = us[col + 1] ?? 0;
      const v0 = vs[row] ?? 0;
      const v1 = vs[row + 1] ?? 0;
      if (x1 - x0 <= 0 || y1 - y0 <= 0 || u1 - u0 <= 0 || v1 - v0 <= 0) {
        continue;
      }
      patches.push({
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
        u: u0 / skinWidth,
        v: v0 / skinHeight,
        uWidth: (u1 - u0) / skinWidth,
        vHeight: (v1 - v0) / skinHeight,
      });
    }
  }
  return patches;
}
