import type { Insets } from './commands.ts';

/**
 * Where a node sits inside its parent, when the parent is not a flex container.
 */
export interface Placement {
  /**
   * Point of the parent the node is attached to, `0` to `1` on each axis. Default `[0, 0]`
   * (top-left); `[0.5, 0.5]` is the centre and `[1, 1]` the bottom-right corner.
   */
  readonly anchor?: readonly [number, number];
  /**
   * Point of the node placed on the anchor, `0` to `1`. Default: the anchor itself, so a node
   * anchored at the right edge sits inside it.
   */
  readonly pivot?: readonly [number, number];
  /**
   * Offset from the anchor in pixels. Default `0`.
   */
  readonly x?: number;
  readonly y?: number;
  /**
   * Stretch to fill the parent on that axis (minus the margin) instead of using `width`/`height`.
   */
  readonly stretchX?: boolean;
  readonly stretchY?: boolean;
}

/**
 * Lays children out one after the other.
 */
export interface FlexLayout {
  readonly direction: 'row' | 'column';
  /**
   * Space between children. Default `0`.
   */
  readonly gap?: number;
  /**
   * Space between the container edge and its children. Default `0`.
   */
  readonly padding?: number | Insets;
  /**
   * Where children go on the main axis when none of them grows. Default `start`.
   */
  readonly justify?: 'start' | 'center' | 'end' | 'space-between';
  /**
   * Where children go on the cross axis. Default `start`.
   */
  readonly align?: 'start' | 'center' | 'end' | 'stretch';
}

/**
 * Turns a number or insets into insets.
 */
export function toInsets(value: number | Insets | undefined): Insets {
  if (value === undefined) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }
  if (typeof value === 'number') {
    return { left: value, top: value, right: value, bottom: value };
  }
  return value;
}
