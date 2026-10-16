import { describe, expect, it } from 'vitest';
import { CanvasText, SpriteBatch, rasterizeText } from '../src/index.ts';
import type { TextCanvas, TextContext, Texture } from '../src/index.ts';

class FakeContext implements TextContext {
  font = '';
  fillStyle: string | CanvasGradient | CanvasPattern = '';
  strokeStyle: string | CanvasGradient | CanvasPattern = '';
  lineWidth = 0;
  textBaseline: CanvasTextBaseline = 'alphabetic';
  textAlign: CanvasTextAlign = 'start';
  lineJoin: CanvasLineJoin = 'miter';
  readonly calls: string[] = [];
  scaled = 1;

  measureText(text: string): { width: number } {
    return { width: text.length * 10 };
  }

  fillText(text: string, x: number, y: number): void {
    this.calls.push(`fill ${text} ${x},${y} ${this.fillStyle as string} ${this.textAlign}`);
  }

  strokeText(text: string, x: number, y: number): void {
    this.calls.push(`stroke ${text} ${x},${y} ${this.strokeStyle as string} ${this.lineWidth}`);
  }

  scale(x: number): void {
    this.scaled = x;
  }
}

class FakeCanvas implements TextCanvas {
  readonly context = new FakeContext();

  constructor(
    public width: number,
    public height: number,
  ) {}

  getContext(): FakeContext {
    return this.context;
  }
}

function make() {
  const canvases: FakeCanvas[] = [];
  const create = (w: number, h: number): FakeCanvas => {
    const canvas = new FakeCanvas(w, h);
    canvases.push(canvas);
    return canvas;
  };
  return { canvases, create };
}

describe('rasterizeText', () => {
  it('sizes the canvas to the text plus padding and fills each line', () => {
    const { create } = make();
    const result = rasterizeText('Hi\nthere', { font: '16px Arial' }, create);
    expect(result.lineCount).toBe(2);
    expect(result.width).toBe(5 * 10 + 4);
    expect(result.height).toBe(Math.ceil(2 * 20 + 4));
    expect(result.canvas.width).toBe(54);
    expect(result.canvas.context.calls).toEqual([
      'fill Hi 2,12 #ffffff left',
      'fill there 2,32 #ffffff left',
    ]);
    expect(result.canvas.context.font).toBe('16px Arial');
  });

  it('wraps words at maxWidth', () => {
    const { create } = make();
    const result = rasterizeText('aa bb cc', { font: '10px x', maxWidth: 50 }, create);
    expect(result.lineCount).toBe(2);
    expect(result.canvas.context.calls[0]).toContain('fill aa bb');
    expect(result.canvas.context.calls[1]).toContain('fill cc');
  });

  it('aligns, strokes under the fill and honours resolution and colour', () => {
    const { create } = make();
    const result = rasterizeText(
      'abc\na',
      {
        font: '20px x',
        color: '#ff0000',
        align: 'center',
        stroke: { color: '#000000', width: 3 },
        resolution: 2,
        padding: 4,
        lineHeight: 30,
      },
      create,
    );
    expect(result.width).toBe(38);
    expect(result.canvas.width).toBe(76);
    expect(result.canvas.context.scaled).toBe(2);
    expect(result.canvas.context.calls.slice(0, 2)).toEqual([
      'stroke abc 19,19 #000000 3',
      'fill abc 19,19 #ff0000 center',
    ]);
    const right = rasterizeText('ab', { font: '10px x', align: 'right' }, create);
    expect(right.canvas.context.calls[0]).toContain('22,');
  });

  it('rejects a font without a px size and a canvas without a context', () => {
    const { create } = make();
    expect(() => rasterizeText('x', { font: 'Arial' }, create)).toThrow(RangeError);
    const broken = (): TextCanvas => ({ width: 1, height: 1, getContext: () => null });
    expect(() => rasterizeText('x', { font: '10px x' }, broken)).toThrow(/2D context/);
    let first = true;
    const secondBroken = (w: number, h: number): TextCanvas => {
      if (first) {
        first = false;
        return new FakeCanvas(w, h);
      }
      return broken();
    };
    expect(() => rasterizeText('x', { font: '10px x' }, secondBroken)).toThrow(/2D context/);
  });
});

describe('CanvasText', () => {
  function host() {
    const created: Texture[] = [];
    const deleted: Texture[] = [];
    return {
      created,
      deleted,
      host: {
        createTexture: (): Texture => {
          const texture = { id: created.length + 1, width: 10, height: 10 };
          created.push(texture);
          return texture;
        },
        deleteTexture: (texture: Texture): void => void deleted.push(texture),
      },
    };
  }

  const style = { font: '10px x' };

  it('uploads once, re-rasterises only on change and frees the old texture', () => {
    const { created, deleted, host: h } = host();
    const { create } = make();
    const label = new CanvasText(h, create as never);
    expect(label.texture).toBeUndefined();
    label.set('one', style);
    label.set('one', style);
    expect(created).toHaveLength(1);
    label.set('two', style);
    expect(created).toHaveLength(2);
    expect(deleted).toEqual([created[0]]);
    expect(label.width).toBe(34);
    expect(label.height).toBe(Math.ceil(12.5 + 4));
    label.set('two', { font: '12px x' });
    expect(created).toHaveLength(3);
  });

  it('draws anchored and scaled, and draws nothing before set', () => {
    const { host: h } = host();
    const { create } = make();
    const label = new CanvasText(h, create as never);
    const batch = new SpriteBatch();
    label.draw(batch, { x: 0, y: 0 });
    expect(batch.count).toBe(0);
    label.set('abcd', style);
    label.draw(batch, { x: 100, y: 50, anchorX: 0.5, scale: 2, color: 0x01020304, layer: 2 });
    const { data } = batch.build();
    expect(data[0]).toBe(100 - (label.width * 2) / 2);
    expect(data[1]).toBe(50);
    expect(data[2]).toBe(label.width * 2);
  });

  it('frees its texture on dispose', () => {
    const { created, deleted, host: h } = host();
    const { create } = make();
    const label = new CanvasText(h, create as never);
    label.set('x', style);
    label.dispose();
    label.dispose();
    expect(deleted).toEqual(created);
    expect(label.texture).toBeUndefined();
    label.set('x', style);
    expect(created).toHaveLength(2);
  });
});
