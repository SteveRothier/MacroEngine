import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  AppWindow,
  Database,
  Keyboard,
  RefreshCw,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { HotkeySettings } from "./HotkeySettings";
import {
  DEFAULT_CLICKER,
  DEFAULT_PROCESS_FILTER,
  type DisplayDto,
  type ProcessFilter,
} from "../clicker/clickerTypes";
import { useClickerSettingsApi } from "../clicker/useClickerSettings";
import { Select, useToast } from "../ui/v2";
import { confirmChoice } from "../ui";
import type { HotkeyBindings } from "../macros/types";
import type { ThemeMode } from "../theme";
import type { SettingsSection } from "../app/types";
import {
  mergeAutomationPrefs,
  mergeShellPrefs,
  type AutomationPrefs,
  type ShellPrefs,
  type StartupView,
  type UiLocale,
} from "./settingsTypes";
import { useT } from "../i18n";

type AppPaths = {
  configDir: string;
  settingsPath: string;
  logDir: string;
  version: string;
};

type Props = {
  section: SettingsSection;
  onSectionChange: (s: SettingsSection) => void;
  theme: ThemeMode;
  onThemeChange: (t: ThemeMode) => void;
  onHotkeysChange: (h: HotkeyBindings) => void;
  advanced: boolean;
  onAdvancedChange: (v: boolean) => void;
  running?: boolean;
  journalOpen: boolean;
  onJournalOpenChange: (v: boolean) => void;
  onShellPrefsChange?: (prefs: ShellPrefs) => void;
  onAutomationPrefsChange?: (prefs: AutomationPrefs) => void;
};

function displayOptionLabel(d: DisplayDto, primarySuffix: string): string {
  const scale = Math.round(d.scaleFactor * 100);
  const primary = d.isPrimary ? primarySuffix : "";
  return `${d.width}×${d.height} · ${scale} %${primary}`;
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="v2-settings-group">
      <h3 className="v2-settings-group-title">{title}</h3>
      <div className="v2-settings-group-body">{children}</div>
    </section>
  );
}

function SettingsToggle({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <label className={["v2-switch", disabled ? "is-disabled" : ""].filter(Boolean).join(" ")}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="v2-switch-track" aria-hidden />
    </label>
  );
}

export function SettingsView({
  section,
  onSectionChange,
  theme,
  onThemeChange,
  onHotkeysChange,
  advanced,
  onAdvancedChange,
  running = false,
  journalOpen,
  onJournalOpenChange,
  onShellPrefsChange,
  onAutomationPrefsChange,
}: Props) {
  const toast = useToast();
  const t = useT();
  const SECTIONS: { id: SettingsSection; labelKey: string; icon: LucideIcon }[] = [
    { id: "application", labelKey: "settings.rail.application", icon: AppWindow },
    { id: "hotkeys", labelKey: "settings.rail.hotkeys", icon: Keyboard },
    { id: "security", labelKey: "settings.rail.security", icon: Shield },
    { id: "data", labelKey: "settings.rail.data", icon: Database },
  ];
  const { loadSettings, saveBundle } = useClickerSettingsApi();
  const [processFilter, setProcessFilter] = useState<ProcessFilter>(DEFAULT_PROCESS_FILTER);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(1);
  const [closeToTray, setCloseToTray] = useState(false);
  const [startWithWindows, setStartWithWindows] = useState(false);
  const [shell, setShell] = useState<ShellPrefs>(() => mergeShellPrefs());
  const [automation, setAutomation] = useState<AutomationPrefs>(() =>
    mergeAutomationPrefs(),
  );
  const [liveExes, setLiveExes] = useState<string[]>([]);
  const [foregroundExe, setForegroundExe] = useState<string | null>(null);
  const [processDraft, setProcessDraft] = useState("");
  const [displays, setDisplays] = useState<DisplayDto[]>([]);
  const [displayId, setDisplayId] = useState<string | null>(null);
  const [paths, setPaths] = useState<AppPaths | null>(null);
  const [metrics, setMetrics] = useState<{
    measuredCps: number;
    clicksEmitted: number;
  } | null>(null);

  const refreshDisplays = useCallback(() => {
    void invoke<DisplayDto[]>("list_displays")
      .then(setDisplays)
      .catch(() => setDisplays([]));
  }, []);

  const refreshLiveExes = useCallback(() => {
    void invoke<string[]>("list_visible_process_exes")
      .then(setLiveExes)
      .catch(() => setLiveExes([]));
  }, []);

  useEffect(() => {
    void loadSettings().then((s) => {
      if (!s) return;
      setProcessFilter(s.processFilter ?? DEFAULT_PROCESS_FILTER);
      setOverlayVisible(s.overlayVisible);
      setOverlayOpacity(s.overlayOpacity ?? 1);
      setDisplayId(s.displayId ?? null);
      setCloseToTray(!!s.closeToTray);
      setStartWithWindows(!!s.startWithWindows);
      const sh = mergeShellPrefs(s.shell);
      setShell(sh);
      onShellPrefsChange?.(sh);
      const au = mergeAutomationPrefs(s.automation);
      setAutomation(au);
      onAutomationPrefsChange?.(au);
    });
    refreshDisplays();
    void invoke<AppPaths>("get_paths")
      .then(setPaths)
      .catch(() => setPaths(null));
  }, [
    loadSettings,
    refreshDisplays,
    onShellPrefsChange,
    onAutomationPrefsChange,
  ]);

  useEffect(() => {
    void invoke<{ measuredCps: number; clicksEmitted: number }>("get_clicker_metrics")
      .then((m) => setMetrics({ measuredCps: m.measuredCps, clicksEmitted: m.clicksEmitted }))
      .catch(() => setMetrics(null));
  }, [running, section]);

  useEffect(() => {
    if (section !== "security") return;
    refreshLiveExes();
    const tick = () => {
      void invoke<string | null>("get_foreground_exe")
        .then(setForegroundExe)
        .catch(() => setForegroundExe(null));
    };
    tick();
    const id = window.setInterval(tick, 800);
    return () => window.clearInterval(id);
  }, [section, refreshLiveExes]);

  const persist = useCallback(
    async (partial: {
      processFilter?: ProcessFilter;
      overlayVisible?: boolean;
      overlayOpacity?: number;
      theme?: ThemeMode;
      displayId?: string | null;
      advancedUi?: boolean;
      journalOpen?: boolean;
      closeToTray?: boolean;
      startWithWindows?: boolean;
      shell?: ShellPrefs;
      automation?: AutomationPrefs;
    }) => {
      const current = await loadSettings();
      if (!current) return;
      await saveBundle({
        clicker: current.clicker,
        advancedUi: partial.advancedUi ?? current.advancedUi,
        overlayVisible: partial.overlayVisible ?? current.overlayVisible,
        overlayOpacity: partial.overlayOpacity ?? current.overlayOpacity,
        processFilter: partial.processFilter ?? current.processFilter ?? DEFAULT_PROCESS_FILTER,
        theme: partial.theme ?? current.theme ?? theme,
        displayId: partial.displayId !== undefined ? partial.displayId : current.displayId,
        journalOpen: partial.journalOpen ?? current.journalOpen,
        closeToTray: partial.closeToTray ?? current.closeToTray,
        startWithWindows: partial.startWithWindows ?? current.startWithWindows,
        shell: partial.shell,
        automation: partial.automation,
      });
    },
    [loadSettings, saveBundle, theme],
  );

  const persistShellPrefs = (patch: Partial<ShellPrefs>) => {
    const next = mergeShellPrefs({ ...shell, ...patch });
    setShell(next);
    onShellPrefsChange?.(next);
    void persist({ shell: next });
  };

  const persistAutomationPrefs = (patch: Partial<AutomationPrefs>) => {
    const next = mergeAutomationPrefs({ ...automation, ...patch });
    setAutomation(next);
    onAutomationPrefsChange?.(next);
    void persist({ automation: next });
  };

  const setAdvanced = (next: boolean) => {
    onAdvancedChange(next);
    void persist({ advancedUi: next });
  };

  const setTheme = (t: ThemeMode) => {
    onThemeChange(t);
    void persist({ theme: t });
  };

  const persistProcess = (next: ProcessFilter) => {
    setProcessFilter(next);
    void persist({ processFilter: next });
  };

  const resetClicker = async () => {
    const ok = await confirmChoice({
      title: t("settings.data.resetTitle"),
      message: t("settings.data.resetMessage"),
      confirmLabel: t("settings.data.reset"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (ok !== "confirm") return;
    try {
      const s = await loadSettings();
      if (!s) return;
      await saveBundle({
        clicker: DEFAULT_CLICKER,
        advancedUi: s.advancedUi,
        overlayVisible: s.overlayVisible,
        processFilter: s.processFilter ?? DEFAULT_PROCESS_FILTER,
        theme: s.theme ?? theme,
        displayId: s.displayId,
      });
      toast.success(t("settings.data.resetOk"));
    } catch {
      toast.error(t("settings.data.resetFail"));
    }
  };

  const exportSettings = async () => {
    try {
      const path = await save({
        defaultPath: "caster-settings.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await invoke("export_app_settings", { path });
      toast.success(t("settings.data.exportOk"));
    } catch {
      toast.error(t("settings.data.exportFail"));
    }
  };

  const importSettings = async () => {
    const ok = await confirmChoice({
      title: t("settings.data.importTitle"),
      message: t("settings.data.importMessage"),
      confirmLabel: t("common.import"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (ok !== "confirm") return;
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path || Array.isArray(path)) return;
      const next = await invoke<{
        overlayVisible?: boolean;
        overlayOpacity?: number;
        closeToTray?: boolean;
        startWithWindows?: boolean;
        theme?: ThemeMode;
        journalOpen?: boolean;
      }>("import_app_settings", { path });
      if (next.theme) onThemeChange(next.theme);
      setOverlayVisible(!!next.overlayVisible);
      setOverlayOpacity(next.overlayOpacity ?? 1);
      setCloseToTray(!!next.closeToTray);
      setStartWithWindows(!!next.startWithWindows);
      if (typeof next.journalOpen === "boolean") {
        onJournalOpenChange(next.journalOpen);
      }
      toast.success(t("settings.data.importOk"));
    } catch {
      toast.error(t("settings.data.importFail"));
    }
  };

  const purgeTrash = async () => {
    const ok = await confirmChoice({
      title: t("settings.data.purgeTitle"),
      message: t("settings.data.purgeMessage"),
      confirmLabel: t("settings.data.purge"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (ok !== "confirm") return;
    try {
      const n = await invoke<number>("purge_library_trash_cmd");
      toast.success(n > 0 ? t("settings.data.purgeOk", { n }) : t("settings.data.purgeEmpty"));
    } catch {
      toast.error(t("settings.data.purgeFail"));
    }
  };

  return (
    <div className="v2-page">
      <div className="v2-settings-layout">
        <nav className="v2-settings-rail" aria-label={t("settings.railAria")}>
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                className={[
                  "v2-settings-rail-item",
                  section === s.id ? "active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onSectionChange(s.id)}
              >
                <Icon size={16} aria-hidden className="v2-settings-rail-icon" />
                <span>{t(s.labelKey)}</span>
              </button>
            );
          })}
        </nav>
        <div className="v2-settings-pane">
          <div className="v2-settings-pane-inner">
            {section === "application" ? (
              <>
                <h2 className="v2-settings-pane-title">{t("settings.application.paneTitle")}</h2>
                <p className="v2-settings-pane-hint">{t("settings.application.paneHint")}</p>
                <SettingsGroup title={t("settings.application.groupStartup")}>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.startWithWindows")}</span>
                      <p>{t("settings.application.startWithWindowsHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={startWithWindows}
                        ariaLabel={t("settings.application.startWithWindows")}
                        onChange={(checked) => {
                          setStartWithWindows(checked);
                          void persist({ startWithWindows: checked });
                        }}
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.startInTray")}</span>
                      <p>{t("settings.application.startInTrayHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={shell.minimizeToTray}
                        ariaLabel={t("settings.application.startInTray")}
                        onChange={(checked) =>
                          persistShellPrefs({ minimizeToTray: checked })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.closeToTray")}</span>
                      <p>{t("settings.application.closeToTrayHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={closeToTray}
                        ariaLabel={t("settings.application.closeToTray")}
                        onChange={(checked) => {
                          setCloseToTray(checked);
                          void persist({ closeToTray: checked });
                        }}
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.journalOnStart")}</span>
                      <p>{t("settings.application.journalOnStartHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={journalOpen}
                        ariaLabel={t("settings.application.journalOnStart")}
                        onChange={(checked) => {
                          onJournalOpenChange(checked);
                          void persist({ journalOpen: checked });
                        }}
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.startupView")}</span>
                      <p>{t("settings.application.startupViewHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <Select
                        className="v2-select"
                        value={shell.startupView}
                        ariaLabel={t("settings.application.startupView")}
                        options={[
                          { value: "home", label: t("common.home") },
                          { value: "lastDocument", label: t("common.lastDocument") },
                        ]}
                        onChange={(v) =>
                          persistShellPrefs({ startupView: v as StartupView })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.restoreTabs")}</span>
                      <p>{t("settings.application.restoreTabsHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={shell.restoreWorkspaceTabs}
                        ariaLabel={t("settings.application.restoreTabs")}
                        onChange={(checked) =>
                          persistShellPrefs({ restoreWorkspaceTabs: checked })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.alwaysOnTop")}</span>
                      <p>{t("settings.application.alwaysOnTopHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={shell.alwaysOnTop}
                        ariaLabel={t("settings.application.alwaysOnTop")}
                        onChange={(checked) =>
                          persistShellPrefs({ alwaysOnTop: checked })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.rememberBounds")}</span>
                      <p>{t("settings.application.rememberBoundsHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={shell.rememberWindowBounds}
                        ariaLabel={t("settings.application.rememberBounds")}
                        onChange={(checked) =>
                          persistShellPrefs({ rememberWindowBounds: checked })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.confirmQuit")}</span>
                      <p>{t("settings.application.confirmQuitHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={shell.confirmQuitIfRunning}
                        ariaLabel={t("settings.application.confirmQuit")}
                        onChange={(checked) =>
                          persistShellPrefs({ confirmQuitIfRunning: checked })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.goHomeAfterEmergency")}</span>
                      <p>{t("settings.application.goHomeAfterEmergencyHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={shell.goHomeAfterEmergency}
                        ariaLabel={t("settings.application.goHomeAfterEmergency")}
                        onChange={(checked) =>
                          persistShellPrefs({ goHomeAfterEmergency: checked })
                        }
                      />
                    </div>
                  </div>
                </SettingsGroup>
                <SettingsGroup title={t("settings.application.groupNotifications")}>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.toastOnFinish")}</span>
                      <p>{t("settings.application.toastOnFinishHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={shell.toastOnFinish}
                        ariaLabel={t("settings.application.toastOnFinish")}
                        onChange={(checked) =>
                          persistShellPrefs({ toastOnFinish: checked })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.soundOnFinish")}</span>
                      <p>{t("settings.application.soundOnFinishHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={automation.soundOnFinish}
                        ariaLabel={t("settings.application.soundOnFinish")}
                        onChange={(checked) =>
                          persistAutomationPrefs({ soundOnFinish: checked })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.focusJournal")}</span>
                      <p>{t("settings.application.focusJournalHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={automation.focusFollowsRun}
                        ariaLabel={t("settings.application.focusJournal")}
                        onChange={(checked) =>
                          persistAutomationPrefs({ focusFollowsRun: checked })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.trayRelaunch")}</span>
                      <p>{t("settings.application.trayRelaunchHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={shell.trayRelaunchLast}
                        ariaLabel={t("settings.application.trayRelaunch")}
                        onChange={(checked) =>
                          persistShellPrefs({ trayRelaunchLast: checked })
                        }
                      />
                    </div>
                  </div>
                </SettingsGroup>
                <SettingsGroup title={t("settings.application.groupAppearance")}>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.theme")}</span>
                      <p>{t("settings.application.themeHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <div className="v2-segmented" role="group" aria-label={t("settings.application.themeAria")}>
                        {(
                          [
                            ["light", "common.light"],
                            ["dark", "common.dark"],
                            ["system", "common.system"],
                          ] as const
                        ).map(([value, labelKey]) => (
                          <button
                            key={value}
                            type="button"
                            className={[
                              "v2-segmented-btn",
                              theme === value ? "active" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onClick={() => setTheme(value)}
                          >
                            {t(labelKey)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="v2-settings-row v2-settings-row--swatches">
                    <div className="v2-theme-preview">
                      <button
                        type="button"
                        className={[
                          "v2-theme-swatch",
                          "v2-theme-swatch--dark",
                          theme === "dark" ? "selected" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-label={t("settings.application.themeDarkAria")}
                        onClick={() => setTheme("dark")}
                      />
                      <button
                        type="button"
                        className={[
                          "v2-theme-swatch",
                          "v2-theme-swatch--light",
                          theme === "light" ? "selected" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-label={t("settings.application.themeLightAria")}
                        onClick={() => setTheme("light")}
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.hud")}</span>
                      <p>{t("settings.application.hudHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={overlayVisible}
                        ariaLabel={t("settings.application.hud")}
                        onChange={(checked) => {
                          setOverlayVisible(checked);
                          void invoke("set_overlay_visible", { visible: checked });
                          void persist({ overlayVisible: checked });
                        }}
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.hudOpacity")}</span>
                    </div>
                    <div className="v2-settings-row-control v2-settings-row-control--grow">
                      <label className="v2-settings-range">
                        <input
                          type="range"
                          min={40}
                          max={100}
                          value={Math.round(overlayOpacity * 100)}
                          onChange={(e) => {
                            const next = Number(e.target.value) / 100;
                            setOverlayOpacity(next);
                            void persist({ overlayOpacity: next });
                          }}
                        />
                        <span>{Math.round(overlayOpacity * 100)} %</span>
                      </label>
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.language")}</span>
                      <p>{t("settings.application.languageHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <Select
                        className="v2-select"
                        value={shell.uiLocale}
                        ariaLabel={t("settings.application.language")}
                        options={[
                          { value: "system", label: t("common.system") },
                          { value: "fr", label: t("common.french") },
                          { value: "en", label: t("common.english") },
                        ]}
                        onChange={(v) =>
                          persistShellPrefs({ uiLocale: v as UiLocale })
                        }
                      />
                    </div>
                  </div>
                </SettingsGroup>
                <SettingsGroup title={t("settings.application.groupClicker")}>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.clickerMode")}</span>
                      <p>{t("settings.application.clickerModeHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <div className="v2-segmented" role="group" aria-label={t("settings.application.clickerModeAria")}>
                        <button
                          type="button"
                          className={["v2-segmented-btn", !advanced ? "active" : ""]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => setAdvanced(false)}
                        >
                          {t("common.simple")}
                        </button>
                        <button
                          type="button"
                          className={["v2-segmented-btn", advanced ? "active" : ""]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => setAdvanced(true)}
                        >
                          {t("common.advanced")}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.state")}</span>
                    </div>
                    <div className="v2-settings-row-control">
                      <strong className="v2-settings-status">
                        {running ? t("common.running") : t("common.inactive")}
                      </strong>
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.application.liveMetrics")}</span>
                    </div>
                    <div className="v2-settings-row-control">
                      <code className="v2-settings-mono">
                        {metrics
                          ? t("settings.application.clicksMetric", {
                              cps: metrics.measuredCps.toFixed(1),
                              n: metrics.clicksEmitted,
                            })
                          : t("common.empty")}
                      </code>
                    </div>
                  </div>
                </SettingsGroup>
              </>
            ) : null}

            {section === "hotkeys" ? (
              <>
                <h2 className="v2-settings-pane-title">{t("settings.hotkeys.paneTitle")}</h2>
                <p className="v2-settings-pane-hint">
                  {t("settings.hotkeys.paneHint")}
                </p>
                <SettingsGroup title={t("settings.hotkeys.groupTitle")}>
                  <HotkeySettings onBindingsChange={onHotkeysChange} />
                </SettingsGroup>
              </>
            ) : null}

            {section === "security" ? (
              <>
                <h2 className="v2-settings-pane-title">{t("settings.security.paneTitle")}</h2>
                <p className="v2-settings-pane-hint">
                  {t("settings.security.paneHint")}
                  {running ? t("settings.security.filterDisabled") : ""}
                </p>
                <SettingsGroup title={t("settings.security.filterGroup")}>
                  <p className="v2-settings-group-hint">
                    {t("settings.security.filterIntro")}
                  </p>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.security.foreground")}</span>
                    </div>
                    <div className="v2-settings-row-control">
                      <code className="v2-settings-mono">{foregroundExe ?? t("common.empty")}</code>
                      <button
                        type="button"
                        className="v2-btn v2-btn-ghost"
                        title={t("settings.security.refreshProcesses")}
                        onClick={refreshLiveExes}
                      >
                        <RefreshCw size={14} aria-hidden />
                      </button>
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.security.enableFilter")}</span>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={processFilter.enabled}
                        disabled={running}
                        ariaLabel={t("settings.security.enableFilter")}
                        onChange={(checked) =>
                          persistProcess({
                            ...processFilter,
                            enabled: checked,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.security.mode")}</span>
                      <p>{t("settings.security.modeHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <Select
                        className="v2-select"
                        value={processFilter.mode}
                        disabled={running || !processFilter.enabled}
                        options={[
                          {
                            value: "deny",
                            label: t("settings.security.modeDeny"),
                          },
                          {
                            value: "allow",
                            label: t("settings.security.modeAllow"),
                          },
                        ]}
                        onChange={(v) =>
                          persistProcess({
                            ...processFilter,
                            mode: v as ProcessFilter["mode"],
                          })
                        }
                      />
                    </div>
                  </div>
                  {liveExes.length > 0 ? (
                    <div className="v2-settings-row v2-settings-row--stack">
                      <div className="v2-settings-row-label">
                        <span>{t("settings.security.addFromVisible")}</span>
                      </div>
                      <div className="v2-settings-row-control v2-settings-row-control--full">
                        <Select
                          className="v2-select"
                          value=""
                          disabled={running || !processFilter.enabled}
                          options={[
                            { value: "", label: t("settings.security.choose") },
                            ...liveExes
                              .filter((x) => !processFilter.names.includes(x))
                              .map((x) => ({ value: x, label: x })),
                          ]}
                          onChange={(name) => {
                            if (!name || processFilter.names.includes(name)) return;
                            persistProcess({
                              ...processFilter,
                              names: [...processFilter.names, name],
                            });
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="v2-settings-row v2-settings-row--stack">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.security.addManual")}</span>
                    </div>
                    <div className="v2-settings-row-control v2-settings-row-control--full">
                      <div className="v2-field-row">
                        <input
                          value={processDraft}
                          disabled={running || !processFilter.enabled}
                          onChange={(e) => setProcessDraft(e.target.value)}
                          placeholder="chrome.exe"
                        />
                        <button
                          type="button"
                          className="v2-btn"
                          disabled={
                            running ||
                            !processFilter.enabled ||
                            !processDraft.trim()
                          }
                          onClick={() => {
                            const n = processDraft.trim().toLowerCase();
                            if (!n || processFilter.names.includes(n)) return;
                            setProcessDraft("");
                            persistProcess({
                              ...processFilter,
                              names: [...processFilter.names, n],
                            });
                          }}
                        >
                          {t("settings.security.add")}
                        </button>
                      </div>
                    </div>
                  </div>
                  {processFilter.names.length === 0 ? (
                    <p className="v2-settings-group-hint">{t("settings.security.noneListed")}</p>
                  ) : (
                    <ul className="v2-settings-process-list">
                      {processFilter.names.map((n) => (
                        <li key={n}>
                          <code>{n}</code>
                          <button
                            type="button"
                            className="v2-btn v2-btn-ghost"
                            disabled={running}
                            onClick={() =>
                              persistProcess({
                                ...processFilter,
                                names: processFilter.names.filter((x) => x !== n),
                              })
                            }
                          >
                            {t("settings.security.remove")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </SettingsGroup>
                <SettingsGroup title={t("settings.security.displayGroup")}>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.security.monitor")}</span>
                    </div>
                    <div className="v2-settings-row-control v2-settings-row-control--grow">
                      <div className="v2-field-row">
                        <Select
                          className="v2-select"
                          value={displayId ?? ""}
                          options={[
                            { value: "", label: t("settings.security.primaryDefault") },
                            ...displays.map((d) => ({
                              value: d.id,
                              label: displayOptionLabel(d, t("settings.security.primarySuffix")),
                            })),
                          ]}
                          onChange={(v) => {
                            const id = v || null;
                            setDisplayId(id);
                            void invoke("set_active_display", { displayId: id });
                            void persist({ displayId: id });
                          }}
                        />
                        <button
                          type="button"
                          className="v2-btn v2-btn-ghost"
                          title={t("settings.security.refreshList")}
                          onClick={refreshDisplays}
                        >
                          <RefreshCw size={14} aria-hidden />
                        </button>
                      </div>
                    </div>
                  </div>
                </SettingsGroup>
              </>
            ) : null}

            {section === "data" ? (
              <>
                <h2 className="v2-settings-pane-title">{t("settings.data.paneTitle")}</h2>
                <p className="v2-settings-pane-hint">{t("settings.data.paneHint")}</p>
                <SettingsGroup title={t("settings.data.actionsGroup")}>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.data.openConfig")}</span>
                      <p>
                        {t("settings.data.openConfigHint")}
                        {paths?.settingsPath ? (
                          <>
                            {" "}
                            (
                            <code className="v2-settings-mono">
                              {paths.settingsPath}
                            </code>
                            )
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="v2-settings-row-control">
                      <button
                        type="button"
                        className="v2-btn v2-btn-ghost"
                        disabled={!paths}
                        onClick={() =>
                          paths && void invoke("open_path", { path: paths.configDir })
                        }
                      >
                        {t("common.open")}
                      </button>
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.data.openLogs")}</span>
                    </div>
                    <div className="v2-settings-row-control">
                      <button
                        type="button"
                        className="v2-btn v2-btn-ghost"
                        disabled={!paths}
                        onClick={() =>
                          paths && void invoke("open_path", { path: paths.logDir })
                        }
                      >
                        {t("common.open")}
                      </button>
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.data.exportImport")}</span>
                      <p>{t("settings.data.exportImportHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <button
                        type="button"
                        className="v2-btn"
                        onClick={() => void exportSettings()}
                      >
                        {t("common.export")}
                      </button>
                      <button
                        type="button"
                        className="v2-btn v2-btn-ghost"
                        onClick={() => void importSettings()}
                      >
                        {t("common.import")}
                      </button>
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.data.purgeTrash")}</span>
                      <p>{t("settings.data.purgeTrashHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <button
                        type="button"
                        className="v2-btn v2-btn-danger-ghost"
                        onClick={() => void purgeTrash()}
                      >
                        {t("settings.data.purge")}
                      </button>
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{t("settings.data.resetClicker")}</span>
                      <p>{t("settings.data.resetClickerHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <button
                        type="button"
                        className="v2-btn v2-btn-danger-ghost"
                        disabled={running}
                        onClick={() => void resetClicker()}
                      >
                        {t("settings.data.reset")}
                      </button>
                    </div>
                  </div>
                </SettingsGroup>
                <SettingsGroup title={t("settings.data.aboutGroup")}>
                  <div className="v2-settings-about">
                    <strong>Caster</strong>
                    <p>{t("settings.data.aboutBlurb")}</p>
                    <dl className="v2-settings-about-meta">
                      <div>
                        <dt>{t("settings.data.version")}</dt>
                        <dd>{paths?.version ?? t("common.empty")}</dd>
                      </div>
                      <div>
                        <dt>{t("settings.data.license")}</dt>
                        <dd>MIT</dd>
                      </div>
                      <div>
                        <dt>{t("settings.data.platform")}</dt>
                        <dd>Windows</dd>
                      </div>
                    </dl>
                    <p className="v2-settings-group-hint">
                      {t("settings.data.aboutFooter")}
                    </p>
                  </div>
                </SettingsGroup>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
