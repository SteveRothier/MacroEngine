/**
 * @deprecated Prefer `useT()` / `tStatic` from `src/i18n`.
 * Shim kept so older imports keep compiling during migration.
 */
import type { UiLocale } from "./settingsTypes";
import {
  resolveLocale,
  tStatic,
  type AppLocale as I18nAppLocale,
} from "../i18n";

export type AppLocale = I18nAppLocale;

export type ApplicationStringKey =
  | "paneTitle"
  | "paneHint"
  | "groupStartup"
  | "groupNotifications"
  | "groupAppearance"
  | "groupClicker"
  | "startWithWindows"
  | "startWithWindowsHint"
  | "startInTray"
  | "startInTrayHint"
  | "closeToTray"
  | "closeToTrayHint"
  | "journalOnStart"
  | "journalOnStartHint"
  | "startupView"
  | "startupViewHint"
  | "restoreTabs"
  | "restoreTabsHint"
  | "alwaysOnTop"
  | "alwaysOnTopHint"
  | "rememberBounds"
  | "rememberBoundsHint"
  | "confirmQuit"
  | "confirmQuitHint"
  | "goHomeAfterEmergency"
  | "goHomeAfterEmergencyHint"
  | "toastOnFinish"
  | "toastOnFinishHint"
  | "soundOnFinish"
  | "soundOnFinishHint"
  | "focusJournal"
  | "focusJournalHint"
  | "trayRelaunch"
  | "trayRelaunchHint"
  | "theme"
  | "themeHint"
  | "language"
  | "languageHint"
  | "hud"
  | "hudHint"
  | "hudOpacity"
  | "clickerMode"
  | "clickerModeHint"
  | "state"
  | "liveMetrics";

export function resolveAppLocale(pref: UiLocale): AppLocale {
  return resolveLocale(pref);
}

export function tApp(pref: UiLocale, key: ApplicationStringKey): string {
  return tStatic(resolveLocale(pref), `settings.application.${key}`);
}
