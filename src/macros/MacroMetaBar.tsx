import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Keyboard, Repeat } from "lucide-react";
import { useT } from "../i18n";
import { WheelNumberInput } from "../ui/WheelNumberInput";
import { Tooltip } from "../ui/shell";
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

type SharedProps = {
  doc: MacroDocument;
  locked: boolean;
  onChange: (next: MacroDocument) => void;
};

type NameProps = SharedProps & {
  onNameCommit?: (name: string) => void;
};

type ToolsProps = SharedProps & {
  macroId: string;
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

/** Name field only — lives in toolbar start. */
export function MacroMetaBar({
  doc,
  locked,
  onChange,
  onNameCommit,
}: NameProps) {
  const t = useT();
  return (
    <div className="caster-macro-meta">
      <label className="caster-macro-meta-row caster-macro-meta-row--name">
        <span className="sr-only">{t("macros.toolbar.metaName")}</span>
        <input
          className="caster-macro-meta-input caster-macro-meta-input--name"
          value={doc.name}
          disabled={locked}
          aria-label={t("macros.toolbar.metaName")}
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
    </div>
  );
}

/** Repeat + hotkey chips — live next to Processus in toolbar end. */
export function MacroMetaTools({
  doc,
  macroId,
  locked,
  onChange,
  onError,
}: ToolsProps) {
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

  const repeatToolRef = useRef<HTMLDivElement>(null);
  const hotkeyToolRef = useRef<HTMLDivElement>(null);
  const repeatInputRef = useRef<HTMLInputElement>(null);
  const hotkeyBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      const inRepeat = repeatToolRef.current?.contains(target) ?? false;
      const inHotkey = hotkeyToolRef.current?.contains(target) ?? false;
      if (!inRepeat && document.activeElement === repeatInputRef.current) {
        repeatInputRef.current?.blur();
      }
      if (!inHotkey && capturing) {
        setCapturing(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      window.removeEventListener("pointerdown", onPointerDown, true);
  }, [capturing]);

  return (
    <>
      <Tooltip content={t("macros.toolbar.repeatTitle")}>
        <div
          ref={repeatToolRef}
          className={[
            "caster-macro-meta-tool",
            locked ? "is-disabled" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onMouseDown={(e) => {
            if (locked) return;
            if (e.target === repeatInputRef.current) return;
            e.preventDefault();
            repeatInputRef.current?.focus();
          }}
        >
          <Repeat
            className="caster-macro-meta-tool-icon"
            size={14}
            aria-hidden
          />
          <WheelNumberInput
            ref={repeatInputRef}
            className="caster-macro-meta-tool-field caster-macro-meta-tool-field--repeat"
            min={0}
            value={doc.repeatCount}
            disabled={locked}
            aria-label={t("macros.toolbar.repeatAria")}
            onValueChange={(n) => onChange({ ...doc, repeatCount: n })}
          />
        </div>
      </Tooltip>
      <Tooltip content={t("macros.toolbar.metaHotkeyTitle")}>
        <div
          ref={hotkeyToolRef}
          className={[
            "caster-macro-meta-tool",
            "caster-macro-meta-tool--hotkey",
            capturing ? "is-capturing" : "",
            locked ? "is-disabled" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onMouseDown={(e) => {
            if (locked) return;
            if (e.target === hotkeyBtnRef.current) return;
            e.preventDefault();
            hotkeyBtnRef.current?.click();
          }}
        >
          <Keyboard
            className="caster-macro-meta-tool-icon"
            size={14}
            aria-hidden
          />
          <button
            ref={hotkeyBtnRef}
            type="button"
            className="caster-macro-meta-tool-field caster-macro-meta-tool-field--hotkey"
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
            {capturing
              ? "…"
              : (triggerLabel ?? t("macros.toolbar.metaHotkeyNone"))}
          </button>
        </div>
      </Tooltip>
    </>
  );
}
