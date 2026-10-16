/**
 * Translations, plurals and locale-aware number formatting.
 *
 * @module @portojs/i18n
 */

export { MessageError, formatMessage } from './message.ts';
export type { MessageParams } from './message.ts';
export { I18n } from './i18n.ts';
export type { I18nOptions, LocaleChange, Messages } from './i18n.ts';
export { Localization, detectLocale } from './localization.ts';
