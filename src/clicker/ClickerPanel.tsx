import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { EngineStatus, HotkeyBindings } from "../macros/types";
import { HotkeySettings } from "../settings/HotkeySettings";
import { applyTheme, type ThemeMode } from "../theme";
import { Card, Icons, RadioGroup, Segmented, Switch } from "../ui";
import { Select } from "../ui/v2";
import { useT } from "../i18n";
import {
  DEFAULT_CLICKER,
  DEFAULT_PROCESS_FILTER,
  type AppSettings,
  type ProcessFilter,
} from "./clickerTypes";
import { useClickerSettingsApi } from "./useClickerSettings";

type AdvSection = "general" | "apparence" | "raccourcis" | "processus" | "maintenance";
export type SettingsSectionId = AdvSection;

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
  const t = useT();
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

  const advSections: { id: AdvSection; label: string; icon: ReactNode }[] = [
    { id: "general", label: t("clicker.panel.general"), icon: Icons.info },
    { id: "apparence", label: t("clicker.panel.appearance"), icon: Icons.eye },
    { id: "raccourcis", label: t("clicker.panel.hotkeys"), icon: Icons.key },
    { id: "processus", label: t("clicker.panel.process"), icon: Icons.list },
    {
      id: "maintenance",
      label: t("clicker.panel.maintenance"),
      icon: Icons.wrench,
    },
  ];

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
    ? t("clicker.panel.clicksMetric", {
        cps: metrics.measuredCps.toFixed(1),
        n: metrics.clicksEmitted,
      })
    : t("common.empty");

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
      <Card title={t("clicker.panel.cardClicker")}>
        {row(
          t("settings.application.clickerMode"),
          <strong>
            {advanced ? t("common.advanced") : t("common.simple")}
          </strong>,
          t("clicker.panel.modeHint"),
        )}
        {row(
          t("settings.application.state"),
          <strong>
            {running ? t("common.running") : t("common.inactive")}
          </strong>,
        )}
        {row(t("clicker.panel.measured"), <code>{metricsLabel}</code>)}
      </Card>
    ) : advSection === "apparence" ? (
      <Card title={t("clicker.panel.cardInterface")}>
        {row(
          t("settings.application.theme"),
          <Segmented
            ariaLabel={t("settings.application.themeAria")}
            value={theme}
            options={[
              { value: "light", label: t("common.light") },
              { value: "dark", label: t("common.dark") },
              { value: "system", label: t("common.system") },
            ]}
            onChange={(v) => void onThemeSelect(v as ThemeMode)}
          />,
          t("clicker.panel.themeHint"),
        )}
        {row(
          t("clicker.panel.statusOverlay"),
          <Switch
            checked={overlayVisible}
            aria-label={t("clicker.panel.statusOverlayAria")}
            onChange={(next) => {
              setOverlayVisible(next);
              void invoke("set_overlay_visible", { visible: next });
              void persistUi(advanced, next);
            }}
          />,
          t("clicker.panel.statusOverlayHint"),
        )}
      </Card>
    ) : advSection === "raccourcis" ? (
      <div className="settings-hotkeys-embed">
        <HotkeySettings onBindingsChange={onHotkeysChange} />
      </div>
    ) : advSection === "processus" ? (
      <Card title={t("clicker.panel.cardProcessFilter")}>
        <Switch
          checked={processFilter.enabled}
          disabled={running}
          label={t("clicker.panel.enableFilter")}
          onChange={(on) => void persistProcessFilter({ ...processFilter, enabled: on })}
        />
        <p className="hint">{t("clicker.panel.mode")}</p>
        <RadioGroup
          name="process-mode"
          value={processFilter.mode}
          disabled={running || !processFilter.enabled}
          options={[
            { value: "deny", label: t("clicker.panel.modeDeny") },
            { value: "allow", label: t("clicker.panel.modeAllow") },
          ]}
          onChange={(v) =>
            void persistProcessFilter({ ...processFilter, mode: v as ProcessFilter["mode"] })
          }
        />
        <label className="field">
          <span>{t("clicker.panel.addExe")}</span>
          <div className="actions wrap">
            {liveExes.length > 0 ? (
              <Select
                className="v2-select"
                value=""
                disabled={running || !processFilter.enabled}
                ariaLabel={t("clicker.panel.visibleProcesses")}
                options={[
                  { value: "", label: t("clicker.panel.chooseProcess") },
                  ...liveExes
                    .filter((n) => !processFilter.names.includes(n))
                    .map((n) => ({ value: n, label: n })),
                ]}
                onChange={(v) => addProcessName(v)}
              />
            ) : null}
            <input
              type="text"
              placeholder={t("clicker.panel.exePlaceholder")}
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
              {t("clicker.panel.add")}
            </button>
          </div>
        </label>
        {processFilter.names.length === 0 ? (
          <p className="hint">{t("clicker.panel.noneListed")}</p>
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
                    {t("clicker.panel.remove")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">{t("clicker.panel.filterPersistHint")}</p>
      </Card>
    ) : (
      <Card title={t("clicker.panel.cardMaintenance")}>
        <p className="hint">
          {t("clicker.panel.configFileHintBefore")}{" "}
          <code>settings.json</code> {t("clicker.panel.configFileHintMid")} (
          <code>com.steverothier.caster</code>).
        </p>
        <button
          type="button"
          className="danger"
          disabled={running}
          onClick={() => void resetClickerDefaults()}
        >
          {t("clicker.panel.resetClicker")}
        </button>
        <p className="hint">
          {resetDone
            ? t("clicker.panel.resetDone")
            : t("clicker.panel.resetHint")}
        </p>
      </Card>
    );

  return (
    <section className="settings-panel workspace-panel">
      <div className="clicker-scroll">
        <div className="settings-layout">
          <nav className="settings-rail" aria-label={t("settings.railAria")}>
            {advSections.map((s) => (
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
                {advSections.find((s) => s.id === advSection)?.label ?? ""}
              </h3>
              <p className="hint">{t("clicker.panel.paneHint")}</p>
            </header>
            {sectionContent}
          </div>
        </div>
      </div>
    </section>
  );
}
