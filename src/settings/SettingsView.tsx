import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { RefreshCw } from "lucide-react";
import { HotkeySettings } from "./HotkeySettings";
import {
  DEFAULT_CLICKER,
  DEFAULT_PROCESS_FILTER,
  type DisplayDto,
  type ProcessFilter,
} from "../clicker/clickerTypes";
import { useClickerSettingsApi } from "../clicker/useClickerSettings";
import { InspectorSection, Select, useToast } from "../ui/v2";
import { confirmChoice } from "../ui";
import type { HotkeyBindings } from "../macros/types";
import type { ThemeMode } from "../theme";
import type { SettingsSection } from "../app/types";
import {
  mergeAccueilPrefs,
  mergeAppearancePrefs,
  mergeShellPrefs,
  type AccueilPrefs,
  type AccueilFilter,
  type AccueilSortBy,
  type AccueilSortDir,
  type AppearancePrefs,
  type AccentTheme,
  type ShellPrefs,
  type StartupView,
  type UiDensity,
} from "./settingsTypes";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "general", label: "Général" },
  { id: "accueil", label: "Accueil" },
  { id: "appearance", label: "Apparence" },
  { id: "hotkeys", label: "Raccourcis" },
  { id: "process", label: "Processus" },
  { id: "displays", label: "Écrans" },
  { id: "maintenance", label: "Maintenance" },
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
  onAccueilPrefsChange?: (prefs: AccueilPrefs) => void;
  onShellPrefsChange?: (prefs: ShellPrefs) => void;
  onAppearancePrefsChange?: (prefs: AppearancePrefs) => void;
  sidebarCollapsed?: boolean;
  onSidebarCollapsedChange?: (v: boolean) => void;
};

function displayOptionLabel(d: DisplayDto): string {
  const scale = Math.round(d.scaleFactor * 100);
  const primary = d.isPrimary ? " · primaire" : "";
  return `${d.width}×${d.height} · ${scale} %${primary}`;
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
  onAccueilPrefsChange,
  onShellPrefsChange,
  onAppearancePrefsChange,
  sidebarCollapsed = false,
  onSidebarCollapsedChange,
}: Props) {
  const toast = useToast();
  const { loadSettings, saveBundle } = useClickerSettingsApi();
  const [processFilter, setProcessFilter] = useState<ProcessFilter>(DEFAULT_PROCESS_FILTER);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(1);
  const [closeToTray, setCloseToTray] = useState(false);
  const [startWithWindows, setStartWithWindows] = useState(false);
  const [liveExes, setLiveExes] = useState<string[]>([]);
  const [foregroundExe, setForegroundExe] = useState<string | null>(null);
  const [processDraft, setProcessDraft] = useState("");
  const [displays, setDisplays] = useState<DisplayDto[]>([]);
  const [displayId, setDisplayId] = useState<string | null>(null);
  const [accueil, setAccueil] = useState<AccueilPrefs>(() => mergeAccueilPrefs());
  const [shell, setShell] = useState<ShellPrefs>(() => mergeShellPrefs());
  const [appearanceExtra, setAppearanceExtra] = useState<AppearancePrefs>(() =>
    mergeAppearancePrefs(),
  );
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
      const a = mergeAccueilPrefs(s.accueil);
      setAccueil(a);
      onAccueilPrefsChange?.(a);
      const sh = mergeShellPrefs(s.shell);
      setShell(sh);
      onShellPrefsChange?.(sh);
      const ap = mergeAppearancePrefs(s.appearance);
      setAppearanceExtra(ap);
      onAppearancePrefsChange?.(ap);
      if (typeof s.sidebarCollapsed === "boolean") {
        onSidebarCollapsedChange?.(s.sidebarCollapsed);
      }
    });
    refreshDisplays();
    void invoke<AppPaths>("get_paths")
      .then(setPaths)
      .catch(() => setPaths(null));
  }, [
    loadSettings,
    refreshDisplays,
    onAccueilPrefsChange,
    onShellPrefsChange,
    onAppearancePrefsChange,
    onSidebarCollapsedChange,
  ]);

  useEffect(() => {
    void invoke<{ measuredCps: number; clicksEmitted: number }>("get_clicker_metrics")
      .then((m) => setMetrics({ measuredCps: m.measuredCps, clicksEmitted: m.clicksEmitted }))
      .catch(() => setMetrics(null));
  }, [running, section]);

  useEffect(() => {
    if (section !== "process") return;
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
      sidebarCollapsed?: boolean;
      accueil?: AccueilPrefs;
      shell?: ShellPrefs;
      appearance?: AppearancePrefs;
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
        sidebarCollapsed: partial.sidebarCollapsed ?? current.sidebarCollapsed,
        accueil: partial.accueil,
        shell: partial.shell,
        appearance: partial.appearance,
      });
    },
    [loadSettings, saveBundle, theme],
  );

  const persistAccueil = (patch: Partial<AccueilPrefs>) => {
    const next = mergeAccueilPrefs({ ...accueil, ...patch });
    setAccueil(next);
    onAccueilPrefsChange?.(next);
    void persist({ accueil: next });
  };

  const persistShellPrefs = (patch: Partial<ShellPrefs>) => {
    const next = mergeShellPrefs({ ...shell, ...patch });
    setShell(next);
    onShellPrefsChange?.(next);
    void persist({ shell: next });
  };

  const persistAppearanceExtra = (patch: Partial<AppearancePrefs>) => {
    const next = mergeAppearancePrefs({ ...appearanceExtra, ...patch });
    setAppearanceExtra(next);
    onAppearancePrefsChange?.(next);
    void persist({ appearance: next });
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

  const currentDisplayLabel = (() => {
    if (!displayId) {
      const primary = displays.find((d) => d.isPrimary);
      return primary ? displayOptionLabel(primary) : "Principal";
    }
    const d = displays.find((x) => x.id === displayId);
    return d ? displayOptionLabel(d) : displayId;
  })();

  return (
    <div className="v2-page">
      <div className="v2-settings-layout">
        <nav className="v2-settings-rail" aria-label="Sections paramètres">
          {SECTIONS.map((s) => (
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
              {s.label}
            </button>
          ))}
        </nav>
        <div className="v2-settings-pane">
          <div className="v2-settings-pane-inner">
          {section === "general" ? (
            <>
              <h2 className="v2-settings-pane-title">Général</h2>
              <p className="v2-settings-pane-hint">
                Préférences applicatives — le comportement clicker reste dans l’éditeur Clicker.
              </p>
              <InspectorSection title="Application">
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Mode interface Clicker</span>
                    <p>Bascule Simple / Avancé sur l’onglet Clicker.</p>
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
                    <span>État moteur</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <strong>{running ? "En cours" : "Inactif"}</strong>
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Mesuré</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <code className="v2-settings-mono">
                      {metrics
                        ? `${metrics.measuredCps.toFixed(1)} cps · ${metrics.clicksEmitted} clics`
                        : "—"}
                    </code>
                  </div>
                </div>
              </InspectorSection>
              <InspectorSection title="Fenêtre">
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Journal ouvert au démarrage</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <input
                      type="checkbox"
                      checked={journalOpen}
                      onChange={(e) => {
                        onJournalOpenChange(e.target.checked);
                        void persist({ journalOpen: e.target.checked });
                      }}
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Fermer vers la barre d’état</span>
                    <p>
                      La croix masque la fenêtre. Quitter via l’icône tray. Le tray relance le
                      clicker courant ou la dernière macro chargée.
                    </p>
                  </div>
                  <div className="v2-settings-row-control">
                    <input
                      type="checkbox"
                      checked={closeToTray}
                      onChange={(e) => {
                        setCloseToTray(e.target.checked);
                        void persist({ closeToTray: e.target.checked });
                      }}
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Démarrer avec Windows</span>
                    <p>Raccourci dans le dossier Démarrage du compte utilisateur.</p>
                  </div>
                  <div className="v2-settings-row-control">
                    <input
                      type="checkbox"
                      checked={startWithWindows}
                      onChange={(e) => {
                        setStartWithWindows(e.target.checked);
                        void persist({ startWithWindows: e.target.checked });
                      }}
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Vue au démarrage</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <Select
                      className="v2-select"
                      value={shell.startupView}
                      ariaLabel="Vue au démarrage"
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
                    <span>Restaurer les onglets</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <input
                      type="checkbox"
                      checked={shell.restoreWorkspaceTabs}
                      onChange={(e) =>
                        persistShellPrefs({
                          restoreWorkspaceTabs: e.target.checked,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Palette de commandes (Ctrl+K)</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <input
                      type="checkbox"
                      checked={shell.commandPaletteEnabled}
                      onChange={(e) =>
                        persistShellPrefs({
                          commandPaletteEnabled: e.target.checked,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Afficher la pilule de session</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <input
                      type="checkbox"
                      checked={shell.showSessionPill}
                      onChange={(e) =>
                        persistShellPrefs({ showSessionPill: e.target.checked })
                      }
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Réduire vers le tray</span>
                    <p>Distinct de « Fermer vers tray ».</p>
                  </div>
                  <div className="v2-settings-row-control">
                    <input
                      type="checkbox"
                      checked={shell.minimizeToTray}
                      onChange={(e) =>
                        persistShellPrefs({ minimizeToTray: e.target.checked })
                      }
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Max. récents</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <input
                      type="number"
                      className="v2-input"
                      min={4}
                      max={50}
                      value={shell.recentListMax}
                      onChange={(e) =>
                        persistShellPrefs({
                          recentListMax: Number(e.target.value) || 12,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Avertir si modifications non enregistrées</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <input
                      type="checkbox"
                      checked={shell.warnOnUnsavedQuit}
                      onChange={(e) =>
                        persistShellPrefs({
                          warnOnUnsavedQuit: e.target.checked,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Barre latérale repliée</span>
                    <p>Mémorisé pour les surfaces qui exposent une sidebar.</p>
                  </div>
                  <div className="v2-settings-row-control">
                    <input
                      type="checkbox"
                      checked={sidebarCollapsed}
                      onChange={(e) => {
                        onSidebarCollapsedChange?.(e.target.checked);
                        void persist({ sidebarCollapsed: e.target.checked });
                      }}
                    />
                  </div>
                </div>
              </InspectorSection>
            </>
          ) : null}

          {section === "accueil" ? (
            <>
              <h2 className="v2-settings-pane-title">Accueil</h2>
              <p className="v2-settings-pane-hint">
                Tri, filtres et comportements de la liste des automations.
              </p>
              <InspectorSection title="Affichage par défaut">
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Tri</span>
                    <p>Ordre manuel (#), nom, type ou statut.</p>
                  </div>
                  <div className="v2-settings-row-control">
                    <Select
                      className="v2-select"
                      value={accueil.defaultSortBy}
                      ariaLabel="Tri Accueil par défaut"
                      options={[
                        { value: "order", label: "Ordre manuel (#)" },
                        { value: "name", label: "Nom" },
                        { value: "type", label: "Type" },
                        { value: "status", label: "Statut" },
                      ]}
                      onChange={(v) =>
                        persistAccueil({ defaultSortBy: v as AccueilSortBy })
                      }
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Direction</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <Select
                      className="v2-select"
                      value={accueil.defaultSortDir}
                      ariaLabel="Direction du tri"
                      options={[
                        { value: "asc", label: "Croissant" },
                        { value: "desc", label: "Décroissant" },
                      ]}
                      onChange={(v) =>
                        persistAccueil({ defaultSortDir: v as AccueilSortDir })
                      }
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Filtre</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <Select
                      className="v2-select"
                      value={accueil.defaultFilter}
                      ariaLabel="Filtre Accueil par défaut"
                      options={[
                        { value: "all", label: "Tous" },
                        { value: "favorites", label: "Favoris" },
                        { value: "recent", label: "Récents" },
                        { value: "scripts", label: "Scripts" },
                      ]}
                      onChange={(v) =>
                        persistAccueil({ defaultFilter: v as AccueilFilter })
                      }
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Mémoriser sections repliées</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <label className="v2-switch">
                      <input
                        type="checkbox"
                        checked={accueil.rememberCollapsedSections}
                        onChange={(e) =>
                          persistAccueil({
                            rememberCollapsedSections: e.target.checked,
                          })
                        }
                      />
                      <span />
                    </label>
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Scripts dans « Tous »</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <label className="v2-switch">
                      <input
                        type="checkbox"
                        checked={accueil.showScriptsInAll}
                        onChange={(e) =>
                          persistAccueil({ showScriptsInAll: e.target.checked })
                        }
                      />
                      <span />
                    </label>
                  </div>
                </div>
              </InspectorSection>
              <InspectorSection title="Interactions">
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Ouvrir au simple clic</span>
                    <p>Sinon double-clic ou Entrée.</p>
                  </div>
                  <div className="v2-settings-row-control">
                    <label className="v2-switch">
                      <input
                        type="checkbox"
                        checked={accueil.openOnSingleClick}
                        onChange={(e) =>
                          persistAccueil({ openOnSingleClick: e.target.checked })
                        }
                      />
                      <span />
                    </label>
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Confirmer corbeille</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <label className="v2-switch">
                      <input
                        type="checkbox"
                        checked={accueil.confirmTrash}
                        onChange={(e) =>
                          persistAccueil({ confirmTrash: e.target.checked })
                        }
                      />
                      <span />
                    </label>
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Confirmer suppression dossier</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <label className="v2-switch">
                      <input
                        type="checkbox"
                        checked={accueil.confirmDeleteFolder}
                        onChange={(e) =>
                          persistAccueil({
                            confirmDeleteFolder: e.target.checked,
                          })
                        }
                      />
                      <span />
                    </label>
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Sync ordre bibliothèque (même type)</span>
                    <p>
                      Lors d’un réordonnancement Accueil entre deux macros ou
                      deux clickers.
                    </p>
                  </div>
                  <div className="v2-settings-row-control">
                    <label className="v2-switch">
                      <input
                        type="checkbox"
                        checked={accueil.syncLibrarySortOnReorder}
                        onChange={(e) =>
                          persistAccueil({
                            syncLibrarySortOnReorder: e.target.checked,
                          })
                        }
                      />
                      <span />
                    </label>
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Seuil double-clic (ms)</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <input
                      type="number"
                      className="v2-input"
                      min={150}
                      max={800}
                      step={50}
                      value={accueil.doubleClickDelayMs}
                      onChange={(e) =>
                        persistAccueil({
                          doubleClickDelayMs: Number(e.target.value) || 300,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Seuil drag (px)</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <input
                      type="number"
                      className="v2-input"
                      min={2}
                      max={24}
                      value={accueil.dragThresholdPx}
                      onChange={(e) =>
                        persistAccueil({
                          dragThresholdPx: Number(e.target.value) || 6,
                        })
                      }
                    />
                  </div>
                </div>
              </InspectorSection>
            </>
          ) : null}

          {section === "appearance" ? (
            <>
              <h2 className="v2-settings-pane-title">Apparence</h2>
              <InspectorSection title="Thème">
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Mode</span>
                    <p>Clair, sombre ou système (préférence OS).</p>
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
              </InspectorSection>
              <InspectorSection title="Densité et accent">
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Densité</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <Select
                      className="v2-select"
                      value={appearanceExtra.density}
                      ariaLabel="Densité UI"
                      options={[
                        { value: "comfortable", label: "Confortable" },
                        { value: "compact", label: "Compacte" },
                      ]}
                      onChange={(v) =>
                        persistAppearanceExtra({ density: v as UiDensity })
                      }
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Échelle de police</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <Select
                      className="v2-select"
                      value={String(appearanceExtra.fontScale)}
                      ariaLabel="Échelle de police"
                      options={[
                        { value: "0.9", label: "90 %" },
                        { value: "1", label: "100 %" },
                        { value: "1.1", label: "110 %" },
                      ]}
                      onChange={(v) =>
                        persistAppearanceExtra({ fontScale: Number(v) || 1 })
                      }
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Accent</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <Select
                      className="v2-select"
                      value={appearanceExtra.accent}
                      ariaLabel="Accent"
                      options={[
                        { value: "default", label: "Défaut" },
                        { value: "blue", label: "Bleu" },
                        { value: "teal", label: "Sarcelle" },
                      ]}
                      onChange={(v) =>
                        persistAppearanceExtra({ accent: v as AccentTheme })
                      }
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Réduire les animations</span>
                  </div>
                  <div className="v2-settings-row-control">
                    <input
                      type="checkbox"
                      checked={appearanceExtra.reduceMotion}
                      onChange={(e) =>
                        persistAppearanceExtra({
                          reduceMotion: e.target.checked,
                        })
                      }
                    />
                  </div>
                </div>
              </InspectorSection>
              <InspectorSection title="Overlay">
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>HUD statut</span>
                    <p>
                      Fenêtre flottante hors focus. Distinct de l’overlay zones (éditeur
                      Clicker).
                    </p>
                  </div>
                  <div className="v2-settings-row-control">
                    <label className="v2-switch">
                      <input
                        type="checkbox"
                        checked={overlayVisible}
                        onChange={(e) => {
                          setOverlayVisible(e.target.checked);
                          void invoke("set_overlay_visible", {
                            visible: e.target.checked,
                          });
                          void persist({ overlayVisible: e.target.checked });
                        }}
                      />
                      <span>{overlayVisible ? "Affiché" : "Masqué"}</span>
                    </label>
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Opacité HUD</span>
                    <p>Moniteur : {currentDisplayLabel}</p>
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
              </InspectorSection>
            </>
          ) : null}

          {section === "hotkeys" ? (
            <>
              <h2 className="v2-settings-pane-title">Raccourcis</h2>
              <p className="v2-settings-pane-hint">
                Clicker : Ctrl / Alt / Shift + touche (défaut F6). Macro F9 · Urgence F8.
                Valables hors focus. Le tray utilise les mêmes raccourcis pour le clicker
                courant et la dernière macro chargée.
              </p>
              <HotkeySettings onBindingsChange={onHotkeysChange} />
            </>
          ) : null}

          {section === "process" ? (
            <>
              <h2 className="v2-settings-pane-title">Processus</h2>
              <p className="v2-settings-pane-hint">
                Filtre global clicker et macros selon l’exe au premier plan.
                {running ? " Désactivé pendant une session en cours." : ""}
              </p>
              <InspectorSection title="Filtre global">
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
                    <input
                      type="checkbox"
                      checked={processFilter.enabled}
                      disabled={running}
                      onChange={(e) =>
                        persistProcess({ ...processFilter, enabled: e.target.checked })
                      }
                    />
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Mode</span>
                    <p>
                      Bloquer : ignore si listé. Autoriser : ignore si absent de la
                      liste. La session continue.
                    </p>
                  </div>
                  <div className="v2-settings-row-control">
                    <Select
                      className="v2-select"
                      value={processFilter.mode}
                      disabled={running || !processFilter.enabled}
                      options={[
                        { value: "deny", label: "Bloquer la liste" },
                        { value: "allow", label: "Autoriser seulement" },
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
                  <label className="v2-field">
                    <span>Ajouter depuis processus visibles</span>
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
                  </label>
                ) : null}
                <label className="v2-field">
                  <span>Ajouter manuellement</span>
                  <div className="v2-field-row">
                    <input
                      value={processDraft}
                      disabled={running || !processFilter.enabled}
                      onChange={(e) => setProcessDraft(e.target.value)}
                      placeholder="game.exe"
                    />
                    <button
                      type="button"
                      className="v2-btn"
                      disabled={
                        running || !processFilter.enabled || !processDraft.trim()
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
                </label>
                {processFilter.names.length === 0 ? (
                  <p className="v2-settings-pane-hint">Aucun processus listé.</p>
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
              </InspectorSection>
            </>
          ) : null}

          {section === "displays" ? (
            <>
              <h2 className="v2-settings-pane-title">Écrans</h2>
              <p className="v2-settings-pane-hint">
                Moniteur utilisé pour les overlays et les coordonnées d’écran.
              </p>
              <InspectorSection title="Écran cible">
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Moniteur actif</span>
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
              </InspectorSection>
            </>
          ) : null}

          {section === "maintenance" ? (
            <>
              <h2 className="v2-settings-pane-title">Maintenance</h2>
              <InspectorSection title="Données">
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Fichier de config</span>
                    <p>
                      <code className="v2-settings-mono">
                        {paths?.settingsPath ?? "settings.json"}
                      </code>
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
                      Ouvrir le dossier
                    </button>
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Journaux</span>
                    <p>
                      <code className="v2-settings-mono">{paths?.logDir ?? "—"}</code>
                    </p>
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
                      Ouvrir les logs
                    </button>
                  </div>
                </div>
                <div className="v2-settings-row">
                  <div className="v2-settings-row-label">
                    <span>Export / import</span>
                    <p>Fichier JSON complet (clicker inclus).</p>
                  </div>
                  <div className="v2-settings-row-control">
                    <button type="button" className="v2-btn" onClick={() => void exportSettings()}>
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
                    <span>Corbeille bibliothèque</span>
                    <p>Supprime définitivement les macros et presets mis à la corbeille.</p>
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
              </InspectorSection>
              <InspectorSection title="À propos">
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
                  <p className="v2-settings-pane-hint">
                    Aucune télémétrie · données locales. Hotkeys globales, capture et
                    injection d’entrée : Windows uniquement pour l’instant.
                  </p>
                </div>
              </InspectorSection>
            </>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
