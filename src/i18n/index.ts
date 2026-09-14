/**
 * Lightweight FR/EN i18n for Caster.
 *
 * Tray / Rust menu strings stay French in this lot; recreate the tray menu
 * from the front-end (or pass locale into Rust) in a follow-up.
 */
export type { AppLocale, UiLocalePref, InterpVars } from "./types";
export { resolveLocale, interpolate, leafPaths, lookupPath } from "./types";
export { catalogs } from "./catalogs";
export { tStatic, catalogKeys, type MessageKey, type TFunction } from "./t";
export { LocaleProvider, useLocale, useT } from "./context";
