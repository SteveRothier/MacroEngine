import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pickScreenPoint } from "../pick";
import type { AddMenuEntry } from "../ui";
import { ActionProps } from "./ActionProps";
import { actionDetailFr } from "./actionLabels";
import type { KeyMods, MacroAction } from "./types";

type Props = {
  action: MacroAction;
  disabled?: boolean;
  onChange: (action: MacroAction) => void;
  branchAddMenuItems?: (branch: "then" | "else") => AddMenuEntry[];
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

function parseNum(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
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
  const [picking, setPicking] = useState(false);
  const isCursor = optional && x == null && y == null;

  async function onPick() {
    setPicking(true);
    try {
      const p = await pickScreenPoint();
      if (!p) return;
      onChangeXY(p.x, p.y);
    } finally {
      setPicking(false);
    }
  }

  return (
    <>
      {optional ? (
        <select
          className="action-cell-select"
          disabled={disabled || picking}
          value={isCursor ? "cursor" : "position"}
          title="Position"
          onChange={(e) => {
            if (e.target.value === "cursor") onChangeXY(null, null);
            else onChangeXY(x ?? 0, y ?? 0);
          }}
        >
          <option value="cursor">Curseur</option>
          <option value="position">XY</option>
        </select>
      ) : null}
      {!isCursor ? (
        <>
          <input
            className="action-cell-input action-cell-num"
            type="number"
            disabled={disabled || picking}
            value={x ?? 0}
            title="X"
            aria-label="X"
            onChange={(e) => onChangeXY(parseNum(e.target.value), y ?? 0)}
          />
          <input
            className="action-cell-input action-cell-num"
            type="number"
            disabled={disabled || picking}
            value={y ?? 0}
            title="Y"
            aria-label="Y"
            onChange={(e) => onChangeXY(x ?? 0, parseNum(e.target.value))}
          />
          <button
            type="button"
            className="action-cell-btn"
            disabled={disabled || picking}
            title="Choisir à l’écran"
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
  onClose,
  anchor,
}: {
  action: MacroAction;
  disabled?: boolean;
  onChange: (action: MacroAction) => void;
  branchAddMenuItems?: (branch: "then" | "else") => AddMenuEntry[];
  onClose: () => void;
  anchor: DOMRect;
}) {
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
      const t = e.target as Node | null;
      if (panelRef.current?.contains(t)) return;
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
      className="v2-action-props-pop"
      role="dialog"
      aria-labelledby={titleId}
      style={{ top, left }}
    >
      <div className="v2-action-props-pop-head">
        <strong id={titleId}>Propriétés</strong>
        <button type="button" className="action-cell-btn" onClick={onClose}>
          Fermer
        </button>
      </div>
      <div className="v2-action-props-pop-body">
        <ActionProps
          action={action}
          disabled={disabled}
          onChange={onChange}
          branchAddMenuItems={branchAddMenuItems}
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
}: Props) {
  const [popOpen, setPopOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  if (isComplexAction(action.type)) {
    return (
      <div className="action-cell-edit action-cell-edit--complex">
        <span className="action-cell-summary" title={actionDetailFr(action)}>
          {actionDetailFr(action)}
        </span>
        <button
          ref={triggerRef}
          type="button"
          className="action-cell-btn"
          disabled={disabled}
          title="Éditer"
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
        <input
          className="action-cell-input action-cell-num action-cell-num--wide"
          type="number"
          min={0}
          disabled={disabled}
          value={action.ms}
          title="Durée (ms)"
          aria-label="Durée ms"
          onChange={(e) => onChange({ ...action, ms: parseNum(e.target.value) })}
        />
        <span className="action-cell-unit">ms</span>
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
        <select
          className="action-cell-select"
          disabled={disabled}
          value={action.button ?? "left"}
          title="Bouton"
          onChange={(e) =>
            onChange({
              ...action,
              button: e.target.value as "left" | "right" | "middle",
            })
          }
        >
          <option value="left">Gauche</option>
          <option value="right">Droit</option>
          <option value="middle">Molette</option>
        </select>
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
        <input
          className="action-cell-input action-cell-num"
          type="number"
          disabled={disabled}
          value={action.delta}
          title="Delta"
          aria-label="Delta molette"
          onChange={(e) =>
            onChange({ ...action, delta: parseNum(e.target.value) })
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
          title="Touche"
          aria-label="Touche"
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
          title="Texte"
          aria-label="Texte presse-papiers"
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
          title="Variable"
          aria-label="Nom variable"
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
          title="Nom"
          aria-label="Nom variable"
          onChange={(e) => onChange({ ...action, name: e.target.value })}
        />
        <input
          className="action-cell-input action-cell-text"
          type="text"
          disabled={disabled}
          value={String(action.value)}
          title="Valeur"
          aria-label="Valeur"
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
      <span className="action-cell-summary">{actionDetailFr(action)}</span>
    </div>
  );
}
