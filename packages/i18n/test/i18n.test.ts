import { describe, expect, it } from 'vitest';
import { BigNum } from '@portojs/core';
import { I18n, MessageError } from '../src/index.ts';

function make() {
  return new I18n({
    locale: 'pt-BR',
    fallback: 'en',
    messages: {
      en: {
        title: 'Idle Miner',
        shop: {
          buy: 'Buy',
          owned: '{n, plural, one {# owned} other {# owned}}',
          only: 'Only English',
        },
        greeting: 'Hello, {name}!',
      },
      pt: { title: 'Mineiro Ocioso', greeting: 'Olá, {name}!' },
      'pt-BR': { shop: { buy: 'Comprar' } },
    },
  });
}

describe('lookup', () => {
  it('walks the locale, its language, then the fallback', () => {
    const i18n = make();
    expect(i18n.t('shop.buy')).toBe('Comprar');
    expect(i18n.t('title')).toBe('Mineiro Ocioso');
    expect(i18n.t('shop.only')).toBe('Only English');
    expect(i18n.t('greeting', { name: 'Ana' })).toBe('Olá, Ana!');
  });

  it('formats a message with the locale it was found in', () => {
    const i18n = make();
    expect(i18n.t('shop.owned', { n: 1234 })).toBe('1,234 owned');
  });

  it('returns the key for a missing message, or what onMissing says', () => {
    expect(make().t('nope.key')).toBe('nope.key');
    const seen: string[] = [];
    const custom = new I18n({
      onMissing: (key, locale) => {
        seen.push(`${locale}:${key}`);
        return `[${key}]`;
      },
    });
    expect(custom.t('x')).toBe('[x]');
    expect(seen).toEqual(['en:x']);
  });

  it('does not return a table as a message', () => {
    expect(make().t('shop')).toBe('shop');
    expect(make().has('shop')).toBe(false);
    expect(make().has('shop.buy')).toBe(true);
  });

  it('reports malformed messages', () => {
    const i18n = new I18n({ messages: { en: { bad: 'Hello {name' } } });
    expect(() => i18n.t('bad')).toThrow(MessageError);
  });
});

describe('locale', () => {
  it('changes at runtime, fires the event once and canonicalises tags', () => {
    const i18n = make();
    const changes: string[] = [];
    i18n.changed.addListener(({ from, to }) => changes.push(`${from}>${to}`));
    i18n.locale = 'en';
    i18n.locale = 'en';
    i18n.locale = 'PT-br';
    expect(changes).toEqual(['pt-BR>en', 'en>pt-BR']);
    expect(i18n.locale).toBe('pt-BR');
  });

  it('starts on the fallback when no locale is given and rejects invalid tags', () => {
    expect(new I18n().locale).toBe('en');
    expect(new I18n({ fallback: 'es' }).locale).toBe('es');
    expect(() => new I18n({ locale: 'not a tag' })).toThrow(RangeError);
    expect(() => {
      make().locale = '';
    }).toThrow(RangeError);
  });

  it('merges messages added later and lists the locales', () => {
    const i18n = make();
    i18n.addMessages('pt-BR', { shop: { sell: 'Vender' } });
    expect(i18n.t('shop.sell')).toBe('Vender');
    expect(i18n.t('shop.buy')).toBe('Comprar');
    expect(i18n.locales).toEqual(['en', 'pt', 'pt-BR']);
  });
});

describe('numbers and dates', () => {
  it('formats numbers and dates for the locale', () => {
    const i18n = make();
    expect(i18n.number(1234567.891, { maximumFractionDigits: 1 })).toBe('1.234.567,9');
    expect(i18n.date(Date.UTC(2024, 0, 31), { timeZone: 'UTC', dateStyle: 'short' })).toBe(
      '31/01/2024',
    );
    i18n.locale = 'en-US';
    expect(i18n.number(1234.5)).toBe('1,234.5');
  });

  it('formats big numbers with the locale decimal and Portuguese suffixes', () => {
    const i18n = make();
    expect(i18n.big('1.5e9')).toBe('1,5 bi');
    expect(i18n.big(BigNum.from('2.5e3'))).toBe('2,5 mil');
    i18n.locale = 'en';
    expect(i18n.big('1.5e9')).toBe('1.5B');
    i18n.locale = 'de';
    expect(i18n.big('1.5e6')).toBe('1,5M');
    expect(i18n.big('1.5e6', { decimal: '.' })).toBe('1.5M');
  });
});
