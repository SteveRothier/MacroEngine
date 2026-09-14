import { catalogs } from "./catalogs";
import {
  interpolate,
  leafPaths,
  lookupPath,
  type AppLocale,
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

export type MessageKey = Leaves<(typeof catalogs)["fr"]>;

export function catalogKeys(locale: AppLocale = "fr"): string[] {
  return leafPaths(catalogs[locale]);
}

export function tStatic(
  locale: AppLocale,
  key: string,
  vars?: InterpVars,
): string {
  const hit =
    lookupPath(catalogs[locale], key) ??
    lookupPath(catalogs.fr, key) ??
    key;
  return interpolate(hit, vars);
}

export type TFunction = (key: MessageKey | string, vars?: InterpVars) => string;
