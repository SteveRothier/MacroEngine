import { common } from "./common";
import { shell } from "./shell";
import { settings } from "./settings";
import { labels } from "./labels";
import { automations } from "./automations";
import { macros } from "./macros";
import { clicker } from "./clicker";
import { scripts } from "./scripts";
import { runs } from "./runs";
import type { AppLocale } from "../types";

/**
 * Merged message tree by locale.
 * Tray Rust strings stay French this release — see comment in src/i18n/index.ts.
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
} as const;

export type CatalogTree = (typeof catalogs)[AppLocale];
