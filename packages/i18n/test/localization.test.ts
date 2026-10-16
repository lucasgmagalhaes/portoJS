import { ManualClock } from '@portojs/core';
import { Game } from '@portojs/runtime';
import { describe, expect, it } from 'vitest';
import { Localization, detectLocale } from '../src/index.ts';

const messages = { en: { hi: 'Hi' }, 'pt-BR': { hi: 'Oi' }, es: { hi: 'Hola' } };

describe('detectLocale', () => {
  const supported = ['en', 'pt-BR', 'es'];

  it('prefers an exact tag, in the order the user listed', () => {
    expect(detectLocale(supported, ['pt-br', 'en'], 'en')).toBe('pt-BR');
    expect(detectLocale(supported, ['fr', 'es', 'en'], 'en')).toBe('es');
  });

  it('matches the same language when there is no exact tag', () => {
    expect(detectLocale(supported, ['pt-PT'], 'en')).toBe('pt-BR');
    expect(detectLocale(supported, ['en-GB'], 'es')).toBe('en');
    expect(detectLocale(['pt'], ['pt-BR'], 'en')).toBe('pt');
  });

  it('falls back when nothing matches or nothing is asked', () => {
    expect(detectLocale(supported, ['ja', 'zh-CN'], 'en')).toBe('en');
    expect(detectLocale(supported, [], 'es')).toBe('es');
    expect(detectLocale([], ['en'], 'xx')).toBe('xx');
  });
});

describe('Localization', () => {
  function make(locale?: string) {
    const game = new Game({ clock: new ManualClock(0) });
    const l10n = game
      .createObject('Localization')
      .addComponent(Localization, locale === undefined ? { messages } : { messages, locale });
    return { game, l10n };
  }

  it('owns an I18n with the given messages', () => {
    const { l10n } = make('pt-BR');
    expect(l10n.i18n.t('hi')).toBe('Oi');
  });

  it('saves the chosen language and restores it', () => {
    const a = make();
    a.l10n.i18n.locale = 'es';
    const save = a.game.save();
    const b = make('pt-BR');
    b.game.load(save);
    expect(b.l10n.i18n.locale).toBe('es');
    expect(b.l10n.i18n.t('hi')).toBe('Hola');
  });

  it('returns to the starting language on reset or when the save has none', () => {
    const { game, l10n } = make('pt-BR');
    l10n.i18n.locale = 'es';
    game.reset();
    expect(l10n.i18n.locale).toBe('pt-BR');
  });

  it('ignores a saved value that is not a locale', () => {
    const { l10n } = make('pt-BR');
    l10n.onLoad('not a locale!');
    expect(l10n.i18n.locale).toBe('pt-BR');
    l10n.onLoad(42);
    expect(l10n.i18n.locale).toBe('pt-BR');
  });
});
