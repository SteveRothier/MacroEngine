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
import { tApp } from "./uiLocale";

const SECTIONS: {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "application", label: "Application", icon: AppWindow },
  { id: "hotkeys", label: "Raccourcis", icon: Keyboard },
  { id: "security", label: "Sécurité", icon: Shield },
  { id: "data", label: "Données", icon: Database },
];

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

function displayOptionLabel(d: DisplayDto): string {
  const scale = Math.round(d.scaleFactor * 100);
  const primary = d.isPrimary ? " · primaire" : "";
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
      title: "Réinitialiser le clicker",
      message: "Restaurer la configuration clicker par défaut ?",
      confirmLabel: "Réinitialiser",
      cancelLabel: "Annuler",
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
      toast.success("Réglages clicker restaurés");
    } catch {
      toast.error("Échec de la réinitialisation");
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
      toast.success("Configuration exportée");
    } catch {
      toast.error("Échec de l’export");
    }
  };

  const importSettings = async () => {
    const ok = await confirmChoice({
      title: "Importer une configuration",
      message: "Cela écrase settings.json (y compris le clicker). Continuer ?",
      confirmLabel: "Importer",
      cancelLabel: "Annuler",
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
      toast.success("Configuration importée");
    } catch {
      toast.error("Échec de l’import");
    }
  };

  const purgeTrash = async () => {
    const ok = await confirmChoice({
      title: "Vider la corbeille",
      message: "Les automations en corbeille seront supprimées définitivement.",
      confirmLabel: "Vider",
      cancelLabel: "Annuler",
      danger: true,
    });
    if (ok !== "confirm") return;
    try {
      const n = await invoke<number>("purge_library_trash_cmd");
      toast.success(n > 0 ? `${n} élément(s) supprimé(s)` : "Corbeille déjà vide");
    } catch {
      toast.error("Échec du vidage");
    }
  };

  return (
    <div className="v2-page">
      <div className="v2-settings-layout">
        <nav className="v2-settings-rail" aria-label="Sections paramètres">
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
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="v2-settings-pane">
          <div className="v2-settings-pane-inner">
            {section === "application" ? (
              <>
                <h2 className="v2-settings-pane-title">{tApp(shell.uiLocale, "paneTitle")}</h2>
                <p className="v2-settings-pane-hint">{tApp(shell.uiLocale, "paneHint")}</p>
                <SettingsGroup title={tApp(shell.uiLocale, "groupStartup")}>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "startWithWindows")}</span>
                      <p>{tApp(shell.uiLocale, "startWithWindowsHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={startWithWindows}
                        ariaLabel={tApp(shell.uiLocale, "startWithWindows")}
                        onChange={(checked) => {
                          setStartWithWindows(checked);
                          void persist({ startWithWindows: checked });
                        }}
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "startInTray")}</span>
                      <p>{tApp(shell.uiLocale, "startInTrayHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={shell.minimizeToTray}
                        ariaLabel={tApp(shell.uiLocale, "startInTray")}
                        onChange={(checked) =>
                          persistShellPrefs({ minimizeToTray: checked })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "closeToTray")}</span>
                      <p>{tApp(shell.uiLocale, "closeToTrayHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={closeToTray}
                        ariaLabel={tApp(shell.uiLocale, "closeToTray")}
                        onChange={(checked) => {
                          setCloseToTray(checked);
                          void persist({ closeToTray: checked });
                        }}
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "journalOnStart")}</span>
                      <p>{tApp(shell.uiLocale, "journalOnStartHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={journalOpen}
                        ariaLabel={tApp(shell.uiLocale, "journalOnStart")}
                        onChange={(checked) => {
                          onJournalOpenChange(checked);
                          void persist({ journalOpen: checked });
                        }}
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "startupView")}</span>
                      <p>{tApp(shell.uiLocale, "startupViewHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <Select
                        className="v2-select"
                        value={shell.startupView}
                        ariaLabel={tApp(shell.uiLocale, "startupView")}
                        options={[
                          { value: "home", label: "Accueil" },
                          { value: "lastDocument", label: "Dernier document" },
                        ]}
                        onChange={(v) =>
                          persistShellPrefs({ startupView: v as StartupView })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "restoreTabs")}</span>
                      <p>{tApp(shell.uiLocale, "restoreTabsHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={shell.restoreWorkspaceTabs}
                        ariaLabel={tApp(shell.uiLocale, "restoreTabs")}
                        onChange={(checked) =>
                          persistShellPrefs({ restoreWorkspaceTabs: checked })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "alwaysOnTop")}</span>
                      <p>{tApp(shell.uiLocale, "alwaysOnTopHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={shell.alwaysOnTop}
                        ariaLabel={tApp(shell.uiLocale, "alwaysOnTop")}
                        onChange={(checked) =>
                          persistShellPrefs({ alwaysOnTop: checked })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "rememberBounds")}</span>
                      <p>{tApp(shell.uiLocale, "rememberBoundsHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={shell.rememberWindowBounds}
                        ariaLabel={tApp(shell.uiLocale, "rememberBounds")}
                        onChange={(checked) =>
                          persistShellPrefs({ rememberWindowBounds: checked })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "confirmQuit")}</span>
                      <p>{tApp(shell.uiLocale, "confirmQuitHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={shell.confirmQuitIfRunning}
                        ariaLabel={tApp(shell.uiLocale, "confirmQuit")}
                        onChange={(checked) =>
                          persistShellPrefs({ confirmQuitIfRunning: checked })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "goHomeAfterEmergency")}</span>
                      <p>{tApp(shell.uiLocale, "goHomeAfterEmergencyHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={shell.goHomeAfterEmergency}
                        ariaLabel={tApp(shell.uiLocale, "goHomeAfterEmergency")}
                        onChange={(checked) =>
                          persistShellPrefs({ goHomeAfterEmergency: checked })
                        }
                      />
                    </div>
                  </div>
                </SettingsGroup>
                <SettingsGroup title={tApp(shell.uiLocale, "groupNotifications")}>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "toastOnFinish")}</span>
                      <p>{tApp(shell.uiLocale, "toastOnFinishHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={shell.toastOnFinish}
                        ariaLabel={tApp(shell.uiLocale, "toastOnFinish")}
                        onChange={(checked) =>
                          persistShellPrefs({ toastOnFinish: checked })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "soundOnFinish")}</span>
                      <p>{tApp(shell.uiLocale, "soundOnFinishHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={automation.soundOnFinish}
                        ariaLabel={tApp(shell.uiLocale, "soundOnFinish")}
                        onChange={(checked) =>
                          persistAutomationPrefs({ soundOnFinish: checked })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "focusJournal")}</span>
                      <p>{tApp(shell.uiLocale, "focusJournalHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={automation.focusFollowsRun}
                        ariaLabel={tApp(shell.uiLocale, "focusJournal")}
                        onChange={(checked) =>
                          persistAutomationPrefs({ focusFollowsRun: checked })
                        }
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "trayRelaunch")}</span>
                      <p>{tApp(shell.uiLocale, "trayRelaunchHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={shell.trayRelaunchLast}
                        ariaLabel={tApp(shell.uiLocale, "trayRelaunch")}
                        onChange={(checked) =>
                          persistShellPrefs({ trayRelaunchLast: checked })
                        }
                      />
                    </div>
                  </div>
                </SettingsGroup>
                <SettingsGroup title={tApp(shell.uiLocale, "groupAppearance")}>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "theme")}</span>
                      <p>{tApp(shell.uiLocale, "themeHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <div className="v2-segmented" role="group" aria-label="Thème">
                        {(
                          [
                            ["light", "Clair"],
                            ["dark", "Sombre"],
                            ["system", "Système"],
                          ] as const
                        ).map(([value, label]) => (
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
                            {label}
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
                        aria-label="Thème sombre"
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
                        aria-label="Thème clair"
                        onClick={() => setTheme("light")}
                      />
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "hud")}</span>
                      <p>{tApp(shell.uiLocale, "hudHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={overlayVisible}
                        ariaLabel={tApp(shell.uiLocale, "hud")}
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
                      <span>{tApp(shell.uiLocale, "hudOpacity")}</span>
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
                      <span>{tApp(shell.uiLocale, "language")}</span>
                      <p>{tApp(shell.uiLocale, "languageHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <Select
                        className="v2-select"
                        value={shell.uiLocale}
                        ariaLabel={tApp(shell.uiLocale, "language")}
                        options={[
                          { value: "system", label: "Système" },
                          { value: "fr", label: "Français" },
                          { value: "en", label: "English" },
                        ]}
                        onChange={(v) =>
                          persistShellPrefs({ uiLocale: v as UiLocale })
                        }
                      />
                    </div>
                  </div>
                </SettingsGroup>
                <SettingsGroup title={tApp(shell.uiLocale, "groupClicker")}>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "clickerMode")}</span>
                      <p>{tApp(shell.uiLocale, "clickerModeHint")}</p>
                    </div>
                    <div className="v2-settings-row-control">
                      <div className="v2-segmented" role="group" aria-label="Mode Clicker">
                        <button
                          type="button"
                          className={["v2-segmented-btn", !advanced ? "active" : ""]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => setAdvanced(false)}
                        >
                          Simple
                        </button>
                        <button
                          type="button"
                          className={["v2-segmented-btn", advanced ? "active" : ""]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => setAdvanced(true)}
                        >
                          Avancé
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "state")}</span>
                    </div>
                    <div className="v2-settings-row-control">
                      <strong className="v2-settings-status">
                        {running ? "En cours" : "Inactif"}
                      </strong>
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>{tApp(shell.uiLocale, "liveMetrics")}</span>
                    </div>
                    <div className="v2-settings-row-control">
                      <code className="v2-settings-mono">
                        {metrics
                          ? `${metrics.measuredCps.toFixed(1)} cps · ${metrics.clicksEmitted} clics`
                          : "—"}
                      </code>
                    </div>
                  </div>
                </SettingsGroup>
              </>
            ) : null}

            {section === "hotkeys" ? (
              <>
                <h2 className="v2-settings-pane-title">Raccourcis</h2>
                <p className="v2-settings-pane-hint">
                  Valables hors focus. Défauts : clicker F6 · macro F9 · urgence F8.
                </p>
                <SettingsGroup title="Raccourcis globaux">
                  <HotkeySettings onBindingsChange={onHotkeysChange} />
                </SettingsGroup>
              </>
            ) : null}

            {section === "security" ? (
              <>
                <h2 className="v2-settings-pane-title">Sécurité</h2>
                <p className="v2-settings-pane-hint">
                  Limite où Caster peut agir, et quel écran utiliser.
                  {running ? " Filtre désactivé pendant une session en cours." : ""}
                </p>
                <SettingsGroup title="Filtre applications">
                  <p className="v2-settings-group-hint">
                    Selon l’application au premier plan (
                    <code className="v2-settings-mono">nom.exe</code>
                    ). La session continue même si un clic est ignoré.
                  </p>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>Premier plan actuel</span>
                    </div>
                    <div className="v2-settings-row-control">
                      <code className="v2-settings-mono">{foregroundExe ?? "—"}</code>
                      <button
                        type="button"
                        className="v2-btn v2-btn-ghost"
                        title="Actualiser les processus visibles"
                        onClick={refreshLiveExes}
                      >
                        <RefreshCw size={14} aria-hidden />
                      </button>
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>Activer le filtre</span>
                    </div>
                    <div className="v2-settings-row-control">
                      <SettingsToggle
                        checked={processFilter.enabled}
                        disabled={running}
                        ariaLabel="Activer le filtre"
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
                      <span>Mode</span>
                      <p>
                        Choisissez si la liste bloque ou autorise les applications.
                      </p>
                    </div>
                    <div className="v2-settings-row-control">
                      <Select
                        className="v2-select"
                        value={processFilter.mode}
                        disabled={running || !processFilter.enabled}
                        options={[
                          {
                            value: "deny",
                            label: "Ne jamais agir dans ces apps",
                          },
                          {
                            value: "allow",
                            label: "Agir seulement dans ces apps",
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
                        <span>Ajouter depuis processus visibles</span>
                      </div>
                      <div className="v2-settings-row-control v2-settings-row-control--full">
                        <Select
                          className="v2-select"
                          value=""
                          disabled={running || !processFilter.enabled}
                          options={[
                            { value: "", label: "Choisir…" },
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
                      <span>Ajouter manuellement</span>
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
                          Ajouter
                        </button>
                      </div>
                    </div>
                  </div>
                  {processFilter.names.length === 0 ? (
                    <p className="v2-settings-group-hint">Aucun processus listé.</p>
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
                            Retirer
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </SettingsGroup>
                <SettingsGroup title="Écran">
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>Moniteur pour overlays et coordonnées</span>
                    </div>
                    <div className="v2-settings-row-control v2-settings-row-control--grow">
                      <div className="v2-field-row">
                        <Select
                          className="v2-select"
                          value={displayId ?? ""}
                          options={[
                            { value: "", label: "Principal (défaut)" },
                            ...displays.map((d) => ({
                              value: d.id,
                              label: displayOptionLabel(d),
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
                          title="Actualiser la liste"
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
                <h2 className="v2-settings-pane-title">Données</h2>
                <p className="v2-settings-pane-hint">
                  Fichiers locaux, sauvegarde des préférences, nettoyage.
                </p>
                <SettingsGroup title="Actions">
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>Ouvrir les fichiers de config</span>
                      <p>
                        Dossier contenant{" "}
                        <code className="v2-settings-mono">settings.json</code>
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
                        .
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
                        Ouvrir
                      </button>
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>Ouvrir les journaux</span>
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
                        Ouvrir
                      </button>
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>Exporter / importer</span>
                      <p>
                        Uniquement{" "}
                        <code className="v2-settings-mono">settings.json</code> — pas
                        macros ni Accueil.
                      </p>
                    </div>
                    <div className="v2-settings-row-control">
                      <button
                        type="button"
                        className="v2-btn"
                        onClick={() => void exportSettings()}
                      >
                        Exporter
                      </button>
                      <button
                        type="button"
                        className="v2-btn v2-btn-ghost"
                        onClick={() => void importSettings()}
                      >
                        Importer
                      </button>
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>Vider la corbeille</span>
                      <p>
                        Supprime définitivement les macros et presets mis à la
                        corbeille.
                      </p>
                    </div>
                    <div className="v2-settings-row-control">
                      <button
                        type="button"
                        className="v2-btn v2-btn-danger-ghost"
                        onClick={() => void purgeTrash()}
                      >
                        Vider
                      </button>
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>Réinitialiser le clicker</span>
                      <p>
                        Remet entrée, timing, cible, limites et zones aux valeurs par
                        défaut. Presets et raccourcis sont conservés.
                      </p>
                    </div>
                    <div className="v2-settings-row-control">
                      <button
                        type="button"
                        className="v2-btn v2-btn-danger-ghost"
                        disabled={running}
                        onClick={() => void resetClicker()}
                      >
                        Réinitialiser
                      </button>
                    </div>
                  </div>
                </SettingsGroup>
                <SettingsGroup title="À propos">
                  <div className="v2-settings-about">
                    <strong>Caster</strong>
                    <p>Automatisation Windows — clicker et macros, 100 % local.</p>
                    <dl className="v2-settings-about-meta">
                      <div>
                        <dt>Version</dt>
                        <dd>{paths?.version ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Licence</dt>
                        <dd>MIT</dd>
                      </div>
                      <div>
                        <dt>Plateforme</dt>
                        <dd>Windows</dd>
                      </div>
                    </dl>
                    <p className="v2-settings-group-hint">
                      Aucune télémétrie · données locales. Hotkeys globales, capture et
                      injection d’entrée : Windows uniquement pour l’instant.
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
