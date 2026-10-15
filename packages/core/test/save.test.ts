import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  SaveCorruptedError,
  SaveVersionError,
  createSave,
  exportSave,
  fnv1a,
  fromBase64,
  importSave,
  migrateSave,
  parseSave,
  stableStringify,
  toBase64,
} from '../src/index.ts';
import type { JsonObject } from '../src/index.ts';

const sample: JsonObject = { gold: '1.5e12', miners: 10, flags: [true, null], nested: { a: 1 } };

describe('codec', () => {
  it('stableStringify ignores key order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
      stableStringify({ a: { c: 3, d: 2 }, b: 1 }),
    );
    expect(stableStringify({ a: [1, { y: 1, x: 2 }] })).toBe('{"a":[1,{"x":2,"y":1}]}');
  });

  it('fnv1a is deterministic and 8 hex digits', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
    expect(fnv1a('hello')).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a('x')).not.toBe(fnv1a('y'));
  });

  it('base64 round-trips unicode and large input', () => {
    for (const text of ['', 'abc', 'çãõ 日本語 🎮', 'x'.repeat(200_000)]) {
      expect(fromBase64(toBase64(text))).toBe(text);
    }
  });

  it('base64 rejects garbage', () => {
    expect(() => fromBase64('***not base64***')).toThrow(SaveCorruptedError);
  });
});

describe('save parse/export/import', () => {
  it('round-trips through an object, a JSON string and a Base64 string', () => {
    const save = createSave(3, 1_700_000_000_000, sample);
    expect(parseSave(save)).toEqual(save);
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    expect(importSave(exportSave(save))).toEqual(save);
    expect(importSave(`  ${exportSave(save)}\n`)).toEqual(save);
  });

  it('accepts reordered keys (e.g. after a database round trip)', () => {
    const save = createSave(1, 5, sample);
    const reordered = { checksum: save.checksum, data: sample, savedAt: 5, version: 1 };
    expect(() => parseSave(reordered)).not.toThrow();
  });

  it('detects modified data', () => {
    const save = createSave(1, 5, { gold: '10' });
    const forged = { ...save, data: { gold: '1e100' } };
    expect(() => parseSave(forged)).toThrow(SaveCorruptedError);
  });

  it('detects modified version, timestamp or checksum', () => {
    const save = createSave(1, 5, { gold: '10' });
    expect(() => parseSave({ ...save, version: 2 })).toThrow(SaveCorruptedError);
    expect(() => parseSave({ ...save, savedAt: 6 })).toThrow(SaveCorruptedError);
    expect(() => parseSave({ ...save, checksum: '00000000' })).toThrow(SaveCorruptedError);
  });

  it('rejects malformed shapes', () => {
    const save = createSave(1, 5, {});
    const bad: unknown[] = [
      null,
      42,
      [],
      'not json',
      {},
      { ...save, version: 0 },
      { ...save, version: 1.5 },
      { ...save, version: '1' },
      { ...save, savedAt: NaN },
      { ...save, savedAt: 'now' },
      { ...save, data: [] },
      { ...save, data: null },
      { ...save, checksum: 7 },
    ];
    for (const input of bad) expect(() => parseSave(input)).toThrow(SaveCorruptedError);
  });

  it('rejects truncated or tampered export strings', () => {
    const encoded = exportSave(createSave(1, 5, sample));
    expect(() => importSave(encoded.slice(0, -8))).toThrow(SaveCorruptedError);
    expect(() => importSave('')).toThrow(SaveCorruptedError);
    expect(() => importSave('!!!')).toThrow(SaveCorruptedError);
    const decoded = atob(encoded).replace('10', '99');
    expect(() => importSave(btoa(decoded))).toThrow(SaveCorruptedError);
  });

  it('round-trips arbitrary JSON data (property)', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), fc.jsonValue()),
        fc.integer({ min: 0, max: 1e12 }),
        (data, t) => {
          const save = createSave(1, t, JSON.parse(JSON.stringify(data)) as JsonObject);
          const viaJson = parseSave(JSON.parse(JSON.stringify(save)));
          const viaBase64 = importSave(exportSave(save));
          expect(viaJson.checksum).toBe(save.checksum);
          expect(viaBase64.checksum).toBe(save.checksum);
        },
      ),
    );
  });
});

describe('migrations', () => {
  const migrations = {
    1: (d: JsonObject): JsonObject => ({ ...d, gems: 0 }),
    2: (d: JsonObject): JsonObject => {
      const { gold, ...rest } = d;
      return { ...rest, coins: gold ?? '0' };
    },
  };

  it('returns a current save untouched', () => {
    const save = createSave(3, 1, { a: 1 });
    expect(migrateSave(save, 3, migrations)).toBe(save);
  });

  it('chains migrations in order and recomputes the checksum', () => {
    const old = createSave(1, 99, { gold: '5' });
    const migrated = migrateSave(old, 3, migrations);
    expect(migrated.version).toBe(3);
    expect(migrated.savedAt).toBe(99);
    expect(migrated.data).toEqual({ gems: 0, coins: '5' });
    expect(() => parseSave(migrated)).not.toThrow();
  });

  it('runs only the needed tail of the chain', () => {
    const mid = createSave(2, 1, { gold: '7' });
    expect(migrateSave(mid, 3, migrations).data).toEqual({ coins: '7' });
  });

  it('refuses saves from the future', () => {
    expect(() => migrateSave(createSave(9, 1, {}), 3, migrations)).toThrow(SaveVersionError);
  });

  it('fails clearly when a step is missing', () => {
    expect(() => migrateSave(createSave(1, 1, {}), 3, { 1: migrations[1] })).toThrow(
      /No migration from save version 2 to 3/,
    );
  });

  it('rejects migrations that return junk', () => {
    const junk = { 1: (() => null) as unknown as (d: JsonObject) => JsonObject };
    expect(() => migrateSave(createSave(1, 1, {}), 2, junk)).toThrow(SaveVersionError);
  });
});

describe('compressed export', () => {
  const big: JsonObject = {
    items: Array.from({ length: 4000 }, (_, i) => ({
      id: i,
      name: `generator-${i % 17}`,
      owned: '1.5e12',
    })),
  };

  it('round-trips and is much smaller for repetitive saves', () => {
    const save = createSave(3, 1000, big);
    const plain = exportSave(save);
    const packed = exportSave(save, { compress: true });
    expect(packed.startsWith('~')).toBe(true);
    expect(packed.length).toBeLessThan(plain.length / 3);
    expect(importSave(packed)).toEqual(save);
    expect(importSave(plain)).toEqual(save);
  });

  it('round-trips arbitrary data, including text beyond ASCII and table resets', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'binary', maxLength: 300 }),
        fc.integer({ min: 0, max: 5 }),
        (text, extra) => {
          const save = createSave(1, 5, {
            text,
            list: Array.from({ length: extra * 2000 }, (_, i) => i % 9),
          });
          expect(importSave(exportSave(save, { compress: true }))).toEqual(save);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('rejects damaged or hostile compressed input', () => {
    const packed = exportSave(createSave(1, 1, sample), { compress: true });
    expect(() => importSave('~!!!')).toThrow(SaveCorruptedError);
    expect(() => importSave(`${packed.slice(0, -6)}AAAA`)).toThrow(SaveCorruptedError);
    expect(() => importSave(packed.slice(0, 8))).toThrow(SaveCorruptedError);
    expect(() => importSave('~')).toThrow(SaveCorruptedError);
    expect(() => importSave(packed, 10)).toThrow(SaveCorruptedError);
    expect(() => importSave(`~${toBase64('plain text, not lzw')}`)).toThrow(SaveCorruptedError);
  });

  it('never crashes on random compressed payloads', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), (bytes) => {
        const encoded = `~${btoa(String.fromCharCode(...bytes))}`;
        try {
          importSave(encoded);
        } catch (error) {
          expect(error).toBeInstanceOf(SaveCorruptedError);
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('compressed export with a full code table', () => {
  it('clears the table and keeps round-tripping on large, noisy data', () => {
    let seed = 12345;
    const noise = Array.from({ length: 250_000 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % 1000;
    });
    const save = createSave(1, 1, { noise });
    const packed = exportSave(save, { compress: true });
    expect(importSave(packed)).toEqual(save);
  });
});
