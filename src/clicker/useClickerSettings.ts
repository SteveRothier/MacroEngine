import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ThemeMode } from "../theme";
import {
  type AppSettings,
  type ClickerConfigPayload,
  type ProcessFilter,
  DEFAULT_PROCESS_FILTER,
} from "./clickerTypes";
import type {
  AccueilPrefs,
  AppearancePrefs,
  AutomationPrefs,
  ConfirmationsPrefs,
  MaintenancePrefs,
  ScriptsPrefs,
  ShellPrefs,
} from "../settings/settingsTypes";
import {
  mergeAccueilPrefs,
  mergeAppearancePrefs,
  mergeAutomationPrefs,
  mergeConfirmationsPrefs,
  mergeMaintenancePrefs,
  mergeScriptsPrefs,
  mergeShellPrefs,
} from "../settings/settingsTypes";

export type PersistBundle = {
  clicker: ClickerConfigPayload;
  advancedUi: boolean;
  overlayVisible: boolean;
  processFilter: ProcessFilter;
  theme: ThemeMode;
  displayId?: string | null;
  overlayOpacity?: number;
  journalOpen?: boolean;
  closeToTray?: boolean;
  startWithWindows?: boolean;
  sidebarCollapsed?: boolean;
  accueil?: Partial<AccueilPrefs>;
  shell?: Partial<ShellPrefs>;
  automation?: Partial<AutomationPrefs>;
  confirmations?: Partial<ConfirmationsPrefs>;
  scripts?: Partial<ScriptsPrefs>;
  appearance?: Partial<AppearancePrefs>;
  maintenance?: Partial<MaintenancePrefs>;
};

function mergeSettings(current: AppSettings, bundle: PersistBundle): AppSettings {
  return {
    ...current,
    clicker: bundle.clicker,
    advancedUi: bundle.advancedUi,
    overlayVisible: bundle.overlayVisible,
    overlayOpacity: bundle.overlayOpacity ?? current.overlayOpacity ?? 1,
    processFilter: bundle.processFilter ?? DEFAULT_PROCESS_FILTER,
    theme: bundle.theme,
    displayId: bundle.displayId !== undefined ? bundle.displayId : current.displayId,
    journalOpen: bundle.journalOpen ?? current.journalOpen,
    closeToTray: bundle.closeToTray ?? current.closeToTray,
    startWithWindows: bundle.startWithWindows ?? current.startWithWindows,
    sidebarCollapsed: bundle.sidebarCollapsed ?? current.sidebarCollapsed,
    accueil: mergeAccueilPrefs({
      ...current.accueil,
      ...bundle.accueil,
    }),
    shell: mergeShellPrefs({
      ...current.shell,
      ...bundle.shell,
    }),
    automation: mergeAutomationPrefs({
      ...current.automation,
      ...bundle.automation,
    }),
    confirmations: mergeConfirmationsPrefs({
      ...current.confirmations,
      ...bundle.confirmations,
    }),
    scripts: mergeScriptsPrefs({
      ...current.scripts,
      ...bundle.scripts,
    }),
    appearance: mergeAppearancePrefs({
      ...current.appearance,
      ...bundle.appearance,
    }),
    maintenance: mergeMaintenancePrefs({
      ...current.maintenance,
      ...bundle.maintenance,
    }),
    hotkeys: current.hotkeys,
  };
}

/** Shared load/save for Clicker operation + Paramètres tab. */
export function useClickerSettingsApi() {
  const loadSettings = useCallback(async (): Promise<AppSettings | null> => {
    try {
      return await invoke<AppSettings>("get_settings");
    } catch {
      return null;
    }
  }, []);

  const saveBundle = useCallback(async (bundle: PersistBundle): Promise<void> => {
    const current = await invoke<AppSettings>("get_settings");
    await invoke("save_app_settings", { settings: mergeSettings(current, bundle) });
  }, []);

  return { loadSettings, saveBundle };
}
