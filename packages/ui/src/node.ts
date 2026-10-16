import type { Insets, UiCommand, UiRect } from './commands.ts';
import { toInsets } from './layout.ts';
import type { FlexLayout, Placement } from './layout.ts';
import type { Theme } from './theme.ts';

/**
 * Options shared by every node.
 */
export interface NodeOptions extends Placement {
  readonly id?: string;
  /**
   * Fixed size in pixels. Without it a node uses its preferred size (text size for labels, `0`
   * otherwise), or the space left over when it grows.
   */
  readonly width?: number;
  readonly height?: number;
  /**
   * Share of the free main-axis space this node takes inside a flex container. Default `0`.
   */
  readonly grow?: number;
  /**
   * Space around the node. Default `0`.
   */
  readonly margin?: number | Insets;
  /**
   * Lays the node's children out as a flex container.
   */
  readonly layout?: FlexLayout;
  readonly visible?: boolean;
  readonly enabled?: boolean;
}

/**
 * A keyboard or gamepad intent the {@link Ui} understands.
 */
export type NavAction = 'up' | 'down' | 'left' | 'right' | 'next' | 'previous' | 'confirm' | 'cancel';

/**
 * What a node needs from the {@link Ui} that owns it.
 */
export interface UiContext {
  readonly theme: Theme;
  measureText(text: string, size: number): number;
}

/**
 * Something in the UI tree: it has a rectangle, children, and may react to the pointer.
 * Use the widgets ({@link Panel}, {@link Label}, {@link Button}...) or extend this for your own.
 */
export class UiNode {
  readonly id: string | undefined;
  readonly children: UiNode[] = [];
  parent: UiNode | undefined;
  /**
   * Where the node ended up after the last layout.
   */
  rect: UiRect = { x: 0, y: 0, width: 0, height: 0 };
  visible: boolean;
  enabled: boolean;
  options: NodeOptions;
  /**
   * Whether the node can take the pointer. Nodes that only group children leave it `false`.
   */
  interactive = false;
  /**
   * Whether keyboard navigation can focus the node.
   */
  focusable = false;
  /**
   * Whether the node cuts its children to its rectangle.
   */
  clips = false;
  /**
   * Set by the {@link Ui} while the pointer is over the node.
   */
  hovered = false;
  /**
   * Set by the {@link Ui} while a pointer is held down on the node.
   */
  pressed = false;
  /**
   * Set by the {@link Ui} while the node has keyboard focus.
   */
  focused = false;
  protected context: UiContext | undefined;

  constructor(options: NodeOptions = {}) {
    this.id = options.id;
    this.options = options;
    this.visible = options.visible ?? true;
    this.enabled = options.enabled ?? true;
  }

  /**
   * Theme of the {@link Ui} the node belongs to, once it has been laid out.
   */
  get theme(): Theme | undefined {
    return this.context?.theme;
  }

  /**
   * Adds children at the end.
   */
  add(...children: UiNode[]): this {
    for (const child of children) {
      child.parent?.remove(child);
      child.parent = this;
      this.children.push(child);
    }
    return this;
  }

  /**
   * Removes a child. Returns whether it was there.
   */
  remove(child: UiNode): boolean {
    const index = this.children.indexOf(child);
    if (index < 0) {
      return false;
    }
    this.children.splice(index, 1);
    child.parent = undefined;
    return true;
  }

  /**
   * Finds a descendant by id.
   */
  find(id: string): UiNode | undefined {
    for (const child of this.children) {
      if (child.id === id) {
        return child;
      }
      const found = child.find(id);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  /**
   * Whether the node and every ancestor are enabled.
   */
  get isEnabled(): boolean {
    return this.enabled && (this.parent?.isEnabled ?? true);
  }

  /**
   * Whether the node and every ancestor are visible.
   */
  get isVisible(): boolean {
    return this.visible && (this.parent?.isVisible ?? true);
  }

  /**
   * Size the node asks for when it has no fixed `width`/`height`. Override for content-sized widgets.
   */
  preferredSize(): { width: number; height: number } {
    return { width: 0, height: 0 };
  }

  /**
   * Whether a point is on the node.
   */
  contains(x: number, y: number): boolean {
    const r = this.rect;
    return x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;
  }

  /**
   * Appends this node's own drawing to `out`, before its children. Override in widgets.
   */
  paint(out: UiCommand[]): void {
    void out;
  }

  /**
   * Appends drawing that goes on top of the children. Override in widgets.
   */
  paintOver(out: UiCommand[]): void {
    void out;
  }

  /**
   * A pointer went down on the node. Position in UI pixels.
   */
  onPointerDown(x: number, y: number): void {
    void [x, y];
  }

  /**
   * The pointer that went down on the node moved (it keeps the pointer until released).
   */
  onPointerDrag(x: number, y: number, dx: number, dy: number): void {
    void [x, y, dx, dy];
  }

  /**
   * The pointer was released. `inside` tells whether it was still over the node.
   */
  onPointerUp(x: number, y: number, inside: boolean): void {
    void [x, y, inside];
  }

  /**
   * The wheel turned over the node. Return `true` to consume it.
   */
  onWheel(dx: number, dy: number): boolean {
    void [dx, dy];
    return false;
  }

  /**
   * A navigation key reached the focused node. Return `true` to consume it.
   */
  onNavigate(action: NavAction): boolean {
    void action;
    return false;
  }

  /**
   * Called before a layout pass so widgets can read the theme and measure text.
   */
  attach(context: UiContext): void {
    this.context = context;
    for (const child of this.children) {
      child.attach(context);
    }
  }

  /**
   * Computes this node's rectangle inside `area` (already reduced by the parent's padding and
   * margin for flex children), then lays out the children.
   */
  place(rect: UiRect): void {
    this.rect = rect;
    this.layoutChildren();
  }

  /**
   * Content area: the rectangle minus padding.
   */
  protected content(): UiRect {
    const pad = toInsets(this.options.layout?.padding);
    const r = this.rect;
    return {
      x: r.x + pad.left,
      y: r.y + pad.top,
      width: Math.max(0, r.width - pad.left - pad.right),
      height: Math.max(0, r.height - pad.top - pad.bottom),
    };
  }

  protected layoutChildren(): void {
    const flex = this.options.layout;
    const area = this.content();
    if (flex) {
      this.layoutFlex(flex, area);
      return;
    }
    for (const child of this.children) {
      child.place(placeAnchored(child, area));
    }
  }

  protected layoutFlex(flex: FlexLayout, area: UiRect): void {
    const row = flex.direction === 'row';
    const gap = flex.gap ?? 0;
    const items = this.children.filter(isShown);
    const mainSize = row ? area.width : area.height;
    const crossSize = row ? area.height : area.width;
    let fixed = 0;
    let growTotal = 0;
    const sizes: {
      child: UiNode;
      size: { width: number; height: number };
      margin: Insets;
      main: number;
      grow: number;
    }[] = [];
    for (const child of items) {
      const size = sizeOf(child);
      const margin = toInsets(child.options.margin);
      const mainMargin = row ? margin.left + margin.right : margin.top + margin.bottom;
      const main = (row ? size.width : size.height) + mainMargin;
      const grow = child.options.grow ?? 0;
      growTotal += grow;
      fixed += main;
      sizes.push({ child, size, margin, main, grow });
    }
    fixed += gap * Math.max(0, items.length - 1);
    const free = Math.max(0, mainSize - fixed);
    let cursor = row ? area.x : area.y;
    let spacing = gap;
    if (growTotal === 0) {
      if (flex.justify === 'center') {
        cursor += free / 2;
      } else if (flex.justify === 'end') {
        cursor += free;
      } else if (flex.justify === 'space-between' && items.length > 1) {
        spacing = gap + free / (items.length - 1);
      }
    }
    const align = flex.align ?? 'start';
    for (const item of sizes) {
      const extra = growTotal > 0 ? (free * item.grow) / growTotal : 0;
      const main = item.main + extra;
      const marginMainStart = row ? item.margin.left : item.margin.top;
      const marginMainEnd = row ? item.margin.right : item.margin.bottom;
      const marginCrossStart = row ? item.margin.top : item.margin.left;
      const marginCrossEnd = row ? item.margin.bottom : item.margin.right;
      const childMain = main - marginMainStart - marginMainEnd;
      const wantedCross = row ? item.size.height : item.size.width;
      const hasCross = row ? item.child.options.height !== undefined : item.child.options.width !== undefined;
      const available = crossSize - marginCrossStart - marginCrossEnd;
      const childCross = align === 'stretch' && !hasCross ? available : wantedCross;
      let crossOffset = marginCrossStart;
      if (align === 'center') {
        crossOffset = (crossSize - childCross) / 2;
      } else if (align === 'end') {
        crossOffset = crossSize - childCross - marginCrossEnd;
      }
      const mainStart = cursor + marginMainStart;
      const crossStart = (row ? area.y : area.x) + crossOffset;
      item.child.place(
        row
          ? { x: mainStart, y: crossStart, width: childMain, height: childCross }
          : { x: crossStart, y: mainStart, width: childCross, height: childMain },
      );
      cursor += main + spacing;
    }
    for (const child of this.children) {
      if (!child.visible) {
        child.place({ x: area.x, y: area.y, width: 0, height: 0 });
      }
    }
  }

  /**
   * Total size of the children inside a flex container, padding included. Scroll views use it
   * to know how far they can scroll.
   */
  contentSize(): { width: number; height: number } {
    const flex = this.options.layout;
    const pad = toInsets(flex?.padding);
    const items = this.children.filter(isShown);
    const gap = flex?.gap ?? 0;
    const row = flex?.direction === 'row';
    let main = gap * Math.max(0, items.length - 1);
    let cross = 0;
    for (const child of items) {
      const size = sizeOf(child);
      const margin = toInsets(child.options.margin);
      const w = size.width + margin.left + margin.right;
      const h = size.height + margin.top + margin.bottom;
      main += row ? w : h;
      cross = Math.max(cross, row ? h : w);
    }
    const width = (row ? main : cross) + pad.left + pad.right;
    const height = (row ? cross : main) + pad.top + pad.bottom;
    return { width, height };
  }
}

function isShown(node: UiNode): boolean {
  return node.visible;
}

/**
 * Fixed size or preferred size of a node.
 */
export function sizeOf(node: UiNode): { width: number; height: number } {
  const preferred = node.preferredSize();
  return {
    width: node.options.width ?? preferred.width,
    height: node.options.height ?? preferred.height,
  };
}

/**
 * Resolves a node's rectangle from its anchor, pivot, offset and margin inside `area`.
 */
export function placeAnchored(node: UiNode, area: UiRect): UiRect {
  const o = node.options;
  const margin = toInsets(o.margin);
  const size = sizeOf(node);
  const anchor = o.anchor ?? [0, 0];
  const pivot = o.pivot ?? anchor;
  const width = o.stretchX ? Math.max(0, area.width - margin.left - margin.right) : size.width;
  const height = o.stretchY ? Math.max(0, area.height - margin.top - margin.bottom) : size.height;
  const x = o.stretchX
    ? area.x + margin.left + (o.x ?? 0)
    : area.x + anchor[0] * area.width - pivot[0] * width + (o.x ?? 0);
  const y = o.stretchY
    ? area.y + margin.top + (o.y ?? 0)
    : area.y + anchor[1] * area.height - pivot[1] * height + (o.y ?? 0);
  return { x, y, width, height };
}
