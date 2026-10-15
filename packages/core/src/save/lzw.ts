import { SaveCorruptedError } from './errors.ts';

const CLEAR = 256;
const END = 257;
const FIRST = 258;
const MAX_CODES = 65_535;
const MAX_WIDTH = 16;

/**
 * Compresses bytes with LZW: codes of 9 to 16 bits packed least significant bit first, a clear
 * code when the table fills up, and an end code. Pure and synchronous, so it works in every
 * runtime, and it shrinks repetitive text such as JSON saves several times over.
 *
 * @param input the bytes to compress.
 */
export function lzwCompress(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  let width = 9;

  const emit = (code: number): void => {
    buffer |= code << bits;
    bits += width;
    while (bits >= 8) {
      out.push(buffer & 0xff);
      buffer >>>= 8;
      bits -= 8;
    }
  };

  let table = new Map<number, number>();
  let next = FIRST;
  let current = -1;
  for (const byte of input) {
    if (current < 0) {
      current = byte;
      continue;
    }
    const key = current * 256 + byte;
    const found = table.get(key);
    if (found !== undefined) {
      current = found;
      continue;
    }
    emit(current);
    table.set(key, next);
    next += 1;
    if (next > 1 << width && width < MAX_WIDTH) width += 1;
    if (next >= MAX_CODES) {
      emit(CLEAR);
      table = new Map();
      next = FIRST;
      width = 9;
    }
    current = byte;
  }
  if (current >= 0) emit(current);
  emit(END);
  if (bits > 0) out.push(buffer & 0xff);
  return Uint8Array.from(out);
}

/**
 * Reverses {@link lzwCompress}.
 *
 * @param input the compressed bytes.
 * @param maxBytes largest output accepted, a guard against inputs that expand enormously.
 * @throws {SaveCorruptedError} if the data is damaged or the output would exceed `maxBytes`.
 */
export function lzwDecompress(input: Uint8Array, maxBytes: number): Uint8Array {
  const prefix = new Uint16Array(MAX_CODES + 1);
  const suffix = new Uint8Array(MAX_CODES + 1);
  const length = new Uint32Array(MAX_CODES + 1);
  let out = new Uint8Array(Math.min(Math.max(input.length * 4, 64), maxBytes));
  let size = 0;

  const corrupt = (reason: string): SaveCorruptedError =>
    new SaveCorruptedError(`Compressed save is damaged (${reason})`);

  const runOf = (code: number): number => (code < 256 ? 1 : (length[code] as number));

  const append = (code: number): number => {
    const run = runOf(code);
    if (size + run > maxBytes) throw corrupt('output too large');
    if (size + run > out.length) {
      const grown = new Uint8Array(Math.min(Math.max(out.length * 2, size + run), maxBytes));
      grown.set(out.subarray(0, size));
      out = grown;
    }
    let cursor = code;
    for (let i = size + run - 1; i >= size; i--) {
      if (cursor < 256) {
        out[i] = cursor;
      } else {
        out[i] = suffix[cursor] as number;
        cursor = prefix[cursor] as number;
      }
    }
    const first = out[size] as number;
    size += run;
    return first;
  };

  const define = (previous: number, tail: number, at: number): void => {
    prefix[at] = previous;
    suffix[at] = tail;
    length[at] = runOf(previous) + 1;
  };

  let buffer = 0;
  let bits = 0;
  let cursor = 0;
  let width = 9;
  let next = FIRST;
  let previous = -1;
  let ended = false;

  while (!ended) {
    while (bits < width && cursor < input.length) {
      buffer |= (input[cursor] as number) << bits;
      bits += 8;
      cursor += 1;
    }
    if (bits < width) throw corrupt('unexpected end');
    const code = buffer & ((1 << width) - 1);
    buffer >>>= width;
    bits -= width;

    if (code === END) {
      ended = true;
    } else if (code === CLEAR) {
      next = FIRST;
      width = 9;
      previous = -1;
    } else {
      if (previous < 0) {
        if (code >= 256) throw corrupt('bad first code');
        append(code);
      } else if (code < next && (code < 256 || code >= FIRST)) {
        const first = append(code);
        define(previous, first, next);
        next += 1;
      } else if (code === next) {
        let head = previous;
        while (head >= 256) head = prefix[head] as number;
        define(previous, head, next);
        next += 1;
        append(code);
      } else {
        throw corrupt('bad code');
      }
      previous = code;
      if (next + 1 > 1 << width && width < MAX_WIDTH) width += 1;
    }
  }
  return out.slice(0, size);
}
