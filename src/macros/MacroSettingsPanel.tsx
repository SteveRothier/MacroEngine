import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, Infinity, Keyboard, Repeat, X } from "lucide-react";
import { Switch } from "../ui";
import { useT } from "../i18n";
import { WheelNumberInput } from "../ui/WheelNumberInput";
import {
  ProcessFilterPanel,
  processFilterModeLabel,
  processFilterScopeSummary,
  type ProcessFilter,
  type ProcessFilterPreset,
  type ProcessFilterScopeMode,
} from "../process";
import {
  eventToVk,
  hotkeyTriggerMatches,
  triggerHotkeyLabel,
  type HotkeyBindings,
  type KeyMods,
  type MacroDocument,
  type MacroTrigger,
} from "./types";

type LibRow = {
  name: string;
  triggerKey?: string | null;
  triggerMods?: KeyMods | null;
};

function captureMods(e: KeyboardEvent): KeyMods {
  return {
    ctrl: e.ctrlKey || e.metaKey,
    alt: e.altKey,
    shift: e.shiftKey,
  };
}

function triggerConflictsWithReserved(
  vk: number,
  mods: KeyMods,
  reserved: HotkeyBindings,
): boolean {
  if (vk === reserved.macroVk || vk === reserved.emergencyVk) return true;
  if (vk === reserved.actionVk) {
    return (
      !!mods.ctrl === !!reserved.actionCtrl &&
      !!mods.alt === !!reserved.actionAlt &&
      !!mods.shift === !!reserved.actionShift
    );
  }
  return false;
}

function SettingsBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="caster-macro-settings-block">
      <h3 className="caster-macro-settings-block-title">{title}</h3>
      <div className="caster-macro-settings-block-body">{children}</div>
    </section>
  );
}

function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="caster-macro-settings-row">
      <div className="caster-macro-settings-row-text">
        <span className="caster-macro-settings-row-label">{label}</span>
        {hint ? (
          <span className="caster-macro-settings-row-hint">{hint}</span>
        ) : null}
      </div>
      <div className="caster-macro-settings-row-control">{children}</div>
    </div>
  );
}

export type MacroSettingsPanelProps = {
  doc: MacroDocument;
  macroId: string;
  locked: boolean;
  usedVariables: string[];
  onChange: (next: MacroDocument) => void;
  onError: (message: string) => void;
  processFilter: ProcessFilter;
  processFilterMode: ProcessFilterScopeMode;
  onProcessFilterModeChange: (mode: ProcessFilterScopeMode) => void;
  localProcessFilter: ProcessFilter;
  onLocalProcessFilterChange: (filter: ProcessFilter) => void;
  onOpenProcessSettings?: () => void;
  onGlobalProcessFilterChange?: (filter: ProcessFilter) => void;
  processFilterPresets?: ProcessFilterPreset[];
  onProcessFilterPresetsChange?: (presets: ProcessFilterPreset[]) => void;
};

export function MacroSettingsPanel({
  doc,
  macroId,
  locked,
  usedVariables,
  onChange,
  onError,
  processFilter,
  processFilterMode,
  onProcessFilterModeChange,
  localProcessFilter,
  onLocalProcessFilterChange,
  onOpenProcessSettings,
  onGlobalProcessFilterChange,
  processFilterPresets,
  onProcessFilterPresetsChange,
}: MacroSettingsPanelProps) {
  const t = useT();
  const [capturing, setCapturing] = useState(false);
  const [repeatFocused, setRepeatFocused] = useState(false);
  const [processOpen, setProcessOpen] = useState(false);
  const docRef = useRef(doc);
  docRef.current = doc;
  const lastRepeatRef = useRef(Math.max(1, doc.repeatCount || 1));
  const hotkeyBtnRef = useRef<HTMLButtonElement>(null);
  const processDialogId = useId();

  const continuous = doc.repeatCount === 0;
  const showInfinity = continuous && !repeatFocused;

  useEffect(() => {
    if (doc.repeatCount > 0) lastRepeatRef.current = doc.repeatCount;
  }, [doc.repeatCount]);
  const triggerLabel =
    doc.trigger &&
    typeof doc.trigger === "object" &&
    doc.trigger.type === "hotkey"
      ? triggerHotkeyLabel(doc.trigger)
      : null;
  const processModeLabel = processFilterModeLabel(processFilterMode, t);
  const processDetail = processFilterScopeSummary(
    processFilterMode,
    processFilter,
    localProcessFilter,
    t,
  );

  useEffect(() => {
    if (!capturing || locked) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(false);
        return;
      }
      const vk = eventToVk(e);
      if (vk == null) return;
      const mods = captureMods(e);
      setCapturing(false);
      void (async () => {
        try {
          const reserved = await invoke<HotkeyBindings>("get_hotkey_bindings");
          if (triggerConflictsWithReserved(vk, mods, reserved)) {
            onError(t("macros.toast.hotkeyReserved"));
            return;
          }
          const lib = await invoke<LibRow[]>("list_macro_library");
          const clash = lib.find((m) => {
            if (m.name === macroId || !m.triggerKey) return false;
            const otherVk = Number(m.triggerKey);
            if (!Number.isFinite(otherVk)) return false;
            const otherTrigger: MacroTrigger = {
              type: "hotkey",
              key: String(otherVk),
              mods: m.triggerMods ?? undefined,
            };
            return hotkeyTriggerMatches(otherTrigger, vk, mods);
          });
          if (clash) {
            onError(t("macros.toast.hotkeyClash", { name: clash.name }));
            return;
          }
          onChange({
            ...docRef.current,
            trigger: { type: "hotkey", key: String(vk), mods },
          });
        } catch {
          onError(t("macros.toast.hotkeySaveFailed"));
        }
      })();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, locked, macroId, onChange, onError, t]);

  useEffect(() => {
    if (locked) setCapturing(false);
  }, [locked]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (hotkeyBtnRef.current?.contains(target)) return;
      if (capturing) setCapturing(false);
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      window.removeEventListener("pointerdown", onPointerDown, true);
  }, [capturing]);

  useEffect(() => {
    if (!processOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setProcessOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [processOpen]);

  const processSheet =
    processOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="caster-dialog-overlay"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setProcessOpen(false);
            }}
          >
            <div
              className="caster-dialog caster-macro-process-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby={processDialogId}
            >
              <div className="caster-macro-process-sheet-head">
                <h2 id={processDialogId} className="caster-dialog-title">
                  {t("macros.settings.process")}
                </h2>
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn"
                  aria-label={t("common.close")}
                  onClick={() => setProcessOpen(false)}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
              <div className="caster-macro-process-sheet-body">
                <ProcessFilterPanel
                  filter={processFilter}
                  mode={processFilterMode}
                  onModeChange={onProcessFilterModeChange}
                  localFilter={localProcessFilter}
                  onLocalFilterChange={onLocalProcessFilterChange}
                  disabled={locked}
                  onOpenSettings={onOpenProcessSettings}
                  onGlobalFilterChange={onGlobalProcessFilterChange}
                  presets={processFilterPresets}
                  onPresetsChange={onProcessFilterPresetsChange}
                />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="caster-macro-settings">
      <SettingsBlock title={t("macros.settings.execution")}>
        <SettingsRow
          label={t("macros.toolbar.repeatAria")}
          hint={t("macros.settings.repeatHint")}
        >
          <div className="caster-macro-settings-repeat-combo">
            <button
              type="button"
              className={[
                "caster-macro-settings-infinity-btn",
                continuous ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={locked}
              aria-pressed={continuous}
              aria-label={t("macros.settings.continuous")}
              title={t("macros.settings.continuous")}
              onClick={() =>
                onChange({
                  ...doc,
                  repeatCount: continuous ? lastRepeatRef.current : 0,
                })
              }
            >
              <Infinity size={14} aria-hidden />
            </button>
            <div
              className={[
                "caster-macro-settings-repeat",
                continuous ? "is-continuous" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <Repeat
                size={14}
                aria-hidden
                className="caster-macro-settings-repeat-icon"
              />
              {showInfinity ? (
                <span className="caster-macro-settings-infinity" aria-hidden>
                  ∞
                </span>
              ) : null}
              <WheelNumberInput
                className={[
                  "caster-macro-settings-input",
                  showInfinity ? "is-infinity-hidden" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                min={0}
                value={continuous ? 0 : doc.repeatCount}
                disabled={locked}
                aria-label={t("macros.toolbar.repeatAria")}
                aria-hidden={showInfinity || undefined}
                tabIndex={showInfinity ? -1 : undefined}
                onFocus={() => setRepeatFocused(true)}
                onBlur={() => setRepeatFocused(false)}
                onValueChange={(n) => onChange({ ...doc, repeatCount: n })}
              />
            </div>
          </div>
        </SettingsRow>
      </SettingsBlock>

      <SettingsBlock title={t("macros.settings.trigger")}>
        <SettingsRow
          label={t("macros.toolbar.metaHotkey")}
          hint={t("macros.settings.hotkeyHint")}
        >
          <button
            ref={hotkeyBtnRef}
            type="button"
            className={[
              "caster-macro-settings-hotkey",
              capturing ? "is-capturing" : "",
              !triggerLabel && !capturing ? "is-empty" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={locked}
            aria-label={
              capturing
                ? t("macros.params.hotkeyCapturing")
                : triggerLabel
                  ? t("macros.params.hotkeyValue", { label: triggerLabel })
                  : t("macros.params.hotkeySet")
            }
            onClick={() => setCapturing((v) => !v)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (locked) return;
              setCapturing(false);
              onChange({ ...doc, trigger: { type: "manual" } });
            }}
          >
            <Keyboard size={14} aria-hidden />
            <span>
              {capturing
                ? t("macros.params.hotkeyCapturing")
                : (triggerLabel ?? t("macros.toolbar.metaHotkeyNone"))}
            </span>
          </button>
        </SettingsRow>
      </SettingsBlock>

      <SettingsBlock title={t("macros.settings.process")}>
        <button
          type="button"
          className="caster-macro-settings-process-summary"
          disabled={locked}
          aria-haspopup="dialog"
          aria-expanded={processOpen}
          aria-label={t("common.process.toolAria", {
            mode: processModeLabel,
            detail: processDetail,
          })}
          onClick={() => setProcessOpen(true)}
        >
          <span className="caster-macro-settings-process-mode">
            {processModeLabel}
          </span>
          <span className="caster-macro-settings-process-detail">
            {processDetail}
          </span>
          <ChevronRight
            size={14}
            aria-hidden
            className="caster-macro-settings-process-chevron"
          />
        </button>
      </SettingsBlock>

      <SettingsBlock title={t("macros.permissions.label")}>
        <div className="caster-macro-settings-perm-grid">
          <label className="caster-macro-settings-perm">
            <span>{t("scripts.permissions.network")}</span>
            <Switch
              checked={!!doc.allowNetwork}
              disabled={locked}
              aria-label={t("scripts.permissions.network")}
              onChange={(checked) =>
                onChange({
                  ...doc,
                  schemaVersion: Math.max(doc.schemaVersion, 9),
                  allowNetwork: checked,
                })
              }
            />
          </label>
          <label className="caster-macro-settings-perm">
            <span>{t("scripts.permissions.process")}</span>
            <Switch
              checked={!!doc.allowProcess}
              disabled={locked}
              aria-label={t("scripts.permissions.process")}
              onChange={(checked) =>
                onChange({
                  ...doc,
                  schemaVersion: Math.max(doc.schemaVersion, 9),
                  allowProcess: checked,
                })
              }
            />
          </label>
        </div>
      </SettingsBlock>

      <SettingsBlock title={t("macros.editorTabs.variables")}>
        {usedVariables.length === 0 ? (
          <p className="caster-macro-settings-empty">
            {t("macros.editorTabs.variablesLead")}
          </p>
        ) : (
          <ul className="caster-macro-var-list caster-macro-var-list--settings">
            {usedVariables.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        )}
      </SettingsBlock>

      {processSheet}
    </div>
  );
}
