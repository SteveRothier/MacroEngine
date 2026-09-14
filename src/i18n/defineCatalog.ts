import type { AppLocale } from "./locales";

/**
 * Ensures every supported locale has a message tree of the same shape.
 * Adding a code to SUPPORTED_LOCALES forces a TypeScript error until each catalog is updated.
 */
export function defineCatalog<T extends Record<string, unknown>>(
  entries: Record<AppLocale, T>,
): Record<AppLocale, T> {
  return entries;
}
