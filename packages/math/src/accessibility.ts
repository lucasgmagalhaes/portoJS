import { Color } from './color.ts';

/**
 * Kinds of colour vision deficiency that {@link simulateColorBlindness} can show.
 */
export type ColorBlindness = 'protanopia' | 'deuteranopia' | 'tritanopia';

type Matrix = readonly [number, number, number, number, number, number, number, number, number];

const MATRICES: Readonly<Record<ColorBlindness, Matrix>> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function toSrgb(channel: number): number {
  const c = Math.min(1, Math.max(0, channel));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/**
 * Shows how a colour looks to someone with a colour vision deficiency (Machado et al. 2009,
 * full severity, in linear RGB). Use it to check that two colours that mean different things in
 * your game, like teams or health states, still differ.
 */
export function simulateColorBlindness(
  color: Color,
  kind: ColorBlindness,
  out: Color = new Color(),
): Color {
  const m = MATRICES[kind];
  const r = toLinear(color.r);
  const g = toLinear(color.g);
  const b = toLinear(color.b);
  out.r = toSrgb(m[0] * r + m[1] * g + m[2] * b);
  out.g = toSrgb(m[3] * r + m[4] * g + m[5] * b);
  out.b = toSrgb(m[6] * r + m[7] * g + m[8] * b);
  out.a = color.a;
  return out;
}

/**
 * Relative luminance as WCAG defines it, `0` (black) to `1` (white).
 */
export function relativeLuminance(color: Color): number {
  return 0.2126 * toLinear(color.r) + 0.7152 * toLinear(color.g) + 0.0722 * toLinear(color.b);
}

/**
 * WCAG contrast ratio between two colours, from `1` (identical) to `21` (black on white).
 * Text needs at least `4.5` to be readable by most people, `3` for large text.
 */
export function contrastRatio(a: Color, b: Color): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const OKABE_ITO_HEX = [
  '#e69f00',
  '#56b4e9',
  '#009e73',
  '#f0e442',
  '#0072b2',
  '#d55e00',
  '#cc79a7',
  '#000000',
] as const;

/**
 * The Okabe-Ito palette: eight colours chosen to stay distinguishable for the common kinds of
 * colour blindness. Orange, sky blue, bluish green, yellow, blue, vermillion, reddish purple
 * and black. A fresh array of fresh colours on every call, so they can be changed freely.
 */
export function okabeItoPalette(): Color[] {
  const palette: Color[] = [];
  for (const hex of OKABE_ITO_HEX) palette.push(Color.fromHex(hex));
  return palette;
}
