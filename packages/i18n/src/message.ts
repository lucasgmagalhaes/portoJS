/**
 * Values for the placeholders of a message.
 */
export type MessageParams = Readonly<Record<string, string | number | boolean>>;

/**
 * Thrown for a message that cannot be parsed, for example an unclosed brace.
 */
export class MessageError extends Error {
  override readonly name = 'MessageError';
}

interface Cursor {
  readonly text: string;
  index: number;
}

interface Context {
  readonly params: MessageParams;
  readonly locale: string;
  readonly plurals: Intl.PluralRules;
  readonly numbers: Intl.NumberFormat;
  /**
   * The number a `#` stands for inside a plural branch.
   */
  readonly hash: number | undefined;
}

function fail(cursor: Cursor, reason: string): never {
  throw new MessageError(`${reason} at position ${cursor.index} of "${cursor.text}"`);
}

function skipSpaces(cursor: Cursor): void {
  while (/\s/.test(cursor.text[cursor.index] ?? '')) cursor.index += 1;
}

function readWord(cursor: Cursor): string {
  const start = cursor.index;
  while (/[^\s,{}]/.test(cursor.text[cursor.index] ?? '')) cursor.index += 1;
  return cursor.text.slice(start, cursor.index);
}

/**
 * Reads text up to the closing `}` of the current level, formatting nested placeholders.
 * ICU quoting: `'{'` and `'}'` are literal braces, `''` is an apostrophe.
 */
function readText(cursor: Cursor, context: Context, nested: boolean): string {
  let out = '';
  while (cursor.index < cursor.text.length) {
    const char = cursor.text[cursor.index] as string;
    if (char === "'") {
      const next = cursor.text[cursor.index + 1];
      if (next === "'") {
        out += "'";
        cursor.index += 2;
      } else if (next === '{' || next === '}') {
        const end = cursor.text.indexOf("'", cursor.index + 1);
        if (end < 0) fail(cursor, 'Unclosed quote');
        out += cursor.text.slice(cursor.index + 1, end);
        cursor.index = end + 1;
      } else {
        out += char;
        cursor.index += 1;
      }
    } else if (char === '{') {
      cursor.index += 1;
      out += readPlaceholder(cursor, context);
    } else if (char === '}') {
      if (!nested) fail(cursor, 'Unexpected "}"');
      return out;
    } else if (char === '#' && context.hash !== undefined) {
      out += context.numbers.format(context.hash);
      cursor.index += 1;
    } else {
      out += char;
      cursor.index += 1;
    }
  }
  if (nested) fail(cursor, 'Unclosed "{"');
  return out;
}

function skipBranch(cursor: Cursor): void {
  let depth = 1;
  while (cursor.index < cursor.text.length && depth > 0) {
    const char = cursor.text[cursor.index];
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    cursor.index += 1;
  }
  if (depth > 0) fail(cursor, 'Unclosed "{"');
}

type Matcher =
  | { readonly kind: 'plural'; readonly value: number; readonly category: string }
  | { readonly kind: 'select'; readonly key: string };

function matches(selector: string, matcher: Matcher): boolean {
  if (matcher.kind === 'select') return selector === matcher.key;
  return selector.startsWith('=')
    ? Number(selector.slice(1)) === matcher.value
    : selector === matcher.category;
}

function readBranches(cursor: Cursor, context: Context, matcher: Matcher): string {
  let chosen: string | undefined;
  let other: string | undefined;
  for (;;) {
    skipSpaces(cursor);
    if (cursor.text[cursor.index] === '}') break;
    const selector = readWord(cursor);
    if (selector === '') fail(cursor, 'Expected a branch name');
    skipSpaces(cursor);
    if (cursor.text[cursor.index] !== '{') fail(cursor, `Expected "{" after "${selector}"`);
    cursor.index += 1;
    const wanted = chosen === undefined && matches(selector, matcher);
    const isOther = selector === 'other';
    if (wanted || (isOther && other === undefined)) {
      const text = readText(cursor, context, true);
      cursor.index += 1;
      if (wanted) chosen = text;
      else other = text;
    } else {
      skipBranch(cursor);
    }
  }
  cursor.index += 1;
  const result = chosen ?? other;
  if (result === undefined) fail(cursor, 'No matching branch and no "other"');
  return result;
}

function readPlaceholder(cursor: Cursor, context: Context): string {
  skipSpaces(cursor);
  const name = readWord(cursor);
  if (name === '') fail(cursor, 'Expected a placeholder name');
  const value = context.params[name];
  skipSpaces(cursor);
  if (cursor.text[cursor.index] === '}') {
    cursor.index += 1;
    if (value === undefined) return `{${name}}`;
    return typeof value === 'number' ? context.numbers.format(value) : String(value);
  }
  if (cursor.text[cursor.index] !== ',') fail(cursor, `Expected "," or "}" after "${name}"`);
  cursor.index += 1;
  skipSpaces(cursor);
  const kind = readWord(cursor);
  skipSpaces(cursor);
  if (cursor.text[cursor.index] !== ',') fail(cursor, `Expected "," after "${kind}"`);
  cursor.index += 1;
  if (kind === 'plural') {
    if (typeof value !== 'number') {
      throw new MessageError(`Plural "${name}" needs a number, got ${typeof value}`);
    }
    const inner: Context = { ...context, hash: value };
    return readBranches(cursor, inner, {
      kind: 'plural',
      value,
      category: context.plurals.select(value),
    });
  }
  if (kind === 'select') {
    return readBranches(cursor, context, { kind: 'select', key: String(value) });
  }
  return fail(cursor, `Unknown placeholder type "${kind}"`);
}

/**
 * Fills in a message. Supported syntax (a subset of ICU MessageFormat):
 *
 * - `{name}`: the value of a parameter; numbers are formatted for the locale.
 * - `{count, plural, =0 {none} one {# item} other {# items}}`: picks a branch by the locale's
 *   plural rules (`zero`, `one`, `two`, `few`, `many`, `other`) or an exact `=n`; `#` is the number.
 * - `{kind, select, boss {Boss} other {Enemy}}`: picks a branch by the parameter's value.
 * - `'{'` and `'}'` print a brace; `''` prints an apostrophe.
 *
 * A placeholder without a parameter is left as written, so a typo is visible.
 *
 * @throws {MessageError} for a malformed message, a plural given a non-number, or a plural/select
 * without a matching branch and without `other`.
 */
export function formatMessage(template: string, params: MessageParams, locale: string): string {
  const context: Context = {
    params,
    locale,
    plurals: new Intl.PluralRules(locale),
    numbers: new Intl.NumberFormat(locale),
    hash: undefined,
  };
  return readText({ text: template, index: 0 }, context, false);
}
