import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Infinity, Keyboard } from "lucide-react";
import { Segmented, Switch } from "../ui";
import { InspectorSection } from "../ui/shell";
import { useT } from "../i18n";
import { WheelNumberInput } from "../ui/WheelNumberInput";
import {
  ProcessFilterPanel,
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
  const docRef = useRef(doc);
  docRef.current = doc;
  const lastRepeatRef = useRef(Math.max(1, doc.repeatCount || 1));
  const hotkeyBtnRef = useRef<HTMLButtonElement>(null);

  const continuous = doc.repeatCount === 0;
  const repeatMode = continuous ? "infinite" : "count";

  useEffect(() => {
    if (doc.repeatCount > 0) lastRepeatRef.current = doc.repeatCount;
  }, [doc.repeatCount]);

  const triggerLabel =
    doc.trigger &&
    typeof doc.trigger === "object" &&
    doc.trigger.type === "hotkey"
      ? triggerHotkeyLabel(doc.trigger)
      : null;

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

  return (
    <div className="caster-macro-settings">
      <InspectorSection title={t("macros.settings.description")}>
        <div className="caster-field">
          <p className="caster-macro-settings-field-hint">
            {t("macros.settings.descriptionHint")}
          </p>
          <textarea
            className="caster-macro-settings-description"
            rows={3}
            disabled={locked}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            value={doc.description ?? ""}
            placeholder={t("macros.settings.descriptionPlaceholder")}
            aria-label={t("macros.settings.description")}
            onChange={(e) =>
              onChange({ ...doc, description: e.target.value })
            }
          />
        </div>
      </InspectorSection>

      <InspectorSection title={t("macros.settings.trigger")}>
        <div className="caster-field">
          <span>{t("macros.toolbar.metaHotkey")}</span>
          <p className="caster-macro-settings-field-hint">
            {t("macros.settings.hotkeyHint")}
          </p>
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
        </div>
      </InspectorSection>

      <InspectorSection title={t("macros.settings.execution")}>
        <div className="caster-field">
          <span>{t("macros.toolbar.repeatAria")}</span>
          <p className="caster-macro-settings-field-hint">
            {t("macros.settings.repeatHint")}
          </p>
          <Segmented
            ariaLabel={t("macros.toolbar.repeatAria")}
            value={repeatMode}
            disabled={locked}
            options={[
              { value: "count", label: t("macros.settings.repeatCount") },
              {
                value: "infinite",
                label: (
                  <span className="caster-macro-settings-inf-label">
                    <Infinity size={13} aria-hidden />
                    {t("macros.settings.repeatInfinite")}
                  </span>
                ),
              },
            ]}
            onChange={(mode) => {
              if (mode === "infinite") {
                onChange({ ...doc, repeatCount: 0 });
                return;
              }
              onChange({
                ...doc,
                repeatCount: Math.max(1, lastRepeatRef.current),
              });
            }}
          />
          {repeatMode === "count" ? (
            <WheelNumberInput
              className="caster-macro-settings-input"
              min={1}
              value={doc.repeatCount}
              disabled={locked}
              aria-label={t("macros.toolbar.repeatAria")}
              onValueChange={(n) =>
                onChange({ ...doc, repeatCount: Math.max(1, n) })
              }
            />
          ) : null}
        </div>
      </InspectorSection>

      <InspectorSection title={t("macros.settings.process")}>
        <div className="caster-macro-settings-process">
          <ProcessFilterPanel
            embedded
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
      </InspectorSection>

      <InspectorSection title={t("macros.permissions.label")}>
        <div className="caster-macro-settings-perms">
          <label className="caster-macro-settings-perm-row">
            <span className="caster-macro-settings-perm-text">
              <span className="caster-macro-settings-perm-label">
                {t("scripts.permissions.network")}
              </span>
            </span>
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
          <label className="caster-macro-settings-perm-row">
            <span className="caster-macro-settings-perm-text">
              <span className="caster-macro-settings-perm-label">
                {t("scripts.permissions.process")}
              </span>
            </span>
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
      </InspectorSection>

      <InspectorSection title={t("macros.editorTabs.variables")}>
        {usedVariables.length === 0 ? (
          <p className="caster-macro-settings-field-hint">
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
      </InspectorSection>
    </div>
  );
}
