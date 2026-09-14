import { catalogs } from "./catalogs";
import { FALLBACK_LOCALE, type AppLocale } from "./locales";
import {
  interpolate,
  leafPaths,
  lookupPath,
  type InterpVars,
} from "./types";

type Join<K, P extends string> = K extends string
  ? P extends ""
    ? K
    : `${P}.${K}`
  : never;

type Leaves<T, P extends string = ""> = T extends string
  ? P
  : T extends Record<string, unknown>
    ? { [K in keyof T]-?: Leaves<T[K], Join<K, P>> }[keyof T]
    : never;

export type MessageKey = Leaves<(typeof catalogs)[typeof FALLBACK_LOCALE]>;

export function catalogKeys(locale: AppLocale = FALLBACK_LOCALE): string[] {
  return leafPaths(catalogs[locale]);
}

export function tStatic(
  locale: AppLocale,
  key: string,
  vars?: InterpVars,
): string {
  const hit =
    lookupPath(catalogs[locale], key) ??
    lookupPath(catalogs[FALLBACK_LOCALE], key) ??
    key;
  return interpolate(hit, vars);
}

export type TFunction = (key: MessageKey | string, vars?: InterpVars) => string;
