import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { chordLabel, eventToVk, type HotkeyBindings, vkLabel } from "../macros/types";
import { InspectorSection, useToast } from "../ui/v2";

const DEFAULTS: HotkeyBindings = {
  actionVk: 0x75,
  actionCtrl: false,
  actionAlt: false,
  actionShift: false,
  macroVk: 0x78,
  pauseVk: 0x76,
  emergencyVk: 0x77,
};

function hotkeyConflict(b: HotkeyBindings): string | null {
  const pause = b.pauseVk ?? 0x76;
  if (b.actionVk === b.macroVk) return "Clicker et Macro partagent la même touche.";
  if (b.actionVk === pause) return "Clicker et Pause partagent la même touche.";
  if (b.actionVk === b.emergencyVk) return "Clicker et Urgence partagent la même touche.";
  if (b.macroVk === pause) return "Macro et Pause partagent la même touche.";
  if (b.macroVk === b.emergencyVk) return "Macro et Urgence partagent la même touche.";
  if (pause === b.emergencyVk) return "Pause et Urgence partagent la même touche.";
  return null;
}

type CaptureSlot = "action" | "macro" | "pause" | "emergency" | null;

type Props = {
  onBindingsChange?: (b: HotkeyBindings) => void;
};

export function HotkeySettings({ onBindingsChange }: Props) {
  const toast = useToast();
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
      };
      setBindings(normalized);
      onBindingsChange?.(normalized);
      toast.success("Raccourcis enregistrés");
    } catch {
      toast.error("Échec de l’enregistrement");
    }
  }

  function resetDefaults() {
    setBindings(DEFAULTS);
  }

  const conflict = hotkeyConflict(bindings);

  return (
    <InspectorSection title="Raccourcis globaux">
      <p className="v2-settings-pane-hint">
        Actifs hors focus (F6 clicker, F7 pause clicker, F9 macro, F8 urgence par
        défaut). F7 peut activer le parcours caret WebView si le focus est dans
        l’app — le raccourci global est mangé hors focus.
      </p>
      {conflict ? <p className="v2-settings-warn">{conflict}</p> : null}
      <div className="v2-hotkey-settings">
        <div className="v2-hotkey-row v2-hotkey-row--featured">
          <span className="v2-hotkey-label">Clicker</span>
          <code className="v2-settings-mono">{chordLabel(bindings)}</code>
          <button
            type="button"
            className={[
              "v2-btn",
              capture === "action" ? "v2-btn-primary" : "v2-btn-ghost",
            ].join(" ")}
            onClick={() => setCapture("action")}
          >
            {capture === "action" ? "…" : "Capturer"}
          </button>
        </div>
        {(
          [
            ["pause", "Pause clicker", bindings.pauseVk ?? 0x76],
            ["macro", "Macro", bindings.macroVk],
            ["emergency", "Urgence", bindings.emergencyVk],
          ] as const
        ).map(([slot, label, vk]) => (
          <div className="v2-hotkey-row" key={slot}>
            <span className="v2-hotkey-label">{label}</span>
            <code className="v2-settings-mono">{vkLabel(vk)}</code>
            <button
              type="button"
              className={[
                "v2-btn",
                capture === slot ? "v2-btn-primary" : "v2-btn-ghost",
              ].join(" ")}
              onClick={() => setCapture(slot)}
            >
              {capture === slot ? "…" : "Capturer"}
            </button>
          </div>
        ))}
        <div className="v2-field-row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="v2-btn v2-btn-primary"
            disabled={Boolean(conflict)}
            onClick={() => void save()}
          >
            Sauver
          </button>
          <button type="button" className="v2-btn v2-btn-ghost" onClick={resetDefaults}>
            Défauts
          </button>
        </div>
      </div>
    </InspectorSection>
  );
}
