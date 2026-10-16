import type { Insets } from './commands.ts';

/**
 * How a widget looks in one interaction state.
 */
export interface StateStyle {
  /**
   * Fill colour, `0xRRGGBBAA`.
   */
  readonly background: number;
  /**
   * Text colour, `0xRRGGBBAA`.
   */
  readonly text: number;
  /**
   * Skin drawn instead of the flat fill. Resolved by the painter.
   */
  readonly skin?: string;
}

/**
 * Colours and skins shared by every widget of a {@link Ui}.
 */
export interface Theme {
  readonly fontSize: number;
  readonly text: number;
  readonly panel: StateStyle & { readonly insets?: Insets };
  readonly button: {
    readonly normal: StateStyle;
    readonly hover: StateStyle;
    readonly pressed: StateStyle;
    readonly disabled: StateStyle;
    readonly insets?: Insets;
  };
  /**
   * Colour of the ring drawn around the focused widget. `0` disables it.
   */
  readonly focus: number;
  readonly track: number;
  readonly fill: number;
  readonly knob: number;
}

/**
 * A neutral dark theme. Spread it and override what you need.
 */
export const defaultTheme: Theme = {
  fontSize: 16,
  text: 0xffffffff,
  panel: { background: 0x1f2430ee, text: 0xffffffff },
  button: {
    normal: { background: 0x3a4256ff, text: 0xffffffff },
    hover: { background: 0x4a5470ff, text: 0xffffffff },
    pressed: { background: 0x2a3144ff, text: 0xffffffff },
    disabled: { background: 0x2a2d36ff, text: 0x888b94ff },
  },
  focus: 0xffd800ff,
  track: 0x14171eff,
  fill: 0x4cc36bff,
  knob: 0xf2f2f2ff,
};
