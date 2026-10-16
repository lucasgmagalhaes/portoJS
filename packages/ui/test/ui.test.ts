import { describe, expect, it, vi } from 'vitest';
import { Button, Label, Panel, ProgressBar, ScrollView, Slider, Toggle, Ui } from '../src/index.ts';

function setup(): { ui: Ui; a: Button; b: Button; c: Button } {
  const ui = new Ui({ width: 200, height: 200 });
  const panel = new Panel({
    stretchX: true,
    stretchY: true,
    layout: { direction: 'column', gap: 10 },
  });
  const a = new Button({ text: 'a', width: 100, height: 30 });
  const b = new Button({ text: 'b', width: 100, height: 30 });
  const c = new Button({ text: 'c', width: 100, height: 30, enabled: false });
  panel.add(a, b, c);
  ui.root.add(panel);
  ui.layout();
  return { ui, a, b, c };
}

describe('buttons and pointer', () => {
  it('clicks when released over the button', () => {
    const { ui, a } = setup();
    const click = vi.fn();
    a.click.addListener(click);
    expect(ui.pointerDown(1, 10, 10)).toBe(true);
    expect(a.pressed).toBe(true);
    ui.pointerUp(1, 10, 10);
    expect(click).toHaveBeenCalledTimes(1);
    expect(a.pressed).toBe(false);
  });

  it('does not click when released elsewhere or when cancelled', () => {
    const { ui, a } = setup();
    const click = vi.fn();
    a.click.addListener(click);
    ui.pointerDown(1, 10, 10);
    ui.pointerUp(1, 150, 150);
    ui.pointerDown(2, 10, 10);
    ui.pointerCancel(2);
    expect(click).not.toHaveBeenCalled();
  });

  it('ignores disabled buttons and misses', () => {
    const { ui, c } = setup();
    const click = vi.fn();
    c.click.addListener(click);
    ui.pointerDown(1, 10, 90);
    ui.pointerUp(1, 10, 90);
    expect(click).not.toHaveBeenCalled();
    expect(ui.pointerDown(2, 190, 190)).toBe(false);
  });

  it('tracks hover and chooses looks from the state', () => {
    const { ui, a } = setup();
    const colour = (): number => {
      const command = ui.commands().find((cmd) => cmd.type === 'rect' && cmd.width === 100 && cmd.height === 30);
      return command?.type === 'rect' ? command.color : 0;
    };
    const theme = ui.theme.button;
    expect(colour()).toBe(theme.normal.background);
    ui.pointerMove(1, 10, 10);
    expect(a.hovered).toBe(true);
    expect(colour()).toBe(theme.hover.background);
    ui.pointerDown(1, 10, 10);
    expect(colour()).toBe(theme.pressed.background);
    ui.pointerUp(1, 10, 10);
    ui.pointerMove(1, 190, 190);
    expect(a.hovered).toBe(false);
  });

  it('toggles', () => {
    const ui = new Ui({ width: 100, height: 100 });
    const toggle = new Toggle({ width: 40, height: 20 });
    ui.root.add(toggle);
    const changed = vi.fn();
    toggle.changed.addListener(changed);
    ui.pointerDown(1, 5, 5);
    ui.pointerUp(1, 5, 5);
    expect(toggle.value).toBe(true);
    expect(changed).toHaveBeenCalledWith(true);
  });
});

describe('keyboard focus', () => {
  it('cycles through enabled focusable nodes and confirms', () => {
    const { ui, a, b } = setup();
    const click = vi.fn();
    b.click.addListener(click);
    ui.navigate('next');
    expect(ui.focused).toBe(a);
    ui.navigate('next');
    expect(ui.focused).toBe(b);
    ui.navigate('next');
    expect(ui.focused).toBe(a);
    ui.navigate('previous');
    expect(ui.focused).toBe(b);
    expect(ui.navigate('confirm')).toBe(true);
    expect(click).toHaveBeenCalled();
  });

  it('moves with the arrows to the nearest node', () => {
    const ui = new Ui({ width: 300, height: 300 });
    const left = new Button({ width: 50, height: 50, x: 0, y: 100 });
    const right = new Button({ width: 50, height: 50, x: 200, y: 100 });
    const top = new Button({ width: 50, height: 50, x: 100, y: 0 });
    ui.root.add(left, right, top);
    ui.setFocus(left);
    ui.navigate('right');
    expect(ui.focused).toBe(right);
    ui.navigate('up');
    expect(ui.focused).toBe(top);
    expect(ui.navigate('up')).toBe(false);
    expect(ui.focused).toBe(top);
  });

  it('reports cancel only when someone listens', () => {
    const { ui } = setup();
    expect(ui.navigate('cancel')).toBe(false);
    const cancel = vi.fn();
    ui.cancel.addListener(cancel);
    expect(ui.navigate('cancel')).toBe(true);
    expect(cancel).toHaveBeenCalled();
  });

  it('draws a focus ring on the focused node', () => {
    const { ui, a } = setup();
    const before = ui.commands().length;
    ui.setFocus(a);
    expect(ui.commands().length).toBe(before + 4);
  });
});

describe('slider and progress bar', () => {
  it('slider follows the pointer, snaps and clamps', () => {
    const ui = new Ui({ width: 200, height: 50 });
    const slider = new Slider({ width: 100, height: 20, min: 0, max: 10, step: 1 });
    ui.root.add(slider);
    const changed = vi.fn();
    slider.changed.addListener(changed);
    ui.pointerDown(1, 52, 5);
    expect(slider.value).toBe(5);
    ui.pointerMove(1, 500, 5);
    expect(slider.value).toBe(10);
    ui.pointerMove(1, -50, 5);
    expect(slider.value).toBe(0);
    ui.pointerUp(1, -50, 5);
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('slider uses left and right from the keyboard', () => {
    const ui = new Ui({ width: 200, height: 50 });
    const slider = new Slider({ width: 100, height: 20, min: 0, max: 10, step: 2, value: 4 });
    ui.root.add(slider);
    ui.setFocus(slider);
    ui.navigate('right');
    expect(slider.value).toBe(6);
    ui.navigate('left');
    ui.navigate('left');
    expect(slider.value).toBe(2);
  });

  it('progress bar clamps and fills in the chosen direction', () => {
    const ui = new Ui({ width: 100, height: 100 });
    const bar = new ProgressBar({ width: 100, height: 10, value: 2 });
    ui.root.add(bar);
    expect(bar.value).toBe(1);
    bar.value = 0.25;
    const fill = ui.commands()[1];
    expect(fill).toMatchObject({ type: 'rect', x: 0, width: 25 });
    bar.direction = 'left';
    expect(ui.commands()[1]).toMatchObject({ x: 75, width: 25 });
  });
});

describe('scroll view', () => {
  function list(): { ui: Ui; view: ScrollView; items: Button[] } {
    const ui = new Ui({ width: 100, height: 100 });
    const view = new ScrollView({ width: 100, height: 100, layout: { direction: 'column', gap: 0 } });
    const items = Array.from({ length: 10 }, (_, i) => new Button({ text: `${i}`, width: 100, height: 40 }));
    view.add(...items);
    ui.root.add(view);
    ui.layout();
    return { ui, view, items };
  }

  it('limits scrolling to the content', () => {
    const { view } = list();
    expect(view.maxScroll).toBe(300);
    view.scroll = 1000;
    expect(view.scroll).toBe(300);
    view.scroll = -5;
    expect(view.scroll).toBe(0);
  });

  it('moves children with the wheel', () => {
    const { ui, view, items } = list();
    expect(ui.wheel(10, 10, 0, 1)).toBe(true);
    expect(view.scroll).toBe(40);
    expect(items[0]?.rect.y).toBe(-40);
  });

  it('ignores hits outside the viewport and clips the drawing', () => {
    const { ui, view } = list();
    view.scroll = 0;
    expect(ui.hitTest(10, 150)).toBeUndefined();
    const commands = ui.commands();
    expect(commands.filter((c) => c.type === 'pushClip')).toHaveLength(1);
    expect(commands.filter((c) => c.type === 'popClip')).toHaveLength(1);
  });

  it('scrolls by dragging and cancels the press on a child', () => {
    const { ui, view, items } = list();
    const click = vi.fn();
    items[0]?.click.addListener(click);
    ui.pointerDown(1, 50, 20);
    ui.pointerMove(1, 50, 5);
    ui.pointerMove(1, 50, -10);
    ui.pointerUp(1, 50, -10);
    expect(view.scroll).toBe(15);
    expect(click).not.toHaveBeenCalled();
  });

  it('reveals the focused node', () => {
    const { ui, view, items } = list();
    ui.setFocus(items[5] ?? null as never);
    expect(view.scroll).toBe(140);
    expect(items[5]?.rect.y).toBe(60);
  });
});

describe('tree', () => {
  it('finds by id and reparents', () => {
    const ui = new Ui({ width: 100, height: 100 });
    const label = new Label({ id: 'title', text: 'hi' });
    const a = new Panel();
    const b = new Panel();
    a.add(label);
    b.add(label);
    ui.root.add(a, b);
    expect(a.children).toHaveLength(0);
    expect(ui.root.find('title')).toBe(label);
  });
});
