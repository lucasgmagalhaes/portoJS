import { describe, expect, it } from 'vitest';
import { CoyoteTime, InputBuffer } from '../src/index.ts';

describe('InputBuffer', () => {
  it('keeps a press for the window and uses it up once', () => {
    const buffer = new InputBuffer(0.15);
    expect(buffer.has(0)).toBe(false);
    buffer.press(1);
    expect(buffer.has(1.1)).toBe(true);
    expect(buffer.has(1.2)).toBe(false);
    buffer.press(2);
    expect(buffer.consume(2.1)).toBe(true);
    expect(buffer.consume(2.1)).toBe(false);
  });

  it('is renewed by a new press and can be cleared', () => {
    const buffer = new InputBuffer(0.1);
    buffer.press(1);
    buffer.press(1.2);
    expect(buffer.has(1.25)).toBe(true);
    buffer.clear();
    expect(buffer.has(1.25)).toBe(false);
  });

  it('validates the window', () => {
    expect(() => new InputBuffer(-1)).toThrow(RangeError);
    expect(() => new InputBuffer(NaN)).toThrow(RangeError);
    expect(new InputBuffer(0).windowSeconds).toBe(0);
  });
});

describe('CoyoteTime', () => {
  it('allows a jump shortly after leaving the ground, not before ever touching it', () => {
    const coyote = new CoyoteTime(0.1);
    expect(coyote.allows(0)).toBe(false);
    coyote.touch(1);
    expect(coyote.allows(1.05)).toBe(true);
    expect(coyote.allows(1.2)).toBe(false);
  });

  it('can be spent so a jump cannot be repeated in the air', () => {
    const coyote = new CoyoteTime(0.1);
    coyote.touch(1);
    coyote.spend();
    expect(coyote.allows(1.01)).toBe(false);
    expect(() => new CoyoteTime(-1)).toThrow(RangeError);
  });
});
