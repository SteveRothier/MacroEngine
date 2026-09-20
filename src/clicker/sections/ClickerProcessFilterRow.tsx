import { useState } from "react";
import {
  DEFAULT_PROCESS_FILTER,
  normalizeExeName,
  type ClickerProcessFilterMode,
  type ProcessFilter,
  type ProcessFilterMode,
} from "../clickerTypes";
import { Select } from "../../ui/shell";
import { useT, type TFunction } from "../../i18n";

type Props = {
  filter: ProcessFilter;
  mode: ClickerProcessFilterMode;
  onModeChange: (mode: ClickerProcessFilterMode) => void;
  localFilter: ProcessFilter;
  onLocalFilterChange: (filter: ProcessFilter) => void;
  disabled?: boolean;
  onOpenSettings?: () => void;
};

function filterSummary(filter: ProcessFilter, t: TFunction): string {
  if (!filter.enabled) return t("clicker.process.allProcesses");
  const names = filter.names.filter((n) => n.trim().length > 0);
  if (names.length === 0) {
    return filter.mode === "allow"
      ? t("clicker.process.noneAllowed")
      : t("clicker.process.allAllowed");
  }
  const list = names.slice(0, 3).join(", ");
  const extra = names.length > 3 ? ` +${names.length - 3}` : "";
  return filter.mode === "allow"
    ? t("clicker.process.allowList", { list: `${list}${extra}` })
    : t("clicker.process.denyList", { list: `${list}${extra}` });
}

export function ClickerProcessFilterRow({
  filter,
  mode,
  onModeChange,
  localFilter,
  onLocalFilterChange,
  disabled,
  onOpenSettings,
}: Props) {
  const t = useT();
  const [draftExe, setDraftExe] = useState("");
  const effective =
    mode === "off"
      ? DEFAULT_PROCESS_FILTER
      : mode === "local"
        ? localFilter
        : filter;
  const summary =
    mode === "off"
      ? t("clicker.process.offSummary")
      : filterSummary(effective, t);

  const addExe = () => {
    const name = normalizeExeName(draftExe);
    setDraftExe("");
    if (!name || localFilter.names.some((n) => normalizeExeName(n) === name)) {
      return;
    }
    onLocalFilterChange({ ...localFilter, names: [...localFilter.names, name] });
  };

  return (
    <div className="caster-clicker-process-row">
      <span className="caster-clicker-process-label">
        {t("clicker.process.label")}
      </span>
      <span
        className={[
          "caster-clicker-process-badge",
          effective.enabled && mode !== "off"
            ? "caster-clicker-process-badge--active"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        title={summary}
      >
        {summary}
      </span>
      <Select
        className="caster-select caster-clicker-process-mode"
        value={mode}
        disabled={disabled}
        ariaLabel={t("clicker.process.modeAria")}
        options={[
          { value: "inherit", label: t("clicker.process.modeInherit") },
          { value: "off", label: t("clicker.process.modeOff") },
          { value: "local", label: t("clicker.process.modeLocal") },
        ]}
        onChange={(v) => onModeChange(v as ClickerProcessFilterMode)}
      />
      {mode === "inherit" && onOpenSettings ? (
        <button
          type="button"
          className="caster-btn caster-btn-ghost caster-clicker-process-link"
          onClick={onOpenSettings}
        >
          {t("clicker.process.settings")}
        </button>
      ) : null}

      {mode === "local" ? (
        <div className="caster-clicker-process-local">
          <label className="caster-clicker-process-local-toggle">
            <input
              type="checkbox"
              checked={localFilter.enabled}
              disabled={disabled}
              onChange={(e) =>
                onLocalFilterChange({
                  ...localFilter,
                  enabled: e.target.checked,
                })
              }
            />
            <span>{t("clicker.process.localEnabled")}</span>
          </label>
          <Select
            className="caster-select"
            value={localFilter.mode}
            disabled={disabled || !localFilter.enabled}
            ariaLabel={t("clicker.process.localModeAria")}
            options={[
              { value: "deny", label: t("clicker.process.localModeDeny") },
              { value: "allow", label: t("clicker.process.localModeAllow") },
            ]}
            onChange={(v) =>
              onLocalFilterChange({
                ...localFilter,
                mode: v as ProcessFilterMode,
              })
            }
          />
          <div className="caster-clicker-process-local-add">
            <input
              type="text"
              value={draftExe}
              disabled={disabled}
              placeholder={t("clicker.process.exePlaceholder")}
              aria-label={t("clicker.process.localAdd")}
              onChange={(e) => setDraftExe(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                addExe();
              }}
            />
            <button
              type="button"
              className="caster-btn caster-btn-ghost"
              disabled={disabled || draftExe.trim().length === 0}
              onClick={addExe}
            >
              {t("clicker.process.localAdd")}
            </button>
          </div>
          {localFilter.names.length === 0 ? (
            <p className="caster-clicker-hint">
              {t("clicker.process.localEmpty")}
            </p>
          ) : (
            <ul className="caster-clicker-process-local-list">
              {localFilter.names.map((name) => (
                <li key={name}>
                  <span>{name}</span>
                  <button
                    type="button"
                    className="caster-btn caster-btn-ghost"
                    disabled={disabled}
                    aria-label={t("clicker.process.localRemove")}
                    onClick={() =>
                      onLocalFilterChange({
                        ...localFilter,
                        names: localFilter.names.filter((n) => n !== name),
                      })
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
