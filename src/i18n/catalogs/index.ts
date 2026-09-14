import { common } from "./common";
import { shell } from "./shell";
import { settings } from "./settings";
import { labels } from "./labels";
import { automations } from "./automations";
import { macros } from "./macros";
import { clicker } from "./clicker";
import { scripts } from "./scripts";
import { runs } from "./runs";
import type { AppLocale } from "../locales";

/**
 * Merged message tree by locale.
 * Tray Rust strings stay French this release — see comment in src/i18n/index.ts.
 *
 * When adding a locale to SUPPORTED_LOCALES, add a matching entry here
 * (defineCatalog already forces each namespace file to include that locale).
 */
export const catalogs = {
  fr: {
    common: common.fr,
    shell: shell.fr,
    settings: settings.fr,
    labels: labels.fr,
    automations: automations.fr,
    macros: macros.fr,
    clicker: clicker.fr,
    scripts: scripts.fr,
    runs: runs.fr,
  },
  en: {
    common: common.en,
    shell: shell.en,
    settings: settings.en,
    labels: labels.en,
    automations: automations.en,
    macros: macros.en,
    clicker: clicker.en,
    scripts: scripts.en,
    runs: runs.en,
  },
} satisfies Record<
  AppLocale,
  {
    common: (typeof common)[AppLocale];
    shell: (typeof shell)[AppLocale];
    settings: (typeof settings)[AppLocale];
    labels: (typeof labels)[AppLocale];
    automations: (typeof automations)[AppLocale];
    macros: (typeof macros)[AppLocale];
    clicker: (typeof clicker)[AppLocale];
    scripts: (typeof scripts)[AppLocale];
    runs: (typeof runs)[AppLocale];
  }
>;

export type CatalogTree = (typeof catalogs)[AppLocale];
