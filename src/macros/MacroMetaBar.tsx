import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useT } from "../i18n";
import { KbdChip } from "../ui";
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

type Props = {
  doc: MacroDocument;
  macroId: string;
  locked: boolean;
  onChange: (next: MacroDocument) => void;
  onNameCommit?: (name: string) => void;
  onError: (message: string) => void;
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

export function MacroMetaBar({
  doc,
  macroId,
  locked,
  onChange,
  onNameCommit,
  onError,
}: Props) {
  const t = useT();
  const [capturing, setCapturing] = useState(false);
  const docRef = useRef(doc);
  docRef.current = doc;

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

  return (
    <div className="v2-macro-meta">
      <label className="v2-macro-meta-row">
        <span className="v2-macro-meta-label">{t("macros.toolbar.metaName")}</span>
        <input
          className="v2-macro-meta-input v2-macro-meta-input--name"
          value={doc.name}
          disabled={locked}
          onChange={(e) => onChange({ ...doc, name: e.target.value })}
          onBlur={(e) => onNameCommit?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </label>
      <label className="v2-macro-meta-row">
        <span className="v2-macro-meta-label">{t("macros.toolbar.metaRepeat")}</span>
        <input
          className="v2-macro-meta-input v2-macro-meta-input--repeat"
          type="number"
          min={0}
          value={doc.repeatCount}
          disabled={locked}
          onChange={(e) =>
            onChange({ ...doc, repeatCount: Number(e.target.value) })
          }
        />
      </label>
      <div className="v2-macro-meta-row v2-macro-meta-row--hotkey">
        <span className="v2-macro-meta-label">{t("macros.toolbar.metaHotkey")}</span>
        <button
          type="button"
          className={[
            "v2-macro-hotkey-btn",
            capturing ? "is-capturing" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={locked}
          title={t("macros.toolbar.metaHotkeyTitle")}
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
          <KbdChip className="v2-macro-hotkey-chip">
            {capturing ? "…" : triggerLabel ?? t("macros.toolbar.metaHotkeyNone")}
          </KbdChip>
        </button>
      </div>
    </div>
  );
}
