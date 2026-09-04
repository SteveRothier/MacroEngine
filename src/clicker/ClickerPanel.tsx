import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { EngineStatus, HotkeyBindings } from "../macros/types";
import { HotkeySettings } from "../settings/HotkeySettings";
import { applyTheme, type ThemeMode } from "../theme";
import { Card, Icons, RadioGroup, Segmented, Switch } from "../ui";
import {
  DEFAULT_CLICKER,
  DEFAULT_PROCESS_FILTER,
  type AppSettings,
  type ProcessFilter,
} from "./clickerTypes";
import { useClickerSettingsApi } from "./useClickerSettings";

type AdvSection = "general" | "apparence" | "raccourcis" | "processus" | "maintenance";
export type SettingsSectionId = AdvSection;

const ADV_SECTIONS: { id: AdvSection; label: string; icon: ReactNode }[] = [
  { id: "general", label: "Général", icon: Icons.info },
  { id: "apparence", label: "Apparence", icon: Icons.eye },
  { id: "raccourcis", label: "Raccourcis", icon: Icons.key },
  { id: "processus", label: "Processus", icon: Icons.list },
  { id: "maintenance", label: "Maintenance", icon: Icons.wrench },
];

type ClickerMetrics = {
  clicksEmitted: number;
  measuredCps: number;
};

export type ClickerPanelVariant = "operation" | "settings";

type Props = {
  status: EngineStatus;
  onStatus: (s: EngineStatus) => void;
  refresh: () => Promise<void>;
  advanced: boolean;
  onAdvancedChange: (v: boolean) => void;
  onActivePreset?: (name: string | null) => void;
  actionHotkeyLabel?: string;
  onDockChange?: (dock: ReactNode | null) => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  variant?: ClickerPanelVariant;
  settingsSection?: AdvSection;
  initialPresetName?: string | null;
  onHotkeysChange?: (b: HotkeyBindings) => void;
};

export function ClickerPanel({
  status,
  onStatus: _onStatus,
  refresh: _refresh,
  advanced,
  onAdvancedChange: _onAdvancedChange,
  onActivePreset: _onActivePreset,
  actionHotkeyLabel: _actionHotkeyLabel = "F6",
  onDockChange: _onDockChange,
  theme,
  onThemeChange,
  variant = "settings",
  settingsSection = "general",
  initialPresetName: _initialPresetName = null,
  onHotkeysChange,
}: Props) {
  const { loadSettings, saveBundle } = useClickerSettingsApi();
  const [advSection, setAdvSection] = useState<AdvSection>(settingsSection);
  const [settingsSnap, setSettingsSnap] = useState<AppSettings | null>(null);
  const [metrics, setMetrics] = useState<ClickerMetrics | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [processFilter, setProcessFilter] = useState<ProcessFilter>(DEFAULT_PROCESS_FILTER);
  const [processDraft, setProcessDraft] = useState("");
  const [liveExes, setLiveExes] = useState<string[]>([]);
  const [resetDone, setResetDone] = useState(false);
  const running = status.state === "running" || status.state === "paused";

  useEffect(() => {
    setAdvSection(settingsSection);
  }, [settingsSection]);

  useEffect(() => {
    void loadSettings()
      .then((s) => {
        if (!s) return;
        setSettingsSnap(s);
        setOverlayVisible(s.overlayVisible);
        setProcessFilter(s.processFilter ?? DEFAULT_PROCESS_FILTER);
      })
      .catch(() => {});
  }, [loadSettings]);

  useEffect(() => {
    if (!processFilter.enabled) return;
    void invoke<string[]>("list_visible_process_exes")
      .then(setLiveExes)
      .catch(() => setLiveExes([]));
  }, [processFilter.enabled]);

  useEffect(() => {
    void invoke<ClickerMetrics>("get_clicker_metrics").then(setMetrics);
  }, [status]);

  const persistUi = useCallback(
    async (
      nextAdvanced = advanced,
      nextOverlay = overlayVisible,
      nextFilter = processFilter,
      nextTheme = theme,
    ) => {
      const current = (await loadSettings()) ?? settingsSnap;
      if (!current) return;
      const next: AppSettings = {
        ...current,
        advancedUi: nextAdvanced,
        overlayVisible: nextOverlay,
        processFilter: nextFilter,
        theme: nextTheme,
      };
      await saveBundle({
        clicker: next.clicker,
        advancedUi: next.advancedUi,
        overlayVisible: next.overlayVisible,
        processFilter: next.processFilter ?? DEFAULT_PROCESS_FILTER,
        theme: next.theme ?? theme,
        displayId: next.displayId,
      });
      setSettingsSnap(next);
    },
    [advanced, overlayVisible, processFilter, theme, loadSettings, saveBundle, settingsSnap],
  );

  async function onThemeSelect(next: ThemeMode) {
    onThemeChange(next);
    applyTheme(next);
    await persistUi(advanced, overlayVisible, processFilter, next);
  }

  async function persistProcessFilter(next: ProcessFilter) {
    setProcessFilter(next);
    await persistUi(advanced, overlayVisible, next);
  }

  async function resetClickerDefaults() {
    const current = (await loadSettings()) ?? settingsSnap;
    await saveBundle({
      clicker: DEFAULT_CLICKER,
      advancedUi: current?.advancedUi ?? advanced,
      overlayVisible: false,
      processFilter: current?.processFilter ?? processFilter,
      theme: (current?.theme ?? theme) as ThemeMode,
      displayId: current?.displayId,
    });
    setOverlayVisible(false);
    void invoke("set_overlay_visible", { visible: false });
    setResetDone(true);
    window.setTimeout(() => setResetDone(false), 2500);
  }

  function addProcessName(raw: string) {
    const name = raw.trim().toLowerCase();
    if (!name || processFilter.names.includes(name)) return;
    void persistProcessFilter({ ...processFilter, names: [...processFilter.names, name] });
  }

  if (variant === "operation") return null;

  const metricsLabel = metrics
    ? `${metrics.measuredCps.toFixed(1)} cps · ${metrics.clicksEmitted} clics`
    : "—";

  const row = (label: string, control: ReactNode, hint?: string) => (
    <div className="settings-row">
      <div className="settings-row-label">
        <span>{label}</span>
        {hint ? <p className="hint">{hint}</p> : null}
      </div>
      <div className="settings-row-control">{control}</div>
    </div>
  );

  const sectionContent =
    advSection === "general" ? (
      <Card title="Clicker">
        {row("Mode interface", <strong>{advanced ? "Avancé" : "Simple"}</strong>, "Bascule Simple / Avancé sur l’onglet Clicker.")}
        {row("État", <strong>{running ? "En cours" : "Inactif"}</strong>)}
        {row("Mesuré", <code>{metricsLabel}</code>)}
      </Card>
    ) : advSection === "apparence" ? (
      <Card title="Interface">
        {row(
          "Thème",
          <Segmented
            ariaLabel="Thème"
            value={theme}
            options={[
              { value: "light", label: "Clair" },
              { value: "dark", label: "Sombre" },
              { value: "system", label: "Système" },
            ]}
            onChange={(v) => void onThemeSelect(v as ThemeMode)}
          />,
          "Clair, sombre ou système (préférence OS).",
        )}
        {row(
          "Overlay d’état",
          <Switch
            checked={overlayVisible}
            aria-label="Afficher l’overlay d’état"
            onChange={(next) => {
              setOverlayVisible(next);
              void invoke("set_overlay_visible", { visible: next });
              void persistUi(advanced, next);
            }}
          />,
          "Fenêtre flottante hors focus.",
        )}
      </Card>
    ) : advSection === "raccourcis" ? (
      <div className="settings-hotkeys-embed">
        <HotkeySettings onBindingsChange={onHotkeysChange} />
      </div>
    ) : advSection === "processus" ? (
      <Card title="Filtre de processus">
        <Switch
          checked={processFilter.enabled}
          disabled={running}
          label="Activer le filtre"
          onChange={(on) => void persistProcessFilter({ ...processFilter, enabled: on })}
        />
        <p className="hint">Mode</p>
        <RadioGroup
          name="process-mode"
          value={processFilter.mode}
          disabled={running || !processFilter.enabled}
          options={[
            { value: "deny", label: "Bloquer la liste" },
            { value: "allow", label: "Autoriser seulement la liste" },
          ]}
          onChange={(v) =>
            void persistProcessFilter({ ...processFilter, mode: v as ProcessFilter["mode"] })
          }
        />
        <label className="field">
          <span>Ajouter un .exe</span>
          <div className="actions wrap">
            {liveExes.length > 0 ? (
              <select
                value=""
                disabled={running || !processFilter.enabled}
                aria-label="Processus visibles"
                onChange={(e) => addProcessName(e.target.value)}
              >
                <option value="">Choisir un processus…</option>
                {liveExes
                  .filter((n) => !processFilter.names.includes(n))
                  .map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
              </select>
            ) : null}
            <input
              type="text"
              placeholder="ex. game.exe"
              value={processDraft}
              disabled={running || !processFilter.enabled}
              onChange={(e) => setProcessDraft(e.target.value)}
              style={{ flex: 1, minWidth: "8rem" }}
            />
            <button
              type="button"
              disabled={running || !processFilter.enabled || !processDraft.trim()}
              onClick={() => {
                addProcessName(processDraft);
                setProcessDraft("");
              }}
            >
              Ajouter
            </button>
          </div>
        </label>
        {processFilter.names.length === 0 ? (
          <p className="hint">Aucun processus listé.</p>
        ) : (
          <ul className="preset-list">
            {processFilter.names.map((n) => (
              <li key={n}>
                <div className="preset-item">
                  <code>{n}</code>
                  <button
                    type="button"
                    className="ghost"
                    disabled={running}
                    onClick={() =>
                      void persistProcessFilter({
                        ...processFilter,
                        names: processFilter.names.filter((x) => x !== n),
                      })
                    }
                  >
                    Retirer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">
          Persisté dans settings.json. Quand le filtre est actif, le clicker ignore les clics
          hors règle ; les macros attendent que le premier plan matche (autoriser / bloquer).
        </p>
      </Card>
    ) : (
      <Card title="Maintenance">
        <p className="hint">
          Fichier : <code>settings.json</code> dans le dossier config de l’app
          (<code>com.steverothier.caster</code>).
        </p>
        <button
          type="button"
          className="danger"
          disabled={running}
          onClick={() => void resetClickerDefaults()}
        >
          Réinitialiser le clicker
        </button>
        <p className="hint">
          {resetDone
            ? "Réglages clicker restaurés aux défauts."
            : "Remet entrée, timing, cible, limites et zones aux valeurs par défaut. Presets et raccourcis sont conservés."}
        </p>
      </Card>
    );

  return (
    <section className="settings-panel workspace-panel">
      <div className="clicker-scroll">
        <div className="settings-layout">
          <nav className="settings-rail" aria-label="Sections paramètres">
            {ADV_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={["settings-rail-item", advSection === s.id ? "active" : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setAdvSection(s.id)}
              >
                <span className="settings-rail-icon" aria-hidden>
                  {s.icon}
                </span>
                <span>{s.label}</span>
              </button>
            ))}
          </nav>
          <div key={advSection} className="settings-pane clicker-section-pane">
            <header className="settings-pane-head">
              <h3 className="settings-pane-title">
                {ADV_SECTIONS.find((s) => s.id === advSection)?.label ?? ""}
              </h3>
              <p className="hint">
                Réglages applicatifs — le comportement clicker reste dans l’onglet Clicker.
              </p>
            </header>
            {sectionContent}
          </div>
        </div>
      </div>
    </section>
  );
}
