/**
 * Lightweight multi-locale i18n for Caster (fr/en shipped; registry-ready for more).
 *
 * To add a language: update SUPPORTED_LOCALES + LOCALE_META, fill each catalog via
 * defineCatalog, and add a Rust UiLocale variant. See src/i18n/locales.ts.
 *
 * Tray / Rust menu + tooltips follow `shell.ui_locale` (rebuilt on settings save).
 */
export type { AppLocale, UiLocalePref, InterpVars } from "./types";
export {
  resolveLocale,
  interpolate,
  leafPaths,
  lookupPath,
} from "./types";
export {
  SUPPORTED_LOCALES,
  FALLBACK_LOCALE,
  LOCALE_META,
  isAppLocale,
  localePreferenceOptions,
  matchSystemLocale,
} from "./locales";
export { defineCatalog } from "./defineCatalog";
export { catalogs } from "./catalogs";
export { tStatic, catalogKeys, type MessageKey, type TFunction } from "./t";
export { LocaleProvider, useLocale, useT } from "./context";
