import { clamp, lerp } from './scalar.ts';

function doubleDigits(digits: string): string {
  let doubled = '';
  for (const digit of digits) doubled += digit + digit;
  return doubled;
}

function toHexByte(value: number): string {
  return Math.round(clamp(value, 0, 1) * 255)
    .toString(16)
    .padStart(2, '0');
}

/**
 * An RGBA colour with channels from `0` to `1`.
 */
export class Color {
  constructor(
    public r = 0,
    public g = 0,
    public b = 0,
    public a = 1,
  ) {}

  clone(): Color {
    return new Color(this.r, this.g, this.b, this.a);
  }

  /**
   * Parses `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. @throws {RangeError} on anything else.
   */
  static fromHex(hex: string): Color {
    let digits = hex.startsWith('#') ? hex.slice(1) : hex;
    if (digits.length === 3 || digits.length === 4) {
      digits = doubleDigits(digits);
    }
    if (!/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(digits)) {
      throw new RangeError(`Color.fromHex: invalid colour "${hex}"`);
    }
    const channel = (i: number): number => parseInt(digits.slice(i * 2, i * 2 + 2), 16) / 255;
    return new Color(channel(0), channel(1), channel(2), digits.length === 8 ? channel(3) : 1);
  }

  /**
   * Builds a colour from hue (degrees), saturation and lightness (both `0` to `1`).
   */
  static fromHsl(h: number, s: number, l: number, a = 1): Color {
    const hue = (((h % 360) + 360) % 360) / 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (t: number): number => {
      const u = (t + 1) % 1;
      if (u < 1 / 6) return p + (q - p) * 6 * u;
      if (u < 1 / 2) return q;
      if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
      return p;
    };
    return s === 0
      ? new Color(l, l, l, a)
      : new Color(channel(hue + 1 / 3), channel(hue), channel(hue - 1 / 3), a);
  }

  /**
   * `#rrggbb`, or `#rrggbbaa` when the alpha is below 1.
   */
  toHex(): string {
    const alpha = this.a < 1 ? toHexByte(this.a) : '';
    return `#${toHexByte(this.r)}${toHexByte(this.g)}${toHexByte(this.b)}${alpha}`;
  }

  /**
   * Linear interpolation in RGBA space.
   */
  lerp(other: Color, t: number, out: Color = new Color()): Color {
    out.r = lerp(this.r, other.r, t);
    out.g = lerp(this.g, other.g, t);
    out.b = lerp(this.b, other.b, t);
    out.a = lerp(this.a, other.a, t);
    return out;
  }
}
