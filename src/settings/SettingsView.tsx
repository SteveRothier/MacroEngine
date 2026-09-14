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
  mergeShellPrefs,
  type ShellPrefs,
  type StartupView,
} from "./settingsTypes";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "application", label: "Application" },
  { id: "hotkeys", label: "Raccourcis" },
  { id: "security", label: "Sécurité" },
  { id: "data", label: "Données" },
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
  onShellPrefsChange,
}: Props) {
  const toast = useToast();
  const { loadSettings, saveBundle } = useClickerSettingsApi();
  const [processFilter, setProcessFilter] = useState<ProcessFilter>(DEFAULT_PROCESS_FILTER);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(1);
  const [closeToTray, setCloseToTray] = useState(false);
  const [startWithWindows, setStartWithWindows] = useState(false);
  const [shell, setShell] = useState<ShellPrefs>(() => mergeShellPrefs());
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
    });
    refreshDisplays();
    void invoke<AppPaths>("get_paths")
      .then(setPaths)
      .catch(() => setPaths(null));
  }, [loadSettings, refreshDisplays, onShellPrefsChange]);

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
      });
    },
    [loadSettings, saveBundle, theme],
  );

  const persistShellPrefs = (
    patch: Partial<Pick<ShellPrefs, "startupView" | "restoreWorkspaceTabs">>,
  ) => {
    const next = mergeShellPrefs({ ...shell, ...patch });
    setShell(next);
    onShellPrefsChange?.(next);
    void persist({ shell: next });
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
            {section === "application" ? (
              <>
                <h2 className="v2-settings-pane-title">Application</h2>
                <p className="v2-settings-pane-hint">
                  Démarrage, fenêtre et apparence de Caster.
                </p>
                <InspectorSection title="Démarrage & fenêtre">
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>Démarrer avec Windows</span>
                      <p>Lance Caster à la connexion de votre compte.</p>
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
                      <span>Fermer vers la barre d’état</span>
                      <p>
                        La croix cache la fenêtre ; quitter via l’icône tray.
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
                      <span>Journal au démarrage</span>
                      <p>Ouvre le journal d’exécution au lancement.</p>
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
                      <span>Vue au démarrage</span>
                      <p>Écran montré juste après le lancement.</p>
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
                      <p>Rouvre les documents ouverts à la fermeture précédente.</p>
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
                </InspectorSection>
                <InspectorSection title="Apparence">
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>Thème</span>
                      <p>Suit Windows si Système.</p>
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
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>Indicateur flottant (HUD)</span>
                      <p>
                        Affiche l’état au-dessus des autres fenêtres (pas les zones
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
                      <span>Opacité du HUD</span>
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
                <InspectorSection title="Clicker">
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>Mode interface</span>
                      <p>Change uniquement l’éditeur Clicker.</p>
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
                      <span>État</span>
                    </div>
                    <div className="v2-settings-row-control">
                      <strong>{running ? "En cours" : "Inactif"}</strong>
                    </div>
                  </div>
                  <div className="v2-settings-row">
                    <div className="v2-settings-row-label">
                      <span>Mesure live</span>
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
              </>
            ) : null}

            {section === "hotkeys" ? (
              <>
                <h2 className="v2-settings-pane-title">Raccourcis</h2>
                <p className="v2-settings-pane-hint">
                  Valables hors focus. Défauts : clicker F6 · macro F9 · urgence F8.
                </p>
                <HotkeySettings onBindingsChange={onHotkeysChange} />
              </>
            ) : null}

            {section === "security" ? (
              <>
                <h2 className="v2-settings-pane-title">Sécurité</h2>
                <p className="v2-settings-pane-hint">
                  Limite où Caster peut agir, et quel écran utiliser.
                  {running ? " Filtre désactivé pendant une session en cours." : ""}
                </p>
                <InspectorSection title="Filtre applications">
                  <p className="v2-settings-pane-hint">
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
                      <input
                        type="checkbox"
                        checked={processFilter.enabled}
                        disabled={running}
                        onChange={(e) =>
                          persistProcess({
                            ...processFilter,
                            enabled: e.target.checked,
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
                <InspectorSection title="Écran">
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
                </InspectorSection>
              </>
            ) : null}

            {section === "data" ? (
              <>
                <h2 className="v2-settings-pane-title">Données</h2>
                <p className="v2-settings-pane-hint">
                  Fichiers locaux, sauvegarde des préférences, nettoyage.
                </p>
                <InspectorSection title="Actions">
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
