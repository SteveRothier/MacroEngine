import type { UiLocalePref } from "./locales";
import {
  FALLBACK_LOCALE,
  isAppLocale,
  matchSystemLocale,
  type AppLocale,
} from "./locales";

export type { AppLocale, UiLocalePref } from "./locales";

export type InterpVars = Record<string, string | number>;

export function resolveLocale(pref: UiLocalePref): AppLocale {
  if (isAppLocale(pref)) return pref;
  try {
    const lang = Intl.DateTimeFormat().resolvedOptions().locale;
    return matchSystemLocale(lang);
  } catch {
    return FALLBACK_LOCALE;
  }
}

export function interpolate(template: string, vars?: InterpVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`,
  );
}

export function lookupPath(tree: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = tree;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Collect leaf string paths for symmetry tests. */
export function leafPaths(tree: unknown, prefix = ""): string[] {
  if (typeof tree === "string") return prefix ? [prefix] : [];
  if (!tree || typeof tree !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(tree as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${k}` : k;
    out.push(...leafPaths(v, next));
  }
  return out;
}
