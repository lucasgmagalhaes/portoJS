/**
 * In-canvas UI: anchor and flex layout, buttons, panels, progress bars, sliders, scroll views
 * and keyboard focus, drawn through a backend-agnostic command list.
 *
 * @module @portojs/ui
 */

export { Ui, navActionFromKey } from './ui.ts';
export type { UiOptions } from './ui.ts';
export { UiNode, placeAnchored, sizeOf } from './node.ts';
export type { NavAction, NodeOptions, UiContext } from './node.ts';
export { toInsets } from './layout.ts';
export type { FlexLayout, Placement } from './layout.ts';
export {
  Button,
  Label,
  Panel,
  ProgressBar,
  ScrollView,
  Slider,
  Toggle,
} from './widgets.ts';
export type {
  ButtonOptions,
  LabelOptions,
  ProgressBarOptions,
  ScrollViewOptions,
  SliderOptions,
} from './widgets.ts';
export { defaultTheme } from './theme.ts';
export type { StateStyle, Theme } from './theme.ts';
export type {
  Insets,
  PopClipCommand,
  PushClipCommand,
  RectCommand,
  SkinCommand,
  TextAlign,
  TextCommand,
  UiCommand,
  UiRect,
} from './commands.ts';
export { nineSlice } from './nine-slice.ts';
export type { Patch } from './nine-slice.ts';
export { paintCommands } from './paint.ts';
export type { PaintSkin, PaintTarget } from './paint.ts';
