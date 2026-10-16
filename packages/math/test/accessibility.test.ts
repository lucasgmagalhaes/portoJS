import { describe, expect, it } from 'vitest';
import {
  Color,
  contrastRatio,
  okabeItoPalette,
  relativeLuminance,
  simulateColorBlindness,
} from '../src/index.ts';
import type { ColorBlindness } from '../src/index.ts';

const KINDS: ColorBlindness[] = ['protanopia', 'deuteranopia', 'tritanopia'];

function distance(a: Color, b: Color): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

describe('contrast', () => {
  it('matches the WCAG reference values', () => {
    const black = new Color(0, 0, 0);
    const white = new Color(1, 1, 1);
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
    expect(contrastRatio(Color.fromHex('#777777'), white)).toBeCloseTo(4.48, 1);
    expect(relativeLuminance(white)).toBeCloseTo(1, 5);
    expect(relativeLuminance(black)).toBe(0);
  });
});

describe('simulateColorBlindness', () => {
  it('leaves greys alone and keeps alpha', () => {
    for (const kind of KINDS) {
      const grey = simulateColorBlindness(new Color(0.5, 0.5, 0.5, 0.25), kind);
      expect(grey.r).toBeCloseTo(0.5, 2);
      expect(grey.g).toBeCloseTo(0.5, 2);
      expect(grey.b).toBeCloseTo(0.5, 2);
      expect(grey.a).toBe(0.25);
    }
  });

  it('makes red and green look alike without a red channel (protanopia, deuteranopia)', () => {
    const red = new Color(1, 0, 0);
    const green = new Color(0, 0.6, 0);
    for (const kind of ['protanopia', 'deuteranopia'] as const) {
      const before = distance(red, green);
      const after = distance(simulateColorBlindness(red, kind), simulateColorBlindness(green, kind));
      expect(after).toBeLessThan(before * 0.6);
    }
  });

  it('shifts blue towards green for tritanopia and writes into `out`', () => {
    const out = new Color();
    const result = simulateColorBlindness(new Color(0, 0, 1), 'tritanopia', out);
    expect(result).toBe(out);
    expect(out.g).toBeGreaterThan(0.3);
  });

  it('keeps every channel in range', () => {
    for (const kind of KINDS) {
      for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']) {
        const c = simulateColorBlindness(Color.fromHex(hex), kind);
        for (const v of [c.r, c.g, c.b]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('okabeItoPalette', () => {
  it('has eight colours that stay apart under every simulation', () => {
    const palette = okabeItoPalette();
    expect(palette).toHaveLength(8);
    expect(palette[0]?.toHex()).toBe('#e69f00');
    for (const kind of KINDS) {
      const seen = palette.map((c) => simulateColorBlindness(c, kind));
      for (let i = 0; i < seen.length; i++) {
        for (let j = i + 1; j < seen.length; j++) {
          expect(distance(seen[i] as Color, seen[j] as Color)).toBeGreaterThan(0.08);
        }
      }
    }
  });

  it('returns fresh colours', () => {
    const first = okabeItoPalette();
    (first[0] as Color).r = 0;
    expect(okabeItoPalette()[0]?.r).toBeGreaterThan(0.5);
  });
});
