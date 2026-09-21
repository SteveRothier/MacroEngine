import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT, type TFunction } from "../i18n";
import { pickScreenPointDetailed } from "../pick";
import { Select, useToast, type ActionPickerEntry } from "../ui/shell";
import { WheelNumberInput } from "../ui/WheelNumberInput";
import { ActionProps } from "./ActionProps";
import { actionDetail } from "./actionLabels";
import type { KeyMods, MacroAction } from "./types";

function mouseButtonOpts(t: TFunction) {
  return [
    { value: "left", label: t("macros.action.button.left") },
    { value: "right", label: t("macros.action.button.right") },
    { value: "middle", label: t("macros.action.button.middle") },
  ];
}

function positionOpts(t: TFunction) {
  return [
    { value: "cursor", label: t("macros.params.cursor") },
    { value: "position", label: t("macros.params.xy") },
  ];
}

type Props = {
  action: MacroAction;
  disabled?: boolean;
  onChange: (action: MacroAction) => void;
  branchAddMenuItems?: (branch: "then" | "else" | "body") => ActionPickerEntry[];
  onOpenScript?: (scriptId: string, label?: string) => void;
};

export function isComplexAction(type: MacroAction["type"]): boolean {
  return (
    type === "control.if" ||
    type === "control.while" ||
    type === "http.request" ||
    type === "json.path" ||
    type === "script.run" ||
    type === "process.run"
  );
}

function modsOf(action: { mods?: KeyMods }): KeyMods {
  return {
    ctrl: !!action.mods?.ctrl,
    alt: !!action.mods?.alt,
    shift: !!action.mods?.shift,
  };
}

function CompactXY({
  x,
  y,
  optional,
  disabled,
  onChangeXY,
}: {
  x: number | null | undefined;
  y: number | null | undefined;
  optional?: boolean;
  disabled?: boolean;
  onChangeXY: (x: number | null, y: number | null) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const isCursor = optional && x == null && y == null;

  async function onPick() {
    setPicking(true);
    try {
      const result = await pickScreenPointDetailed();
      if (!result.ok) {
        if (result.reason === "timeout" || result.reason === "error") {
          toast.info(t("macros.params.pickCancelled"));
        }
        return;
      }
      onChangeXY(result.point.x, result.point.y);
    } finally {
      setPicking(false);
    }
  }

  return (
    <>
      {optional ? (
        <Select
          className="action-cell-select"
          disabled={disabled || picking}
          value={isCursor ? "cursor" : "position"}
          title={t("macros.params.position")}
          ariaLabel={t("macros.params.position")}
          options={positionOpts(t)}
          onChange={(v) => {
            if (v === "cursor") onChangeXY(null, null);
            else onChangeXY(x ?? 0, y ?? 0);
          }}
        />
      ) : null}
      {!isCursor ? (
        <>
          <WheelNumberInput
            className="action-cell-input action-cell-num"
            disabled={disabled || picking}
            value={x ?? 0}
            title={t("macros.params.coordX")}
            aria-label={t("macros.params.coordX")}
            onValueChange={(n) => onChangeXY(n, y ?? 0)}
          />
          <WheelNumberInput
            className="action-cell-input action-cell-num"
            disabled={disabled || picking}
            value={y ?? 0}
            title={t("macros.params.coordY")}
            aria-label={t("macros.params.coordY")}
            onValueChange={(n) => onChangeXY(x ?? 0, n)}
          />
          <button
            type="button"
            className="action-cell-btn"
            disabled={disabled || picking}
            title={t("macros.params.pickScreen")}
            onClick={() => void onPick()}
          >
            {picking ? "…" : "⌖"}
          </button>
        </>
      ) : null}
    </>
  );
}

function ComplexPopover({
  action,
  disabled,
  onChange,
  branchAddMenuItems,
  onOpenScript,
  onClose,
  anchor,
}: {
  action: MacroAction;
  disabled?: boolean;
  onChange: (action: MacroAction) => void;
  branchAddMenuItems?: (branch: "then" | "else" | "body") => ActionPickerEntry[];
  onOpenScript?: (scriptId: string, label?: string) => void;
  onClose: () => void;
  anchor: DOMRect;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const top = Math.min(anchor.bottom + 6, window.innerHeight - 260);
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - 368);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    function onPointer(e: PointerEvent) {
      const target = e.target as Node | null;
      if (panelRef.current?.contains(target)) return;
      onClose();
    }
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={panelRef}
      className="caster-action-props-pop"
      role="dialog"
      aria-labelledby={titleId}
      style={{ top, left }}
    >
      <div className="caster-action-props-pop-head">
        <strong id={titleId}>{t("macros.params.panelTitle")}</strong>
        <button type="button" className="action-cell-btn" onClick={onClose}>
          {t("shell.closeConfirm")}
        </button>
      </div>
      <div className="caster-action-props-pop-body">
        <ActionProps
          action={action}
          disabled={disabled}
          onChange={onChange}
          branchAddMenuItems={branchAddMenuItems}
          onOpenScript={onOpenScript}
        />
      </div>
    </div>,
    document.body,
  );
}

export function ActionParamCells({
  action,
  disabled,
  onChange,
  branchAddMenuItems,
  onOpenScript,
}: Props) {
  const t = useT();
  const [popOpen, setPopOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  if (isComplexAction(action.type)) {
    return (
      <div className="action-cell-edit action-cell-edit--complex">
        <span className="action-cell-summary" title={actionDetail(action, t)}>
          {actionDetail(action, t)}
        </span>
        <button
          ref={triggerRef}
          type="button"
          className="action-cell-btn"
          disabled={disabled}
          title={t("macros.params.edit")}
          aria-expanded={popOpen}
          onClick={(e) => {
            e.stopPropagation();
            const rect = triggerRef.current?.getBoundingClientRect() ?? null;
            setAnchor(rect);
            setPopOpen((v) => !v);
          }}
        >
          …
        </button>
        {popOpen && anchor ? (
          <ComplexPopover
            action={action}
            disabled={disabled}
            onChange={onChange}
            branchAddMenuItems={branchAddMenuItems}
            onOpenScript={onOpenScript}
            anchor={anchor}
            onClose={() => setPopOpen(false)}
          />
        ) : null}
      </div>
    );
  }

  if (action.type === "delay") {
    return (
      <div className="action-cell-edit">
        <WheelNumberInput
          className="action-cell-input action-cell-num action-cell-num--wide"
          min={0}
          disabled={disabled}
          value={action.ms}
          title={t("macros.params.durationMs")}
          aria-label={t("macros.params.durationMsAria")}
          onValueChange={(n) => onChange({ ...action, ms: n })}
        />
        <span className="action-cell-unit">{t("macros.params.unitMs")}</span>
      </div>
    );
  }

  if (
    action.type === "mouse.click" ||
    action.type === "mouse.down" ||
    action.type === "mouse.up"
  ) {
    return (
      <div className="action-cell-edit">
        <Select
          className="action-cell-select"
          disabled={disabled}
          value={action.button ?? "left"}
          title={t("macros.params.button")}
          ariaLabel={t("macros.params.button")}
          options={mouseButtonOpts(t)}
          onChange={(v) =>
            onChange({
              ...action,
              button: v as "left" | "right" | "middle",
            })
          }
        />
        <CompactXY
          x={action.x}
          y={action.y}
          optional
          disabled={disabled}
          onChangeXY={(nx, ny) => onChange({ ...action, x: nx, y: ny })}
        />
      </div>
    );
  }

  if (action.type === "mouse.move") {
    return (
      <div className="action-cell-edit">
        <CompactXY
          x={action.x}
          y={action.y}
          disabled={disabled}
          onChangeXY={(nx, ny) =>
            onChange({
              ...action,
              x: nx ?? action.x,
              y: ny ?? action.y,
            })
          }
        />
      </div>
    );
  }

  if (action.type === "mouse.wheel") {
    return (
      <div className="action-cell-edit">
        <WheelNumberInput
          className="action-cell-input action-cell-num"
          disabled={disabled}
          value={action.delta}
          title={t("macros.params.wheelDeltaShort")}
          aria-label={t("macros.params.wheelDeltaAria")}
          onValueChange={(n) => onChange({ ...action, delta: n })}
        />
        <CompactXY
          x={action.x}
          y={action.y}
          optional
          disabled={disabled}
          onChangeXY={(nx, ny) => onChange({ ...action, x: nx, y: ny })}
        />
      </div>
    );
  }

  if (
    action.type === "key.tap" ||
    action.type === "key.down" ||
    action.type === "key.up"
  ) {
    const mods = modsOf(action);
    return (
      <div className="action-cell-edit">
        <input
          className="action-cell-input action-cell-key"
          type="text"
          disabled={disabled}
          value={action.key}
          title={t("macros.params.key")}
          aria-label={t("macros.params.keyAria")}
          onChange={(e) => onChange({ ...action, key: e.target.value })}
        />
        <label className="action-cell-mod" title="Ctrl">
          <input
            type="checkbox"
            disabled={disabled}
            checked={!!mods.ctrl}
            onChange={(e) =>
              onChange({ ...action, mods: { ...mods, ctrl: e.target.checked } })
            }
          />
          Ctrl
        </label>
        <label className="action-cell-mod" title="Alt">
          <input
            type="checkbox"
            disabled={disabled}
            checked={!!mods.alt}
            onChange={(e) =>
              onChange({ ...action, mods: { ...mods, alt: e.target.checked } })
            }
          />
          Alt
        </label>
        <label className="action-cell-mod" title="Shift">
          <input
            type="checkbox"
            disabled={disabled}
            checked={!!mods.shift}
            onChange={(e) =>
              onChange({
                ...action,
                mods: { ...mods, shift: e.target.checked },
              })
            }
          />
          Shift
        </label>
      </div>
    );
  }

  if (action.type === "clipboard.set") {
    return (
      <div className="action-cell-edit">
        <input
          className="action-cell-input action-cell-text"
          type="text"
          disabled={disabled}
          value={action.text}
          title={t("macros.params.clipboardText")}
          aria-label={t("macros.params.clipboardTextAria")}
          onChange={(e) => onChange({ ...action, text: e.target.value })}
        />
      </div>
    );
  }

  if (action.type === "clipboard.get") {
    return (
      <div className="action-cell-edit">
        <input
          className="action-cell-input action-cell-key"
          type="text"
          disabled={disabled}
          value={action.name}
          title={t("macros.params.operandVar")}
          aria-label={t("macros.params.varNameAria")}
          onChange={(e) => onChange({ ...action, name: e.target.value })}
        />
      </div>
    );
  }

  if (action.type === "var.set") {
    return (
      <div className="action-cell-edit">
        <input
          className="action-cell-input action-cell-key"
          type="text"
          disabled={disabled}
          value={action.name}
          title={t("macros.params.varName")}
          aria-label={t("macros.params.varNameAria")}
          onChange={(e) => onChange({ ...action, name: e.target.value })}
        />
        <input
          className="action-cell-input action-cell-text"
          type="text"
          disabled={disabled}
          value={String(action.value)}
          title={t("macros.params.varValue")}
          aria-label={t("macros.params.varValue")}
          onChange={(e) => {
            const raw = e.target.value;
            let value: string | number | boolean = raw;
            if (raw === "true") value = true;
            else if (raw === "false") value = false;
            else if (raw.trim() !== "" && !Number.isNaN(Number(raw))) {
              value = Number(raw);
            }
            onChange({ ...action, value });
          }}
        />
      </div>
    );
  }

  return (
    <div className="action-cell-edit">
      <span className="action-cell-summary">{actionDetail(action, t)}</span>
    </div>
  );
}
