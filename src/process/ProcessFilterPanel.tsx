import { useEffect, useState } from "react";
import { useT, type TFunction } from "../i18n";
import {
  ProcessFilterEditor,
  ProcessFilterPresetsMenu,
} from "./ProcessFilterEditor";
import {
  DEFAULT_PROCESS_FILTER,
  displayExeName,
  type ProcessFilter,
  type ProcessFilterPreset,
  type ProcessFilterScopeMode,
} from "./types";
import { withLocalEnabled } from "./useProcessExePicker";

export type ProcessFilterPanelProps = {
  filter: ProcessFilter;
  mode: ProcessFilterScopeMode;
  onModeChange: (mode: ProcessFilterScopeMode) => void;
  localFilter: ProcessFilter;
  onLocalFilterChange: (filter: ProcessFilter) => void;
  disabled?: boolean;
  onOpenSettings?: () => void;
  onGlobalFilterChange?: (filter: ProcessFilter) => void;
  presets?: ProcessFilterPreset[];
  onPresetsChange?: (presets: ProcessFilterPreset[]) => void;
};

function filterSummary(filter: ProcessFilter, t: TFunction): string {
  if (!filter.enabled) return t("common.process.allProcesses");
  const names = filter.names.filter((n) => n.trim().length > 0);
  if (names.length === 0) {
    return filter.mode === "allow"
      ? t("common.process.noneAllowed")
      : t("common.process.allAllowed");
  }
  const list = names.slice(0, 3).map(displayExeName).join(", ");
  const extra = names.length > 3 ? ` +${names.length - 3}` : "";
  return filter.mode === "allow"
    ? t("common.process.allowList", { list: `${list}${extra}` })
    : t("common.process.denyList", { list: `${list}${extra}` });
}

export function ProcessFilterPanel({
  filter,
  mode,
  onModeChange,
  localFilter,
  onLocalFilterChange,
  disabled,
  onOpenSettings,
  onGlobalFilterChange,
  presets,
  onPresetsChange,
}: ProcessFilterPanelProps) {
  const t = useT();
  const [editGlobal, setEditGlobal] = useState(false);

  useEffect(() => {
    if (mode !== "inherit") setEditGlobal(false);
  }, [mode]);

  useEffect(() => {
    if (mode !== "local" || localFilter.enabled) return;
    onLocalFilterChange(withLocalEnabled(localFilter));
  }, [mode, localFilter, onLocalFilterChange]);

  const effective =
    mode === "off"
      ? DEFAULT_PROCESS_FILTER
      : mode === "local"
        ? localFilter
        : filter;
  const summary =
    mode === "off"
      ? t("common.process.offSummary")
      : filterSummary(effective, t);

  const handleModeChange = (value: ProcessFilterScopeMode) => {
    onModeChange(value);
  };

  const presetTarget = mode === "local" ? localFilter : filter;
  const onPresetApply =
    mode === "local"
      ? (next: ProcessFilter) => onLocalFilterChange(withLocalEnabled(next))
      : onGlobalFilterChange;

  const copyToGlobal =
    mode === "local" && onGlobalFilterChange
      ? () =>
          onGlobalFilterChange({
            ...localFilter,
            enabled: true,
            names: [...localFilter.names],
          })
      : undefined;
  const importFromGlobal =
    mode === "local" && onGlobalFilterChange
      ? () => onLocalFilterChange(withLocalEnabled({ ...filter }))
      : undefined;

  return (
    <div className="caster-process-filter-panel">
      <header className="caster-process-filter-panel-head">
        <div className="caster-process-filter-panel-title-row">
          <h3 className="caster-process-filter-panel-title">
            {t("common.process.panelTitle")}
          </h3>
          {onPresetsChange && onPresetApply ? (
            <ProcessFilterPresetsMenu
              filter={presetTarget}
              onApply={onPresetApply}
              disabled={disabled}
              presets={presets}
              onPresetsChange={onPresetsChange}
              onCopyToGlobal={copyToGlobal}
              onImportFromGlobal={importFromGlobal}
            />
          ) : null}
        </div>
        <div
          className="caster-segmented caster-segmented--wide"
          role="group"
          aria-label={t("common.process.modeAria")}
        >
          {(
            [
              ["inherit", t("common.process.modeInherit")],
              ["off", t("common.process.modeOff")],
              ["local", t("common.process.modeLocal")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={[
                "caster-segmented-btn",
                mode === value ? "active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={disabled}
              onClick={() => handleModeChange(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {mode !== "local" ? (
          <p className="caster-process-filter-panel-summary">{summary}</p>
        ) : null}

        {mode === "off" ? (
          <p className="caster-process-filter-panel-hint">
            {t("common.process.offHint")}
          </p>
        ) : null}
        {mode === "inherit" ? (
          <>
            <p className="caster-process-filter-panel-hint">
              {t("common.process.inheritHint")}
            </p>
            <div className="caster-process-filter-panel-head-actions">
              {onGlobalFilterChange ? (
                <button
                  type="button"
                  className="caster-btn caster-btn-ghost caster-btn-sm"
                  disabled={disabled}
                  onClick={() => setEditGlobal((v) => !v)}
                >
                  {editGlobal
                    ? t("common.process.hideGlobal")
                    : t("common.process.editGlobal")}
                </button>
              ) : null}
              {onOpenSettings ? (
                <button
                  type="button"
                  className="caster-btn caster-btn-ghost caster-btn-sm"
                  onClick={onOpenSettings}
                >
                  {t("common.process.openSecurity")}
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </header>

      {mode === "local" ? (
        <div className="caster-process-filter-panel-local">
          <ProcessFilterEditor
            filter={localFilter}
            onChange={onLocalFilterChange}
            disabled={disabled}
            forceEnabled
            presets={presets}
            onPresetsChange={onPresetsChange}
            showPresetsMenu={false}
            onCopyToGlobal={copyToGlobal}
            onImportFromGlobal={importFromGlobal}
          />
        </div>
      ) : null}

      {mode === "inherit" && editGlobal && onGlobalFilterChange ? (
        <div className="caster-process-filter-panel-local">
          <ProcessFilterEditor
            filter={filter}
            onChange={onGlobalFilterChange}
            disabled={disabled}
            showEnabledToggle
            presets={presets}
            onPresetsChange={onPresetsChange}
            showPresetsMenu={false}
          />
        </div>
      ) : null}
    </div>
  );
}
