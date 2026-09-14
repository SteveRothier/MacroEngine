/**
 * Supported UI locales registry.
 *
 * To add a language later:
 * 1. Append the code to SUPPORTED_LOCALES and LOCALE_META
 * 2. Add a matching block in every src/i18n/catalogs/*.ts (defineCatalog enforces this)
 * 3. Add a serde variant on Rust `UiLocale` in engine settings.rs
 */
export const SUPPORTED_LOCALES = ["fr", "en"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const FALLBACK_LOCALE: AppLocale = "fr";

export type LocaleMeta = {
  code: AppLocale;
  /** Endonym shown in the language picker (stable across UI locales). */
  nativeName: string;
  /** BCP-47 / Intl prefixes that map to this locale when preference is `system`. */
  matchPrefixes: readonly string[];
};

export const LOCALE_META: Record<AppLocale, LocaleMeta> = {
  fr: {
    code: "fr",
    nativeName: "Français",
    matchPrefixes: ["fr"],
  },
  en: {
    code: "en",
    nativeName: "English",
    matchPrefixes: ["en"],
  },
};

export type UiLocalePref = "system" | AppLocale;

export function isAppLocale(value: string): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Language prefs for the Settings select (excludes `system`; label that in the UI). */
export function localePreferenceOptions(): {
  value: AppLocale;
  label: string;
}[] {
  return SUPPORTED_LOCALES.map((code) => ({
    value: code,
    label: LOCALE_META[code].nativeName,
  }));
}

export function matchSystemLocale(tag: string): AppLocale {
  const lower = tag.toLowerCase();
  for (const code of SUPPORTED_LOCALES) {
    for (const prefix of LOCALE_META[code].matchPrefixes) {
      if (lower === prefix || lower.startsWith(`${prefix}-`)) {
        return code;
      }
    }
  }
  return FALLBACK_LOCALE;
}
