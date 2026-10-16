import type { JsonValue } from '@portojs/core';
import { Component } from '@portojs/runtime';
import type { GameObject } from '@portojs/runtime';
import { I18n } from './i18n.ts';
import type { I18nOptions } from './i18n.ts';

/**
 * Picks the best of the supported locales for the languages a user prefers, such as
 * `navigator.languages`. An exact tag wins, then the same language (`pt` for `pt-PT` if only
 * `pt-BR` is supported, and the other way round).
 *
 * @returns the supported locale, or `fallback`.
 */
export function detectLocale(
  supported: readonly string[],
  preferred: readonly string[],
  fallback: string,
): string {
  const lowered = supported.map(toLower);
  for (const wanted of preferred) {
    const exact = lowered.indexOf(wanted.toLowerCase());
    if (exact >= 0) return supported[exact] as string;
    const wantedLanguage = wanted.toLowerCase().split('-', 1)[0] as string;
    const sameLanguage = lowered.findIndex(sharesLanguage(wantedLanguage));
    if (sameLanguage >= 0) return supported[sameLanguage] as string;
  }
  return fallback;
}

function toLower(value: string): string {
  return value.toLowerCase();
}

function sharesLanguage(language: string): (locale: string) => boolean {
  return (locale) => locale.split('-', 1)[0] === language;
}

/**
 * Owns an {@link I18n} for a game and saves the chosen language with it, so the player's choice
 * survives a reload.
 *
 * @example
 * const l10n = game.createObject('Localization').addComponent(Localization, {
 *   messages: { en, 'pt-BR': ptBR },
 * });
 * l10n.i18n.locale = 'pt-BR'; // saved with the game
 * label.text = l10n.i18n.t('shop.buy');
 */
export class Localization extends Component {
  static override typeId = 'Localization';

  /**
   * The translations.
   */
  readonly i18n: I18n;

  /**
   * @param gameObject the object this component is attached to.
   * @param options locale, fallback and messages.
   */
  constructor(gameObject: GameObject, options: I18nOptions = {}) {
    super(gameObject);
    this.i18n = new I18n(options);
    this.initial = this.i18n.locale;
  }

  private readonly initial: string;

  override onSave(): JsonValue {
    return this.i18n.locale;
  }

  override onLoad(data: JsonValue | undefined): void {
    this.i18n.locale = typeof data === 'string' && isLocale(data) ? data : this.initial;
  }
}

function isLocale(tag: string): boolean {
  try {
    return Intl.getCanonicalLocales(tag).length === 1;
  } catch {
    return false;
  }
}
