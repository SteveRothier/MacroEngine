import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCUEIL_PREFS,
  DEFAULT_APPEARANCE_PREFS,
  DEFAULT_AUTOMATION_PREFS,
  DEFAULT_CONFIRMATIONS_PREFS,
  DEFAULT_MAINTENANCE_PREFS,
  DEFAULT_SCRIPTS_PREFS,
  DEFAULT_SHELL_PREFS,
  mergeAccueilPrefs,
  mergeAppearancePrefs,
  mergeAutomationPrefs,
  mergeConfirmationsPrefs,
  mergeMaintenancePrefs,
  mergeScriptsPrefs,
  mergeShellPrefs,
} from "./settingsTypes";

describe("settingsTypes defaults", () => {
  it("mergeAccueilPrefs fills missing fields", () => {
    expect(mergeAccueilPrefs({ openOnSingleClick: true })).toEqual({
      ...DEFAULT_ACCUEIL_PREFS,
      openOnSingleClick: true,
    });
  });

  it("mergeShellPrefs keeps command palette on by default", () => {
    expect(mergeShellPrefs(undefined).commandPaletteEnabled).toBe(true);
    expect(mergeShellPrefs({ recentListMax: 20 }).recentListMax).toBe(20);
    expect(mergeShellPrefs({}).startupView).toBe(
      DEFAULT_SHELL_PREFS.startupView,
    );
  });

  it("mergeAutomationPrefs and confirmations", () => {
    expect(mergeAutomationPrefs({}).autoSaveBeforeRun).toBe(
      DEFAULT_AUTOMATION_PREFS.autoSaveBeforeRun,
    );
    expect(mergeConfirmationsPrefs({ purgeTrash: false }).purgeTrash).toBe(
      false,
    );
    expect(mergeConfirmationsPrefs(null).closeDirtyTab).toBe(
      DEFAULT_CONFIRMATIONS_PREFS.closeDirtyTab,
    );
  });

  it("merge scripts appearance maintenance", () => {
    expect(mergeScriptsPrefs({}).showPermBadgesOnHome).toBe(
      DEFAULT_SCRIPTS_PREFS.showPermBadgesOnHome,
    );
    expect(mergeAppearancePrefs({ density: "compact" }).density).toBe(
      "compact",
    );
    expect(mergeAppearancePrefs(undefined).accent).toBe(
      DEFAULT_APPEARANCE_PREFS.accent,
    );
    expect(mergeMaintenancePrefs({ autoPurgeTrashDays: 14 })).toEqual({
      ...DEFAULT_MAINTENANCE_PREFS,
      autoPurgeTrashDays: 14,
    });
  });
});
