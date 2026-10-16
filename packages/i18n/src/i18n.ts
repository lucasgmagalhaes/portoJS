import { SUFFIX_SETS, format } from '@portojs/core';
import type { BigNumLike, FormatOptions } from '@portojs/core';
import { GameEvent } from '@portojs/runtime';
import { formatMessage } from './message.ts';
import type { MessageParams } from './message.ts';

/**
 * A table of messages. Values are message strings or nested tables; look them up with dotted
 * keys such as `shop.buy`.
 */
export interface Messages {
  readonly [key: string]: string | Messages;
}

/**
 * Options of an {@link I18n}.
 */
export interface I18nOptions {
  /**
   * The starting locale, a BCP 47 tag such as `pt-BR`. Default: the fallback locale.
   */
  readonly locale?: string;
  /**
   * Used when a message is missing in the current locale. Default `en`.
   */
  readonly fallback?: string;
  /**
   * Message tables by locale.
   */
  readonly messages?: Readonly<Record<string, Messages>>;
  /**
   * Called when a key is found in no locale. It returns the text to show instead; the default
   * shows the key itself so gaps are visible.
   */
  readonly onMissing?: (key: string, locale: string) => string;
}

/**
 * Changed locale event payload.
 */
export interface LocaleChange {
  readonly from: string;
  readonly to: string;
}

function lookup(table: Messages | undefined, key: string): string | undefined {
  let current: string | Messages | undefined = table;
  for (const part of key.split('.')) {
    if (typeof current !== 'object') return undefined;
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function language(locale: string): string {
  return locale.split('-', 1)[0] ?? locale;
}

/**
 * Translations with plurals and locale-aware numbers. A key is looked up in the current locale
 * (`pt-BR`), then its language (`pt`), then the fallback locale and its language.
 *
 * @example
 * const i18n = new I18n({
 *   locale: 'pt-BR',
 *   messages: {
 *     en: { shop: { buy: 'Buy', owned: '{n, plural, one {# owned} other {# owned}}' } },
 *     'pt-BR': { shop: { buy: 'Comprar' } },
 *   },
 * });
 * i18n.t('shop.buy'); // "Comprar"
 * i18n.t('shop.owned', { n: 3 }); // missing in pt-BR, so the English "3 owned"
 */
export class I18n {
  /**
   * Fires after {@link I18n.locale} changes.
   */
  readonly changed = new GameEvent<LocaleChange>();

  private current: string;
  private readonly fallbackLocale: string;
  private readonly tables = new Map<string, Messages>();
  private readonly onMissing: (key: string, locale: string) => string;

  /**
   * @throws {RangeError} if a locale tag is invalid.
   */
  constructor(options: I18nOptions = {}) {
    this.fallbackLocale = canonical(options.fallback ?? 'en');
    this.current = canonical(options.locale ?? this.fallbackLocale);
    this.onMissing = options.onMissing ?? keyOf;
    for (const [locale, messages] of Object.entries(options.messages ?? {})) {
      this.addMessages(locale, messages);
    }
  }

  /**
   * The current locale.
   *
   * @throws {RangeError} when set to an invalid tag.
   */
  get locale(): string {
    return this.current;
  }

  set locale(value: string) {
    const next = canonical(value);
    if (next === this.current) return;
    const from = this.current;
    this.current = next;
    this.changed.invoke({ from, to: next });
  }

  /**
   * The locales that have messages.
   */
  get locales(): readonly string[] {
    return [...this.tables.keys()];
  }

  /**
   * Adds messages to a locale, merging into what is there (later keys win).
   */
  addMessages(locale: string, messages: Messages): void {
    const tag = canonical(locale);
    this.tables.set(tag, merge(this.tables.get(tag), messages));
  }

  /**
   * Whether the key exists in the current locale chain.
   */
  has(key: string): boolean {
    return this.find(key) !== undefined;
  }

  /**
   * The translation of `key` with `params` filled in. A key that is nowhere is passed to
   * `onMissing` (by default returned as is).
   *
   * @throws {MessageError} if the found message is malformed.
   */
  t(key: string, params: MessageParams = {}): string {
    const found = this.find(key);
    if (found === undefined) return this.onMissing(key, this.current);
    return formatMessage(found.message, params, found.locale);
  }

  /**
   * Formats a number for the current locale.
   */
  number(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.current, options).format(value);
  }

  /**
   * Formats a date for the current locale.
   */
  date(value: Date | number, options?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.current, options).format(value);
  }

  /**
   * Formats a big number with the decimal separator of the current locale and, for Portuguese,
   * the Portuguese suffixes. Options you pass win.
   */
  big(value: BigNumLike, options: FormatOptions = {}): string {
    const decimal = new Intl.NumberFormat(this.current).formatToParts(1.1).find(isDecimal)?.value;
    return format(value, {
      notation: 'suffix',
      ...(decimal === undefined ? {} : { decimal }),
      ...(language(this.current) === 'pt' ? { suffixes: SUFFIX_SETS.pt } : {}),
      ...options,
    });
  }

  private find(key: string): { message: string; locale: string } | undefined {
    const tried = new Set<string>();
    for (const locale of [
      this.current,
      language(this.current),
      this.fallbackLocale,
      language(this.fallbackLocale),
    ]) {
      if (tried.has(locale)) continue;
      tried.add(locale);
      const message = lookup(this.tables.get(locale), key);
      if (message !== undefined) return { message, locale };
    }
    return undefined;
  }
}

function isDecimal(part: Intl.NumberFormatPart): boolean {
  return part.type === 'decimal';
}

function keyOf(key: string): string {
  return key;
}

function canonical(tag: string): string {
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? tag;
  } catch {
    throw new RangeError(`I18n: "${tag}" is not a valid locale tag`);
  }
}

function merge(base: Messages | undefined, extra: Messages): Messages {
  const result: { [key: string]: string | Messages } = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const existing = result[key];
    result[key] =
      typeof value === 'object' && typeof existing === 'object' ? merge(existing, value) : value;
  }
  return result;
}
