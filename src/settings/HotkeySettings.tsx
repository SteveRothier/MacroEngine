import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { chordLabel, eventToVk, type HotkeyBindings, vkLabel } from "../macros/types";
import { useToast } from "../ui/shell";
import { useT } from "../i18n";

const DEFAULTS: HotkeyBindings = {
  actionVk: 0x75,
  actionCtrl: false,
  actionAlt: false,
  actionShift: false,
  macroVk: 0x78,
  pauseVk: 0x76,
  emergencyVk: 0x77,
  scriptVk: 0x79,
};

type CaptureSlot = "action" | "macro" | "pause" | "emergency" | "script" | null;

type Props = {
  onBindingsChange?: (b: HotkeyBindings) => void;
};

export function HotkeySettings({ onBindingsChange }: Props) {
  const toast = useToast();
  const t = useT();
  const [bindings, setBindings] = useState<HotkeyBindings>(DEFAULTS);
  const [capture, setCapture] = useState<CaptureSlot>(null);

  useEffect(() => {
    void invoke<HotkeyBindings>("get_hotkey_bindings")
      .then((b) =>
        setBindings({
          ...DEFAULTS,
          ...b,
          actionCtrl: !!b.actionCtrl,
          actionAlt: !!b.actionAlt,
          actionShift: !!b.actionShift,
          pauseVk: b.pauseVk ?? DEFAULTS.pauseVk,
        }),
      )
      .catch(() => setBindings(DEFAULTS));
  }, []);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (!capture) return;
      e.preventDefault();
      e.stopPropagation();
      const vk = eventToVk(e);
      if (vk == null) return;
      setBindings((prev) => {
        if (capture === "action") {
          return {
            ...prev,
            actionVk: vk,
            actionCtrl: e.ctrlKey,
            actionAlt: e.altKey,
            actionShift: e.shiftKey,
          };
        }
        if (capture === "macro") return { ...prev, macroVk: vk };
        if (capture === "pause") return { ...prev, pauseVk: vk };
        if (capture === "script") return { ...prev, scriptVk: vk };
        return { ...prev, emergencyVk: vk };
      });
      setCapture(null);
    },
    [capture],
  );

  useEffect(() => {
    if (!capture) return;
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capture, onKey]);

  async function save() {
    try {
      const next = await invoke<HotkeyBindings>("set_hotkey_bindings", {
        bindings,
      });
      const normalized = {
        ...DEFAULTS,
        ...next,
        actionCtrl: !!next.actionCtrl,
        actionAlt: !!next.actionAlt,
        actionShift: !!next.actionShift,
        pauseVk: next.pauseVk ?? DEFAULTS.pauseVk,
        scriptVk: next.scriptVk ?? DEFAULTS.scriptVk,
      };
      setBindings(normalized);
      onBindingsChange?.(normalized);
      toast.success(t("settings.hotkeys.saved"));
    } catch {
      toast.error(t("settings.hotkeys.saveFailed"));
    }
  }

  function resetDefaults() {
    setBindings(DEFAULTS);
  }

  const pause = bindings.pauseVk ?? 0x76;
  const script = bindings.scriptVk ?? 0x79;
  let conflict: string | null = null;
  if (bindings.actionVk === bindings.macroVk) {
    conflict = t("settings.hotkeys.conflictClickerMacro");
  } else if (bindings.actionVk === pause) {
    conflict = t("settings.hotkeys.conflictClickerPause");
  } else if (bindings.actionVk === bindings.emergencyVk) {
    conflict = t("settings.hotkeys.conflictClickerEmergency");
  } else if (bindings.actionVk === script) {
    conflict = t("settings.hotkeys.conflictClickerScript");
  } else if (bindings.macroVk === pause) {
    conflict = t("settings.hotkeys.conflictMacroPause");
  } else if (bindings.macroVk === bindings.emergencyVk) {
    conflict = t("settings.hotkeys.conflictMacroEmergency");
  } else if (bindings.macroVk === script) {
    conflict = t("settings.hotkeys.conflictMacroScript");
  } else if (pause === bindings.emergencyVk) {
    conflict = t("settings.hotkeys.conflictPauseEmergency");
  } else if (pause === script) {
    conflict = t("settings.hotkeys.conflictPauseScript");
  } else if (script === bindings.emergencyVk) {
    conflict = t("settings.hotkeys.conflictScriptEmergency");
  }

  return (
    <>
      <p className="caster-settings-group-hint">{t("settings.hotkeys.groupHint")}</p>
      {conflict ? <p className="caster-settings-warn">{conflict}</p> : null}
      <div className="caster-hotkey-settings">
        <div className="caster-hotkey-row caster-hotkey-row--featured">
          <span className="caster-hotkey-label">{t("settings.hotkeys.clicker")}</span>
          <code className="caster-settings-mono">{chordLabel(bindings)}</code>
          <button
            type="button"
            className={[
              "caster-btn",
              capture === "action" ? "caster-btn-primary" : "caster-btn-ghost",
            ].join(" ")}
            onClick={() => setCapture("action")}
          >
            {capture === "action" ? "…" : t("settings.hotkeys.capture")}
          </button>
        </div>
        {(
          [
            ["pause", "settings.hotkeys.pause", bindings.pauseVk ?? 0x76],
            ["macro", "settings.hotkeys.macro", bindings.macroVk],
            ["script", "settings.hotkeys.script", bindings.scriptVk ?? 0x79],
            ["emergency", "settings.hotkeys.emergency", bindings.emergencyVk],
          ] as const
        ).map(([slot, labelKey, vk]) => (
          <div className="caster-hotkey-row" key={slot}>
            <span className="caster-hotkey-label">{t(labelKey)}</span>
            <code className="caster-settings-mono">{vkLabel(vk)}</code>
            <button
              type="button"
              className={[
                "caster-btn",
                capture === slot ? "caster-btn-primary" : "caster-btn-ghost",
              ].join(" ")}
              onClick={() => setCapture(slot)}
            >
              {capture === slot ? "…" : t("settings.hotkeys.capture")}
            </button>
          </div>
        ))}
        <div className="caster-field-row caster-hotkey-actions">
          <button
            type="button"
            className="caster-btn caster-btn-primary"
            disabled={Boolean(conflict)}
            onClick={() => void save()}
          >
            {t("common.save")}
          </button>
          <button type="button" className="caster-btn caster-btn-ghost" onClick={resetDefaults}>
            {t("common.defaults")}
          </button>
        </div>
      </div>
    </>
  );
}
