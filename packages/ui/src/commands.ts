/**
 * An axis-aligned rectangle in UI pixels.
 */
export interface UiRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Distances from each edge of a rectangle.
 */
export interface Insets {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * Horizontal text alignment.
 */
export type TextAlign = 'left' | 'center' | 'right';

/**
 * Fills a rectangle with a colour.
 */
export interface RectCommand {
  readonly type: 'rect';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /**
   * `0xRRGGBBAA`.
   */
  readonly color: number;
}

/**
 * Draws a skin (a texture region the painter knows by name) stretched over a rectangle. When
 * `insets` is set the skin is a nine-slice: the corners keep their size and the edges stretch.
 */
export interface SkinCommand {
  readonly type: 'skin';
  readonly skin: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly insets?: Insets;
  readonly color: number;
}

/**
 * Draws one line of text inside a box.
 */
export interface TextCommand {
  readonly type: 'text';
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly color: number;
  readonly align: TextAlign;
}

/**
 * Starts clipping: everything until the matching `popClip` is cut to the rectangle.
 */
export interface PushClipCommand {
  readonly type: 'pushClip';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Ends the innermost clip.
 */
export interface PopClipCommand {
  readonly type: 'popClip';
}

/**
 * One drawing instruction produced by {@link Ui.draw}, in paint order.
 */
export type UiCommand = RectCommand | SkinCommand | TextCommand | PushClipCommand | PopClipCommand;
