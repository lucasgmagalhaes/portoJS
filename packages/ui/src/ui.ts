import { GameEvent } from '@portojs/runtime';
import type { UiCommand } from './commands.ts';
import { UiNode } from './node.ts';
import type { NavAction, UiContext } from './node.ts';
import { ScrollView } from './widgets.ts';
import { defaultTheme } from './theme.ts';
import type { Theme } from './theme.ts';

/**
 * Options of a {@link Ui}.
 */
export interface UiOptions {
  /**
   * Size of the area the UI fills, in pixels (usually the virtual resolution).
   */
  readonly width: number;
  readonly height: number;
  readonly theme?: Theme;
  /**
   * Width of a text in pixels, for labels and buttons that size themselves. Default: an estimate
   * of `0.55 * size` per character. Pass the measure of your font for exact results.
   */
  readonly measureText?: (text: string, size: number) => number;
  /**
   * Pixels a pointer must move over a button inside a scroll view before the view takes the
   * gesture and the press is cancelled. Default `8`.
   */
  readonly dragThreshold?: number;
}

interface Grab {
  node: UiNode;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  scroller: ScrollView | undefined;
}

class UiHost implements UiContext {
  constructor(
    private readonly owner: Ui,
    readonly measureText: (text: string, size: number) => number,
  ) {}

  get theme(): Theme {
    return this.owner.theme;
  }
}

function estimateWidth(text: string, size: number): number {
  return text.length * size * 0.55;
}

/**
 * The root of an in-canvas UI: owns the node tree, lays it out, routes the pointer and
 * keyboard, and produces the {@link UiCommand} list to draw.
 *
 * Feed it input each frame and draw `commands()` with your renderer (see `paintCommands`).
 *
 * @example
 * const ui = new Ui({ width: 640, height: 360 });
 * const play = new Button({ text: 'Play', width: 160, height: 40, anchor: [0.5, 0.5] });
 * play.click.addListener(startGame);
 * ui.root.add(play);
 * ui.pointerDown(1, x, y);
 * const commands = ui.commands();
 */
export class Ui {
  readonly root: UiNode;
  theme: Theme;
  /**
   * Fires when the cancel action (escape, back) reaches the UI with nothing to consume it.
   */
  readonly cancel = new GameEvent();
  private widthPx: number;
  private heightPx: number;
  private dirty = true;
  private hovered: UiNode | undefined;
  private focus: UiNode | undefined;
  private readonly grabs = new Map<number, Grab>();
  private readonly context: UiContext;
  private readonly threshold: number;

  constructor(options: UiOptions) {
    this.theme = options.theme ?? defaultTheme;
    this.widthPx = options.width;
    this.heightPx = options.height;
    this.threshold = options.dragThreshold ?? 8;
    const measure = options.measureText ?? estimateWidth;
    this.context = new UiHost(this, measure);
    this.root = new UiNode({ stretchX: true, stretchY: true });
  }

  get width(): number {
    return this.widthPx;
  }

  get height(): number {
    return this.heightPx;
  }

  /**
   * Resizes the UI area. Layout runs again before the next read.
   */
  resize(width: number, height: number): void {
    this.widthPx = width;
    this.heightPx = height;
    this.dirty = true;
  }

  /**
   * Marks the tree as changed; call after adding nodes or changing text or sizes.
   */
  invalidate(): void {
    this.dirty = true;
  }

  /**
   * Lays the tree out now. Reading `commands()` or routing input does it when needed.
   */
  layout(): void {
    this.root.attach(this.context);
    this.root.place({ x: 0, y: 0, width: this.widthPx, height: this.heightPx });
    this.dirty = false;
  }

  private ensureLayout(): void {
    if (this.dirty) {
      this.layout();
    }
  }

  /**
   * Deepest interactive node under a point, honouring clipping and disabled or hidden nodes.
   */
  hitTest(x: number, y: number): UiNode | undefined {
    this.ensureLayout();
    return hit(this.root, x, y);
  }

  /**
   * A pointer went down. Returns whether the UI took it (so the game should ignore it).
   */
  pointerDown(pointerId: number, x: number, y: number): boolean {
    const node = this.hitTest(x, y);
    if (!node) {
      return false;
    }
    this.hover(node);
    node.pressed = true;
    this.grabs.set(pointerId, {
      node,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      scroller: node instanceof ScrollView ? node : undefined,
    });
    if (node.focusable && node.isEnabled) {
      this.setFocus(node);
    }
    if (node.isEnabled) {
      node.onPointerDown(x, y);
    }
    return true;
  }

  /**
   * A pointer moved (held or not). Returns whether the UI has it.
   */
  pointerMove(pointerId: number, x: number, y: number): boolean {
    const grab = this.grabs.get(pointerId);
    if (!grab) {
      const over = this.hitTest(x, y);
      this.hover(over);
      return over !== undefined;
    }
    const dx = x - grab.lastX;
    const dy = y - grab.lastY;
    grab.lastX = x;
    grab.lastY = y;
    if (!grab.scroller) {
      const scroller = ancestorScroller(grab.node);
      const moved = Math.hypot(x - grab.startX, y - grab.startY);
      if (scroller && moved > this.threshold && grab.node !== scroller) {
        grab.node.pressed = false;
        grab.node = scroller;
        grab.scroller = scroller;
        scroller.pressed = true;
        grab.lastX = x;
        grab.lastY = y;
        return true;
      }
    }
    this.hover(this.hitTest(x, y));
    if (grab.node.isEnabled) {
      grab.node.onPointerDrag(x, y, dx, dy);
    }
    return true;
  }

  /**
   * A pointer was released. Returns whether it ended a press the UI had taken.
   */
  pointerUp(pointerId: number, x: number, y: number): boolean {
    const grab = this.grabs.get(pointerId);
    if (!grab) {
      return false;
    }
    this.grabs.delete(pointerId);
    grab.node.pressed = false;
    const inside = this.hitTest(x, y) === grab.node && !grab.scroller;
    grab.node.onPointerUp(x, y, inside);
    return true;
  }

  /**
   * A pointer was cancelled (lost, or the page hid): releases without a click.
   */
  pointerCancel(pointerId: number): void {
    const grab = this.grabs.get(pointerId);
    if (grab) {
      this.grabs.delete(pointerId);
      grab.node.pressed = false;
    }
  }

  /**
   * The wheel turned at a point. Returns whether a scroll view used it.
   */
  wheel(x: number, y: number, dx: number, dy: number): boolean {
    let node = this.hitTest(x, y);
    while (node) {
      if (node.onWheel(dx, dy)) {
        return true;
      }
      node = node.parent;
    }
    return false;
  }

  /**
   * The focused node, if any.
   */
  get focused(): UiNode | undefined {
    return this.focus;
  }

  /**
   * Moves keyboard focus to a node (or clears it).
   */
  setFocus(node: UiNode | undefined): void {
    if (this.focus === node) {
      return;
    }
    if (this.focus) {
      this.focus.focused = false;
    }
    this.focus = node;
    if (node) {
      node.focused = true;
      const scroller = ancestorScroller(node);
      scroller?.reveal(node);
    }
  }

  /**
   * Routes a keyboard or gamepad action. Returns whether the UI used it.
   * `next`/`previous` cycle through focusable nodes in tree order, the arrows jump to the nearest
   * one in that direction, `confirm` activates the focused node.
   */
  navigate(action: NavAction): boolean {
    this.ensureLayout();
    const current = this.focus;
    if (current?.isVisible && current.isEnabled && current.onNavigate(action)) {
      return true;
    }
    if (action === 'cancel') {
      if (this.cancel.listenerCount === 0) {
        return false;
      }
      this.cancel.invoke();
      return true;
    }
    if (action === 'confirm') {
      return false;
    }
    const candidates = focusables(this.root);
    if (candidates.length === 0) {
      return false;
    }
    if (!current || !candidates.includes(current)) {
      this.setFocus(candidates[0]);
      return true;
    }
    if (action === 'next' || action === 'previous') {
      const step = action === 'next' ? 1 : -1;
      const index = candidates.indexOf(current);
      this.setFocus(candidates[(index + step + candidates.length) % candidates.length]);
      return true;
    }
    const target = nearestInDirection(current, candidates, action);
    if (!target) {
      return false;
    }
    this.setFocus(target);
    return true;
  }

  private hover(node: UiNode | undefined): void {
    if (this.hovered === node) {
      return;
    }
    if (this.hovered) {
      this.hovered.hovered = false;
    }
    this.hovered = node;
    if (node) {
      node.hovered = true;
    }
  }

  /**
   * The drawing instructions for the whole tree, in paint order.
   */
  commands(): UiCommand[] {
    this.ensureLayout();
    const out: UiCommand[] = [];
    paintNode(this.root, out);
    return out;
  }
}

function paintNode(node: UiNode, out: UiCommand[]): void {
  if (!node.visible) {
    return;
  }
  node.paint(out);
  if (node.clips) {
    const { x, y, width, height } = node.rect;
    out.push({ type: 'pushClip', x, y, width, height });
  }
  for (const child of node.children) {
    paintNode(child, out);
  }
  if (node.clips) {
    out.push({ type: 'popClip' });
  }
  node.paintOver(out);
}

function hit(node: UiNode, x: number, y: number): UiNode | undefined {
  if (!node.visible) {
    return undefined;
  }
  if (node.clips && !node.contains(x, y)) {
    return undefined;
  }
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i];
    const found = child ? hit(child, x, y) : undefined;
    if (found) {
      return found;
    }
  }
  return node.interactive && node.contains(x, y) ? node : undefined;
}

function ancestorScroller(node: UiNode): ScrollView | undefined {
  let current = node.parent;
  while (current) {
    if (current instanceof ScrollView) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

function focusables(node: UiNode, out: UiNode[] = []): UiNode[] {
  if (!node.visible) {
    return out;
  }
  if (node.focusable && node.isEnabled) {
    out.push(node);
  }
  for (const child of node.children) {
    focusables(child, out);
  }
  return out;
}

function nearestInDirection(
  from: UiNode,
  candidates: readonly UiNode[],
  action: 'up' | 'down' | 'left' | 'right',
): UiNode | undefined {
  const cx = from.rect.x + from.rect.width / 2;
  const cy = from.rect.y + from.rect.height / 2;
  let best: UiNode | undefined;
  let bestScore = Infinity;
  for (const node of candidates) {
    if (node === from) {
      continue;
    }
    const dx = node.rect.x + node.rect.width / 2 - cx;
    const dy = node.rect.y + node.rect.height / 2 - cy;
    const along = action === 'right' ? dx : action === 'left' ? -dx : action === 'down' ? dy : -dy;
    if (along <= 0) {
      continue;
    }
    const across = action === 'left' || action === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = node;
    }
  }
  return best;
}
