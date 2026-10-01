import type { UiLocalePref } from "../i18n/locales";

/** Nested app preference groups (mirrored from engine `AppSettings`). */

export type AccueilSortBy = "order" | "name" | "type" | "status" | "lastRun";
export type AccueilSortDir = "asc" | "desc";
export type AccueilFilter = "all" | "favorites" | "recent";
export type StartupView = "home" | "lastDocument";
export type UiDensity = "comfortable" | "compact";
export type AccentTheme = "default" | "blue" | "teal";
export type UiLocale = UiLocalePref;

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AccueilPrefs = {
  defaultSortBy: AccueilSortBy;
  defaultSortDir: AccueilSortDir;
  defaultFilter: AccueilFilter;
  rememberCollapsedSections: boolean;
  openOnSingleClick: boolean;
  confirmTrash: boolean;
  confirmDeleteFolder: boolean;
  showScriptsInAll: boolean;
  /** When false, script modules are hidden from Accueil lists. */
  showModulesInAll: boolean;
  /** Script languages hidden from Accueil (`javascript`, `typescript`). */
  hideScriptLanguages: string[];
  syncLibrarySortOnReorder: boolean;
  dragThresholdPx: number;
};

export type ShellPrefs = {
  startupView: StartupView;
  restoreWorkspaceTabs: boolean;
  /** Launch hidden in tray when started with Windows (not minimize-to-tray). */
  startInTray: boolean;
  showSessionPill: boolean;
  recentListMax: number;
  warnOnUnsavedQuit: boolean;
  alwaysOnTop: boolean;
  confirmQuitIfRunning: boolean;
  goHomeAfterEmergency: boolean;
  toastOnFinish: boolean;
  trayRelaunchLast: boolean;
  rememberWindowBounds: boolean;
  windowBounds: WindowBounds | null;
  uiLocale: UiLocale;
  lastClickerId: string | null;
  lastMacroId: string | null;
  lastScriptId: string | null;
  /** Max retained journal lines (40–500, default 80). */
  journalMaxLines: number;
};

export type AutomationPrefs = {
  confirmLaunchFromHome: boolean;
  confirmStopSession: boolean;
  autoSaveBeforeRun: boolean;
  runFromRequiresSelection: boolean;
  focusFollowsRun: boolean;
  soundOnFinish: boolean;
};

export type ConfirmationsPrefs = {
  deleteAction: boolean;
  closeDirtyTab: boolean;
  purgeTrash: boolean;
  resetClicker: boolean;
};

export type ScriptsPrefs = {
  defaultTimeoutMs: number;
  clearConsoleOnRun: boolean;
  showPermBadgesOnHome: boolean;
};

export type AppearancePrefs = {
  density: UiDensity;
  reduceMotion: boolean;
  fontScale: number;
  accent: AccentTheme;
};

export type MaintenancePrefs = {
  autoPurgeTrashDays: number;
};

export const DEFAULT_ACCUEIL_PREFS: AccueilPrefs = {
  defaultSortBy: "order",
  defaultSortDir: "asc",
  defaultFilter: "all",
  rememberCollapsedSections: true,
  openOnSingleClick: false,
  confirmTrash: true,
  confirmDeleteFolder: true,
  showScriptsInAll: true,
  showModulesInAll: false,
  hideScriptLanguages: [],
  syncLibrarySortOnReorder: true,
  dragThresholdPx: 6,
};

export const DEFAULT_SHELL_PREFS: ShellPrefs = {
  startupView: "home",
  restoreWorkspaceTabs: true,
  startInTray: false,
  showSessionPill: true,
  recentListMax: 12,
  warnOnUnsavedQuit: true,
  alwaysOnTop: false,
  confirmQuitIfRunning: true,
  goHomeAfterEmergency: false,
  toastOnFinish: true,
  trayRelaunchLast: true,
  rememberWindowBounds: true,
  windowBounds: null,
  uiLocale: "system",
  lastClickerId: null,
  lastMacroId: null,
  lastScriptId: null,
  journalMaxLines: 80,
};

export const DEFAULT_AUTOMATION_PREFS: AutomationPrefs = {
  confirmLaunchFromHome: false,
  confirmStopSession: false,
  autoSaveBeforeRun: true,
  runFromRequiresSelection: true,
  focusFollowsRun: false,
  soundOnFinish: false,
};

export const DEFAULT_CONFIRMATIONS_PREFS: ConfirmationsPrefs = {
  deleteAction: true,
  closeDirtyTab: true,
  purgeTrash: true,
  resetClicker: true,
};

export const DEFAULT_SCRIPTS_PREFS: ScriptsPrefs = {
  defaultTimeoutMs: 0,
  clearConsoleOnRun: false,
  showPermBadgesOnHome: true,
};

export const DEFAULT_APPEARANCE_PREFS: AppearancePrefs = {
  density: "comfortable",
  reduceMotion: false,
  fontScale: 1,
  accent: "default",
};

export const DEFAULT_MAINTENANCE_PREFS: MaintenancePrefs = {
  autoPurgeTrashDays: 0,
};

export function mergeAccueilPrefs(
  partial?: Partial<AccueilPrefs> | null,
): AccueilPrefs {
  const merged = { ...DEFAULT_ACCUEIL_PREFS, ...partial };
  // Legacy: "scripts" filter pill removed from Accueil.
  if ((merged.defaultFilter as string) === "scripts") {
    merged.defaultFilter = "all";
  }
  // Purged FE field (still may exist in older settings.json / Rust).
  delete (merged as AccueilPrefs & { doubleClickDelayMs?: number })
    .doubleClickDelayMs;
  return merged;
}

export function mergeShellPrefs(partial?: Partial<ShellPrefs> | null): ShellPrefs {
  const legacy = partial as
    | (Partial<ShellPrefs> & { minimizeToTray?: boolean })
    | null
    | undefined;
  const merged = { ...DEFAULT_SHELL_PREFS, ...partial };
  if (legacy && legacy.startInTray === undefined && typeof legacy.minimizeToTray === "boolean") {
    merged.startInTray = legacy.minimizeToTray;
  }
  delete (merged as ShellPrefs & { minimizeToTray?: boolean }).minimizeToTray;
  if (partial && "windowBounds" in partial) {
    merged.windowBounds = partial.windowBounds ?? null;
  }
  const n = Number(merged.journalMaxLines);
  merged.journalMaxLines = Number.isFinite(n)
    ? Math.min(500, Math.max(40, Math.round(n)))
    : DEFAULT_SHELL_PREFS.journalMaxLines;
  const recent = Number(merged.recentListMax);
  merged.recentListMax = Number.isFinite(recent)
    ? Math.min(50, Math.max(1, Math.round(recent)))
    : DEFAULT_SHELL_PREFS.recentListMax;
  return merged;
}

export function mergeAutomationPrefs(
  partial?: Partial<AutomationPrefs> | null,
): AutomationPrefs {
  return { ...DEFAULT_AUTOMATION_PREFS, ...partial };
}

export function mergeConfirmationsPrefs(
  partial?: Partial<ConfirmationsPrefs> | null,
): ConfirmationsPrefs {
  return { ...DEFAULT_CONFIRMATIONS_PREFS, ...partial };
}

export function mergeScriptsPrefs(
  partial?: Partial<ScriptsPrefs> | null,
): ScriptsPrefs {
  const merged = { ...DEFAULT_SCRIPTS_PREFS, ...partial };
  // Drop legacy pythonPath if present in persisted JSON.
  delete (merged as ScriptsPrefs & { pythonPath?: unknown }).pythonPath;
  return {
    defaultTimeoutMs: merged.defaultTimeoutMs,
    clearConsoleOnRun: merged.clearConsoleOnRun,
    showPermBadgesOnHome: merged.showPermBadgesOnHome,
  };
}

export function mergeAppearancePrefs(
  partial?: Partial<AppearancePrefs> | null,
): AppearancePrefs {
  return { ...DEFAULT_APPEARANCE_PREFS, ...partial };
}

export function mergeMaintenancePrefs(
  partial?: Partial<MaintenancePrefs> | null,
): MaintenancePrefs {
  return { ...DEFAULT_MAINTENANCE_PREFS, ...partial };
}
