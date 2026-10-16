import { describe, expect, it } from 'vitest';
import { MessageError, formatMessage } from '../src/index.ts';

const f = (
  template: string,
  params: Record<string, string | number | boolean> = {},
  locale = 'en',
) => formatMessage(template, params, locale);

describe('placeholders', () => {
  it('fills in strings and formats numbers for the locale', () => {
    expect(f('Hello, {name}!', { name: 'Ana' })).toBe('Hello, Ana!');
    expect(f('{n} gold', { n: 1234.5 })).toBe('1,234.5 gold');
    expect(f('{n} gold', { n: 1234.5 }, 'pt-BR')).toBe('1.234,5 gold');
    expect(f('{ok}', { ok: true })).toBe('true');
  });

  it('leaves an unknown placeholder visible', () => {
    expect(f('Hi {nmae}', { name: 'x' })).toBe('Hi {nmae}');
  });

  it('supports quoting for literal braces and apostrophes', () => {
    expect(f("Use '{'braces'}' and it''s fine")).toBe("Use {braces} and it's fine");
    expect(f("rock 'n' roll")).toBe("rock 'n' roll");
  });
});

describe('plural', () => {
  const items = '{count, plural, =0 {No items} one {# item} other {# items}}';

  it('picks by the plural rules of English', () => {
    expect(f(items, { count: 0 })).toBe('No items');
    expect(f(items, { count: 1 })).toBe('1 item');
    expect(f(items, { count: 2 })).toBe('2 items');
    expect(f(items, { count: 1000 })).toBe('1,000 items');
  });

  it('uses the rules of the locale', () => {
    const pt = '{n, plural, one {# dia} other {# dias}}';
    expect(f(pt, { n: 0 }, 'pt-BR')).toBe('0 dia');
    expect(f(pt, { n: 2 }, 'pt-BR')).toBe('2 dias');
    const ru = '{n, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}';
    expect(f(ru, { n: 1 }, 'ru')).toBe('1 файл');
    expect(f(ru, { n: 3 }, 'ru')).toBe('3 файла');
    expect(f(ru, { n: 5 }, 'ru')).toBe('5 файлов');
  });

  it('prefers an exact =n over the category and falls back to other', () => {
    expect(f('{n, plural, =1 {exactly one} one {one} other {many}}', { n: 1 })).toBe('exactly one');
    expect(f('{n, plural, one {one} other {many}}', { n: 7 })).toBe('many');
  });

  it('nests placeholders inside branches', () => {
    expect(
      f('{n, plural, one {{who} has # coin} other {{who} has # coins}}', { n: 3, who: 'Ana' }),
    ).toBe('Ana has 3 coins');
  });

  it('does not treat # as a number outside a plural', () => {
    expect(f('Level #{n}', { n: 4 })).toBe('Level #4');
  });
});

describe('select', () => {
  const kind = '{kind, select, boss {The boss} elite {An elite} other {An enemy}}';

  it('picks by value and falls back to other', () => {
    expect(f(kind, { kind: 'boss' })).toBe('The boss');
    expect(f(kind, { kind: 'elite' })).toBe('An elite');
    expect(f(kind, { kind: 'grunt' })).toBe('An enemy');
  });
});

describe('errors', () => {
  it('rejects malformed messages', () => {
    expect(() => f('Hello {name')).toThrow(MessageError);
    expect(() => f('Hello }')).toThrow(MessageError);
    expect(() => f("Hello '{ x")).toThrow(MessageError);
    expect(() => f('{n, wat, x {y}}', { n: 1 })).toThrow(/Unknown placeholder type/);
    expect(() => f('{n plural}', { n: 1 })).toThrow(MessageError);
    expect(() => f('{, plural}')).toThrow(MessageError);
    expect(() => f('{n, plural, one 1}', { n: 1 })).toThrow(MessageError);
    expect(() => f('{n, plural, one {x}', { n: 1 })).toThrow(MessageError);
    expect(() => f('{n, plural, one {x} {')).toThrow(MessageError);
  });

  it('needs a number for a plural and an other branch to fall back to', () => {
    expect(() => f('{n, plural, other {x}}', { n: 'a' })).toThrow(/needs a number/);
    expect(() => f('{n, plural, one {x}}', { n: 5 })).toThrow(/other/);
    expect(() => f('{k, select, a {x}}', { k: 'b' })).toThrow(/other/);
  });
});
