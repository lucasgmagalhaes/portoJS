import { describe, expect, it } from 'vitest';
import { Label, Panel, Ui, UiNode } from '../src/index.ts';

function box(options: ConstructorParameters<typeof UiNode>[0]): UiNode {
  return new UiNode(options);
}

describe('anchored layout', () => {
  it('places a node by anchor, pivot and offset', () => {
    const ui = new Ui({ width: 200, height: 100 });
    const centre = box({ width: 40, height: 20, anchor: [0.5, 0.5] });
    const corner = box({ width: 10, height: 10, anchor: [1, 1] });
    const offset = box({ width: 10, height: 10, x: 5, y: 7 });
    ui.root.add(centre, corner, offset);
    ui.layout();
    expect(centre.rect).toEqual({ x: 80, y: 40, width: 40, height: 20 });
    expect(corner.rect).toEqual({ x: 190, y: 90, width: 10, height: 10 });
    expect(offset.rect).toEqual({ x: 5, y: 7, width: 10, height: 10 });
  });

  it('stretches over the parent minus the margin', () => {
    const ui = new Ui({ width: 200, height: 100 });
    const fill = box({ stretchX: true, stretchY: true, margin: 10, height: 0 });
    ui.root.add(fill);
    ui.layout();
    expect(fill.rect).toEqual({ x: 10, y: 10, width: 180, height: 80 });
  });

  it('follows a resize', () => {
    const ui = new Ui({ width: 200, height: 100 });
    const right = box({ width: 20, height: 20, anchor: [1, 0] });
    ui.root.add(right);
    ui.layout();
    expect(right.rect.x).toBe(180);
    ui.resize(400, 100);
    ui.layout();
    expect(right.rect.x).toBe(380);
  });
});

describe('flex layout', () => {
  function column(options: Record<string, unknown>, ...children: UiNode[]): { ui: Ui; panel: Panel } {
    const ui = new Ui({ width: 100, height: 200 });
    const panel = new Panel({
      stretchX: true,
      stretchY: true,
      layout: { direction: 'column', ...options },
    });
    panel.add(...children);
    ui.root.add(panel);
    ui.layout();
    return { ui, panel };
  }

  it('stacks children with gap and padding', () => {
    const a = box({ width: 30, height: 20 });
    const b = box({ width: 30, height: 20 });
    column({ gap: 5, padding: 10 }, a, b);
    expect(a.rect).toEqual({ x: 10, y: 10, width: 30, height: 20 });
    expect(b.rect).toEqual({ x: 10, y: 35, width: 30, height: 20 });
  });

  it('shares the free space between growing children', () => {
    const a = box({ width: 10, height: 20, grow: 1 });
    const b = box({ width: 10, height: 20, grow: 3 });
    column({}, a, b);
    expect(a.rect.height).toBe(20 + 160 / 4);
    expect(b.rect.height).toBe(20 + (160 * 3) / 4);
    expect(b.rect.y).toBe(a.rect.height);
  });

  it('justifies and aligns', () => {
    const a = box({ width: 20, height: 20 });
    const b = box({ width: 20, height: 20 });
    column({ justify: 'space-between', align: 'center' }, a, b);
    expect(a.rect.y).toBe(0);
    expect(b.rect.y).toBe(180);
    expect(a.rect.x).toBe(40);
    const c = box({ width: 20, height: 20 });
    column({ justify: 'center', align: 'end' }, c);
    expect(c.rect).toEqual({ x: 80, y: 90, width: 20, height: 20 });
  });

  it('stretches the cross axis', () => {
    const a = box({ height: 20 });
    column({ align: 'stretch' }, a);
    expect(a.rect.width).toBe(100);
  });

  it('lays out rows, skips hidden children and honours margins', () => {
    const ui = new Ui({ width: 100, height: 40 });
    const row = new Panel({ stretchX: true, stretchY: true, layout: { direction: 'row', gap: 4 } });
    const a = box({ width: 20, height: 20, margin: { left: 3, top: 0, right: 3, bottom: 0 } });
    const hidden = box({ width: 50, height: 20, visible: false });
    const b = box({ width: 20, height: 20 });
    row.add(a, hidden, b);
    ui.root.add(row);
    ui.layout();
    expect(a.rect.x).toBe(3);
    expect(b.rect.x).toBe(3 + 20 + 3 + 4);
  });

  it('sizes labels from the text measure', () => {
    const ui = new Ui({ width: 200, height: 100, measureText: (text) => text.length * 10 });
    const label = new Label({ text: 'abcd', size: 12 });
    const panel = new Panel({ layout: { direction: 'row' }, width: 100, height: 50 });
    panel.add(label);
    ui.root.add(panel);
    ui.layout();
    expect(label.rect.width).toBe(40);
    expect(label.rect.height).toBe(12);
  });
});
