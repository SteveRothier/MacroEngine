/** Nested app preference groups (mirrored from engine `AppSettings`). */

export type AccueilSortBy = "order" | "name" | "type" | "status";
export type AccueilSortDir = "asc" | "desc";
export type AccueilFilter = "all" | "favorites" | "recent" | "scripts";
export type StartupView = "home" | "lastDocument";
export type UiDensity = "comfortable" | "compact";
export type AccentTheme = "default" | "blue" | "teal";

export type AccueilPrefs = {
  defaultSortBy: AccueilSortBy;
  defaultSortDir: AccueilSortDir;
  defaultFilter: AccueilFilter;
  rememberCollapsedSections: boolean;
  openOnSingleClick: boolean;
  confirmTrash: boolean;
  confirmDeleteFolder: boolean;
  showScriptsInAll: boolean;
  syncLibrarySortOnReorder: boolean;
  doubleClickDelayMs: number;
  dragThresholdPx: number;
};

export type ShellPrefs = {
  startupView: StartupView;
  restoreWorkspaceTabs: boolean;
  minimizeToTray: boolean;
  showSessionPill: boolean;
  commandPaletteEnabled: boolean;
  recentListMax: number;
  warnOnUnsavedQuit: boolean;
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
  syncLibrarySortOnReorder: true,
  doubleClickDelayMs: 300,
  dragThresholdPx: 6,
};

export const DEFAULT_SHELL_PREFS: ShellPrefs = {
  startupView: "home",
  restoreWorkspaceTabs: true,
  minimizeToTray: false,
  showSessionPill: true,
  commandPaletteEnabled: true,
  recentListMax: 12,
  warnOnUnsavedQuit: true,
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
  return { ...DEFAULT_ACCUEIL_PREFS, ...partial };
}

export function mergeShellPrefs(partial?: Partial<ShellPrefs> | null): ShellPrefs {
  return { ...DEFAULT_SHELL_PREFS, ...partial };
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
  return { ...DEFAULT_SCRIPTS_PREFS, ...partial };
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
