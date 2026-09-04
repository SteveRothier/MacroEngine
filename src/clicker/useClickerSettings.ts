import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ThemeMode } from "../theme";
import {
  type AppSettings,
  type ClickerConfigPayload,
  type ProcessFilter,
  DEFAULT_PROCESS_FILTER,
} from "./clickerTypes";

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
