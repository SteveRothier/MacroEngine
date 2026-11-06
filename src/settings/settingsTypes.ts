import type { UiLocalePref } from "../i18n/locales";

/** Nested app preference groups (mirrored from engine `AppSettings`). */

export type StartupView = "home" | "lastDocument";
export type UiDensity = "comfortable" | "compact";
export type AccentTheme = "lavender" | "default" | "blue" | "teal";
export type UiLocale = UiLocalePref;

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Library confirmations + visibility prefs (legacy name `accueil`). */
export type AccueilPrefs = {
  rememberCollapsedSections: boolean;
  openOnSingleClick: boolean;
  confirmTrash: boolean;
  confirmDeleteFolder: boolean;
  showScriptsInAll: boolean;
  /** When false, script modules are hidden from library lists. */
  showModulesInAll: boolean;
  /** Script languages hidden from library (`javascript`, `typescript`). */
  hideScriptLanguages: string[];
  syncLibrarySortOnReorder: boolean;
  dragThresholdPx: number;
};

export type ShellPrefs = {
  startupView: StartupView;
  restoreWorkspaceTabs: boolean;
  /** Launch hidden in tray when started with Windows (not minimize-to-tray). */
  startInTray: boolean;
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

export const DEFAULT_ACCUEIL_PREFS: AccueilPrefs = {
  rememberCollapsedSections: true,
  openOnSingleClick: true,
  confirmTrash: true,
  confirmDeleteFolder: true,
  showScriptsInAll: true,
  showModulesInAll: false,
  hideScriptLanguages: [],
  syncLibrarySortOnReorder: true,
  dragThresholdPx: 6,
};

export const DEFAULT_SHELL_PREFS: ShellPrefs = {
  startupView: "lastDocument",
  restoreWorkspaceTabs: true,
  startInTray: false,
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
  accent: "lavender",
};

export function mergeAccueilPrefs(
  partial?: Partial<AccueilPrefs> | null,
): AccueilPrefs {
  const merged = { ...DEFAULT_ACCUEIL_PREFS, ...partial };
  // Drop legacy Accueil-only fields still present in older settings.json.
  const legacy = merged as AccueilPrefs & {
    doubleClickDelayMs?: number;
    defaultSortBy?: unknown;
    defaultSortDir?: unknown;
    defaultFilter?: unknown;
    accueilLayout?: unknown;
  };
  delete legacy.doubleClickDelayMs;
  delete legacy.defaultSortBy;
  delete legacy.defaultSortDir;
  delete legacy.defaultFilter;
  delete legacy.accueilLayout;
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
  const merged = { ...DEFAULT_CONFIRMATIONS_PREFS, ...partial };
  // Drop legacy purgeTrash (soft-trash removed).
  delete (merged as ConfirmationsPrefs & { purgeTrash?: unknown }).purgeTrash;
  return merged;
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
  const merged = { ...DEFAULT_APPEARANCE_PREFS, ...partial };
  const accent = merged.accent as string;
  if (
    accent !== "lavender" &&
    accent !== "default" &&
    accent !== "blue" &&
    accent !== "teal"
  ) {
    merged.accent = "lavender";
  }
  return merged;
}
