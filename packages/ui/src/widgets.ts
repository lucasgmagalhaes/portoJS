import { GameEvent } from '@portojs/runtime';
import type { Insets, TextAlign, UiCommand } from './commands.ts';
import { UiNode } from './node.ts';
import type { NavAction, NodeOptions } from './node.ts';
import { toInsets } from './layout.ts';
import type { StateStyle } from './theme.ts';

function fillCommands(
  out: UiCommand[],
  node: UiNode,
  style: StateStyle,
  insets: Insets | undefined,
): void {
  const { x, y, width, height } = node.rect;
  if (style.skin !== undefined) {
    const skin = { type: 'skin' as const, skin: style.skin, x, y, width, height, color: 0xffffffff };
    out.push(insets ? { ...skin, insets } : skin);
  } else if ((style.background & 0xff) !== 0) {
    out.push({ type: 'rect', x, y, width, height, color: style.background });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * A background that groups children, usually with a flex `layout`.
 */
export class Panel extends UiNode {
  /**
   * Overrides the theme's panel style.
   */
  style: StateStyle | undefined;

  constructor(options: NodeOptions & { readonly style?: StateStyle } = {}) {
    super(options);
    this.style = options.style;
  }

  override paint(out: UiCommand[]): void {
    const style = this.style ?? this.context?.theme.panel;
    if (style) {
      fillCommands(out, this, style, this.context?.theme.panel.insets);
    }
  }
}

/**
 * Options of a {@link Label}.
 */
export interface LabelOptions extends NodeOptions {
  readonly text?: string;
  readonly size?: number;
  readonly color?: number;
  readonly align?: TextAlign;
}

/**
 * One line of text.
 */
export class Label extends UiNode {
  text: string;
  size: number | undefined;
  color: number | undefined;
  align: TextAlign;

  constructor(options: LabelOptions = {}) {
    super(options);
    this.text = options.text ?? '';
    this.size = options.size;
    this.color = options.color;
    this.align = options.align ?? 'left';
  }

  override preferredSize(): { width: number; height: number } {
    const size = this.size ?? this.context?.theme.fontSize ?? 16;
    return { width: this.context?.measureText(this.text, size) ?? 0, height: size };
  }

  override paint(out: UiCommand[]): void {
    const theme = this.context?.theme;
    const { x, y, width, height } = this.rect;
    out.push({
      type: 'text',
      text: this.text,
      x,
      y,
      width,
      height,
      size: this.size ?? theme?.fontSize ?? 16,
      color: this.color ?? theme?.text ?? 0xffffffff,
      align: this.align,
    });
  }
}

/**
 * Options of a {@link Button}.
 */
export interface ButtonOptions extends NodeOptions {
  readonly text?: string;
  readonly size?: number;
}

/**
 * A pressable button with normal, hover, pressed, disabled and focus looks.
 */
export class Button extends UiNode {
  text: string;
  size: number | undefined;
  /**
   * Fires when the pointer is released over the button, or when it is confirmed from the keyboard.
   */
  readonly click = new GameEvent();

  constructor(options: ButtonOptions = {}) {
    super(options);
    this.text = options.text ?? '';
    this.size = options.size;
    this.interactive = true;
    this.focusable = true;
  }

  override preferredSize(): { width: number; height: number } {
    const size = this.size ?? this.context?.theme.fontSize ?? 16;
    return {
      width: (this.context?.measureText(this.text, size) ?? 0) + size * 2,
      height: size * 2,
    };
  }

  override paint(out: UiCommand[]): void {
    const theme = this.context?.theme;
    if (!theme) {
      return;
    }
    let style = theme.button.normal;
    if (!this.isEnabled) {
      style = theme.button.disabled;
    } else if (this.pressed) {
      style = theme.button.pressed;
    } else if (this.hovered) {
      style = theme.button.hover;
    }
    fillCommands(out, this, style, theme.button.insets);
    const { x, y, width, height } = this.rect;
    out.push({
      type: 'text',
      text: this.text,
      x,
      y,
      width,
      height,
      size: this.size ?? theme.fontSize,
      color: style.text,
      align: 'center',
    });
  }

  override paintOver(out: UiCommand[]): void {
    paintFocus(out, this);
  }

  override onPointerUp(_x: number, _y: number, inside: boolean): void {
    if (inside && this.isEnabled) {
      this.click.invoke();
    }
  }

  override onNavigate(action: NavAction): boolean {
    if (action === 'confirm' && this.isEnabled) {
      this.click.invoke();
      return true;
    }
    return false;
  }
}

function paintFocus(out: UiCommand[], node: UiNode): void {
  const color = node.theme?.focus ?? 0;
  if (!node.focused || (color & 0xff) === 0) {
    return;
  }
  const { x, y, width, height } = node.rect;
  const t = 2;
  out.push({ type: 'rect', x: x - t, y: y - t, width: width + t * 2, height: t, color });
  out.push({ type: 'rect', x: x - t, y: y + height, width: width + t * 2, height: t, color });
  out.push({ type: 'rect', x: x - t, y, width: t, height, color });
  out.push({ type: 'rect', x: x + width, y, width: t, height, color });
}

/**
 * A button that stays on or off.
 */
export class Toggle extends Button {
  value: boolean;
  readonly changed = new GameEvent<boolean>();

  constructor(options: ButtonOptions & { readonly value?: boolean } = {}) {
    super(options);
    this.value = options.value ?? false;
    this.click.addListener(this.flip);
  }

  private readonly flip = (): void => {
    this.value = !this.value;
    this.changed.invoke(this.value);
  };

  override paint(out: UiCommand[]): void {
    super.paint(out);
    const theme = this.context?.theme;
    if (theme && this.value) {
      const { x, y, width, height } = this.rect;
      const s = Math.min(width, height) * 0.3;
      out.push({ type: 'rect', x: x + 6, y: y + (height - s) / 2, width: s, height: s, color: theme.fill });
    }
  }
}

/**
 * Options of a {@link ProgressBar}.
 */
export interface ProgressBarOptions extends NodeOptions {
  /**
   * Fill amount, `0` to `1`. Default `0`.
   */
  readonly value?: number;
  /**
   * Direction the bar fills towards. Default `right`.
   */
  readonly direction?: 'right' | 'left' | 'up' | 'down';
}

/**
 * A bar that fills with a value from `0` to `1`.
 */
export class ProgressBar extends UiNode {
  private amount: number;
  direction: 'right' | 'left' | 'up' | 'down';

  constructor(options: ProgressBarOptions = {}) {
    super(options);
    this.amount = clamp(options.value ?? 0, 0, 1);
    this.direction = options.direction ?? 'right';
  }

  get value(): number {
    return this.amount;
  }

  set value(value: number) {
    this.amount = clamp(value, 0, 1);
  }

  override preferredSize(): { width: number; height: number } {
    return { width: 0, height: this.context?.theme.fontSize ?? 16 };
  }

  override paint(out: UiCommand[]): void {
    const theme = this.context?.theme;
    if (!theme) {
      return;
    }
    const { x, y, width, height } = this.rect;
    out.push({ type: 'rect', x, y, width, height, color: theme.track });
    const w = width * this.amount;
    const h = height * this.amount;
    if (this.amount <= 0) {
      return;
    }
    const fill = { type: 'rect' as const, color: theme.fill };
    if (this.direction === 'right') {
      out.push({ ...fill, x, y, width: w, height });
    } else if (this.direction === 'left') {
      out.push({ ...fill, x: x + width - w, y, width: w, height });
    } else if (this.direction === 'up') {
      out.push({ ...fill, x, y: y + height - h, width, height: h });
    } else {
      out.push({ ...fill, x, y, width, height: h });
    }
  }
}

/**
 * Options of a {@link Slider}.
 */
export interface SliderOptions extends NodeOptions {
  readonly min?: number;
  readonly max?: number;
  readonly value?: number;
  /**
   * Snap to multiples of this from `min`. Default: continuous.
   */
  readonly step?: number;
}

/**
 * Pick a number by dragging a knob, or with left/right from the keyboard.
 */
export class Slider extends UiNode {
  readonly min: number;
  readonly max: number;
  readonly step: number | undefined;
  readonly changed = new GameEvent<number>();
  private current: number;

  constructor(options: SliderOptions = {}) {
    super(options);
    this.min = options.min ?? 0;
    this.max = options.max ?? 1;
    this.step = options.step;
    this.current = this.snap(options.value ?? this.min);
    this.interactive = true;
    this.focusable = true;
  }

  get value(): number {
    return this.current;
  }

  set value(value: number) {
    const next = this.snap(value);
    if (next !== this.current) {
      this.current = next;
      this.changed.invoke(next);
    }
  }

  override preferredSize(): { width: number; height: number } {
    return { width: 0, height: (this.context?.theme.fontSize ?? 16) * 1.5 };
  }

  private snap(value: number): number {
    let v = clamp(value, this.min, this.max);
    if (this.step !== undefined && this.step > 0) {
      v = this.min + Math.round((v - this.min) / this.step) * this.step;
      v = clamp(v, this.min, this.max);
    }
    return v;
  }

  private fromX(x: number): number {
    const { x: left, width } = this.rect;
    const t = width > 0 ? clamp((x - left) / width, 0, 1) : 0;
    return this.min + t * (this.max - this.min);
  }

  override onPointerDown(x: number): void {
    if (this.isEnabled) {
      this.value = this.fromX(x);
    }
  }

  override onPointerDrag(x: number): void {
    if (this.isEnabled) {
      this.value = this.fromX(x);
    }
  }

  override onNavigate(action: NavAction): boolean {
    const step = this.step ?? (this.max - this.min) / 20;
    if (action === 'left') {
      this.value = this.current - step;
      return true;
    }
    if (action === 'right') {
      this.value = this.current + step;
      return true;
    }
    return false;
  }

  override paint(out: UiCommand[]): void {
    const theme = this.context?.theme;
    if (!theme) {
      return;
    }
    const { x, y, width, height } = this.rect;
    const range = this.max - this.min;
    const t = range > 0 ? (this.current - this.min) / range : 0;
    const trackH = Math.max(2, height * 0.3);
    const trackY = y + (height - trackH) / 2;
    out.push({ type: 'rect', x, y: trackY, width, height: trackH, color: theme.track });
    out.push({ type: 'rect', x, y: trackY, width: width * t, height: trackH, color: theme.fill });
    const knob = height;
    out.push({ type: 'rect', x: x + width * t - knob / 2, y, width: knob, height: knob, color: theme.knob });
  }

  override paintOver(out: UiCommand[]): void {
    paintFocus(out, this);
  }
}

/**
 * Options of a {@link ScrollView}.
 */
export interface ScrollViewOptions extends NodeOptions {
  /**
   * Pixels scrolled per wheel notch. Default `40`.
   */
  readonly wheelStep?: number;
}

/**
 * A window onto content bigger than itself. Children are laid out by the view's `layout`
 * (a column by default) and the view scrolls along that direction, by wheel or by dragging.
 */
export class ScrollView extends UiNode {
  private offset = 0;
  readonly wheelStep: number;
  readonly scrolled = new GameEvent<number>();

  constructor(options: ScrollViewOptions = {}) {
    super({ ...options, layout: options.layout ?? { direction: 'column' } });
    this.wheelStep = options.wheelStep ?? 40;
    this.interactive = true;
    this.clips = true;
  }

  private get horizontal(): boolean {
    return this.options.layout?.direction === 'row';
  }

  /**
   * Furthest scroll position, `0` when the content fits.
   */
  get maxScroll(): number {
    const content = this.contentSize();
    return Math.max(
      0,
      this.horizontal ? content.width - this.rect.width : content.height - this.rect.height,
    );
  }

  /**
   * Current scroll position in pixels.
   */
  get scroll(): number {
    return this.offset;
  }

  set scroll(value: number) {
    const next = clamp(value, 0, this.maxScroll);
    if (next !== this.offset) {
      this.offset = next;
      this.layoutChildren();
      this.scrolled.invoke(next);
    }
  }

  override place(rect: Parameters<UiNode['place']>[0]): void {
    this.rect = rect;
    this.offset = clamp(this.offset, 0, this.maxScroll);
    this.layoutChildren();
  }

  protected override layoutChildren(): void {
    const flex = this.options.layout;
    if (!flex) {
      return;
    }
    const area = this.content();
    const content = this.contentSize();
    const pad = toInsets(flex.padding);
    const shifted = this.horizontal
      ? {
          x: area.x - this.offset,
          y: area.y,
          width: Math.max(area.width, content.width - pad.left - pad.right),
          height: area.height,
        }
      : {
          x: area.x,
          y: area.y - this.offset,
          width: area.width,
          height: Math.max(area.height, content.height - pad.top - pad.bottom),
        };
    this.layoutFlex(flex, shifted);
  }

  /**
   * Scrolls the least amount needed to bring a descendant fully into view.
   */
  reveal(node: UiNode): void {
    const r = node.rect;
    const v = this.rect;
    if (this.horizontal) {
      if (r.x < v.x) {
        this.scroll = this.offset - (v.x - r.x);
      } else if (r.x + r.width > v.x + v.width) {
        this.scroll = this.offset + (r.x + r.width - v.x - v.width);
      }
    } else if (r.y < v.y) {
      this.scroll = this.offset - (v.y - r.y);
    } else if (r.y + r.height > v.y + v.height) {
      this.scroll = this.offset + (r.y + r.height - v.y - v.height);
    }
  }

  override onPointerDrag(_x: number, _y: number, dx: number, dy: number): void {
    this.scroll = this.offset - (this.horizontal ? dx : dy);
  }

  override onWheel(dx: number, dy: number): boolean {
    const delta = this.horizontal ? dx || dy : dy;
    if (delta === 0 || this.maxScroll === 0) {
      return false;
    }
    this.scroll = this.offset + Math.sign(delta) * this.wheelStep;
    return true;
  }
}
