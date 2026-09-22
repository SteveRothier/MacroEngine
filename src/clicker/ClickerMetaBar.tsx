import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { KbdChip } from "../ui";
import { useToast } from "../ui/shell";
import {
  eventToVk,
  hotkeyTriggerMatches,
  triggerHotkeyLabel,
  type HotkeyBindings,
  type KeyMods,
  type MacroTrigger,
} from "../macros/types";
import { MANUAL_TRIGGER, type ClickerTrigger } from "./clickerTypes";
import type { ClickerEditor } from "./useClickerEditor";

type LibMacro = {
  name: string;
  triggerKey?: string | null;
  triggerMods?: KeyMods | null;
};

type LibClicker = {
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

function conflictsReserved(
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

type Props = {
  editor: ClickerEditor;
};

/** Meta bar over the clicker studio — name + hotkey, same UX as MacroMetaBar. */
export function ClickerMetaBar({ editor: e }: Props) {
  const t = useT();
  const toast = useToast();
  const [capturing, setCapturing] = useState(false);

  const triggerLabel =
    e.trigger.type === "hotkey" ? triggerHotkeyLabel(e.trigger) : null;

  useEffect(() => {
    if (!capturing || e.locked) return;
    const onKey = (ev: KeyboardEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.key === "Escape") {
        setCapturing(false);
        return;
      }
      const vk = eventToVk(ev);
      if (vk == null) return;
      const mods = captureMods(ev);
      setCapturing(false);
      void (async () => {
        try {
          const reserved = await invoke<HotkeyBindings>("get_hotkey_bindings");
          if (conflictsReserved(vk, mods, reserved)) {
            toast.error(t("clicker.toasts.shortcutReserved"));
            return;
          }
          const macros = await invoke<LibMacro[]>("list_macro_library");
          const macroClash = macros.find((m) => {
            if (!m.triggerKey) return false;
            const otherVk = Number(m.triggerKey);
            if (!Number.isFinite(otherVk)) return false;
            const other: MacroTrigger = {
              type: "hotkey",
              key: String(otherVk),
              mods: m.triggerMods ?? undefined,
            };
            return hotkeyTriggerMatches(other, vk, mods);
          });
          if (macroClash) {
            toast.error(
              t("clicker.toasts.shortcutUsedByMacro", {
                name: macroClash.name,
              }),
            );
            return;
          }
          const clickers = await invoke<LibClicker[]>("list_clicker_library");
          const clickerClash = clickers.find((c) => {
            if (c.name === e.selectedPreset || !c.triggerKey) return false;
            const otherVk = Number(c.triggerKey);
            if (!Number.isFinite(otherVk)) return false;
            const other: ClickerTrigger = {
              type: "hotkey",
              key: String(otherVk),
              mods: c.triggerMods ?? undefined,
            };
            return hotkeyTriggerMatches(other, vk, mods);
          });
          if (clickerClash) {
            toast.error(
              t("clicker.toasts.shortcutUsedByClicker", {
                name: clickerClash.name,
              }),
            );
            return;
          }
          await e.setTrigger({ type: "hotkey", key: String(vk), mods });
          toast.success(t("clicker.toasts.triggerSaved"));
        } catch {
          toast.error(t("clicker.toasts.triggerSaveFailed"));
        }
      })();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, e, t, toast]);

  useEffect(() => {
    if (e.locked) setCapturing(false);
  }, [e.locked]);

  return (
    <div className="caster-macro-meta caster-clicker-meta">
      <label className="caster-macro-meta-row">
        <span className="caster-macro-meta-label">
          {t("clicker.meta.name")}
        </span>
        <input
          className="caster-macro-meta-input caster-macro-meta-input--name"
          value={e.presetName}
          disabled={e.editDisabled}
          onChange={(ev) => e.setPresetName(ev.target.value)}
          onBlur={(ev) => void e.onRenamePreset(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              (ev.target as HTMLInputElement).blur();
            }
          }}
        />
      </label>
      <div className="caster-macro-meta-row caster-macro-meta-row--hotkey">
        <span className="caster-macro-meta-label">
          {t("clicker.meta.hotkey")}
        </span>
        <button
          type="button"
          className={[
            "caster-macro-hotkey-btn",
            capturing ? "is-capturing" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={e.editDisabled}
          title={t("clicker.trigger.captureTitle")}
          aria-label={
            capturing
              ? t("clicker.trigger.capturing")
              : triggerLabel
                ? t("clicker.trigger.value", { label: triggerLabel })
                : t("clicker.trigger.set")
          }
          onClick={() => setCapturing((v) => !v)}
          onContextMenu={(ev) => {
            ev.preventDefault();
            if (e.editDisabled) return;
            setCapturing(false);
            void e.setTrigger(MANUAL_TRIGGER).then(
              () => toast.success(t("clicker.toasts.triggerRemoved")),
              () => toast.error(t("clicker.toasts.triggerRemoveFailed")),
            );
          }}
        >
          <KbdChip className="caster-macro-hotkey-chip">
            {capturing ? "…" : triggerLabel ?? t("clicker.trigger.none")}
          </KbdChip>
        </button>
      </div>
    </div>
  );
}
