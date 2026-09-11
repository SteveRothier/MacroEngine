import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileCode2 } from "lucide-react";
import { pickScreenPoint } from "../pick";
import { Segmented } from "../ui";
import { ActionPickerMenu, DropdownMenu, Select, Tooltip } from "../ui/v2";
import type { ActionPickerEntry, DropdownEntry } from "../ui/v2";
import type { CompareOp, KeyMods, MacroAction, MacroValue, Operand } from "./types";
import type { ScriptDoc } from "../scripts/types";
import { ScriptParamsFields } from "../scripts/ScriptParamsFields";
import { activePermissionLabels } from "../scripts/ScriptPermissionsMenu";
import { parseParamDefs } from "../scripts/parseParams";
import {
  SCRIPT_PRESETS,
  type ScriptPreset,
} from "../scripts/presets";
import { actionTitleFr } from "./actionLabels";

const MOUSE_BUTTON_OPTS = [
  { value: "left", label: "Gauche" },
  { value: "right", label: "Droit" },
  { value: "middle", label: "Molette" },
];

const HTTP_METHOD_OPTS = [
  { value: "GET", label: "GET" },
  { value: "POST", label: "POST" },
  { value: "PUT", label: "PUT" },
  { value: "DELETE", label: "DELETE" },
];

const OPERAND_MODE_OPTS = [
  { value: "var", label: "Variable" },
  { value: "lit", label: "Littéral" },
];

const COMPARE_OP_OPTS = [
  { value: "eq", label: "=" },
  { value: "ne", label: "≠" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
];

type Props = {
  action: MacroAction | null;
  disabled?: boolean;
  onChange: (action: MacroAction) => void;
  branchAddMenuItems?: (branch: "then" | "else") => ActionPickerEntry[];
  onOpenScript?: (scriptId: string, label?: string) => void;
};

function isVarOperand(o: Operand): o is { var: string } {
  return typeof o === "object" && o !== null && "var" in o;
}

function operandMode(o: Operand): "var" | "lit" {
  return isVarOperand(o) ? "var" : "lit";
}

function litString(o: Operand): string {
  if (isVarOperand(o)) return "";
  if (typeof o === "string") return o;
  return String(o);
}

function parseLit(raw: string): MacroValue {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const n = Number(raw);
  if (raw.trim() !== "" && !Number.isNaN(n)) return n;
  return raw;
}

function modsOf(action: { mods?: KeyMods }): KeyMods {
  return {
    ctrl: !!action.mods?.ctrl,
    alt: !!action.mods?.alt,
    shift: !!action.mods?.shift,
  };
}

type PointFieldsProps = {
  x: number | null | undefined;
  y: number | null | undefined;
  optional?: boolean;
  disabled?: boolean;
  picking: boolean;
  setPicking: (v: boolean) => void;
  onChangeXY: (x: number | null, y: number | null) => void;
  hint?: ReactNode;
};

function PointFields({
  x,
  y,
  optional = false,
  disabled,
  picking,
  setPicking,
  onChangeXY,
  hint,
}: PointFieldsProps) {
  const mode: "cursor" | "position" =
    optional && x == null && y == null ? "cursor" : "position";

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

  if (optional) {
    return (
      <>
        <div className="v2-field" style={{ gridColumn: "1 / -1" }}>
          <span>Position</span>
          <Segmented
            ariaLabel="Mode position"
            value={mode}
            disabled={disabled || picking}
            options={[
              { value: "cursor", label: "Curseur" },
              { value: "position", label: "Position" },
            ]}
            onChange={(v) => {
              if (v === "cursor") {
                onChangeXY(null, null);
              } else if (x == null && y == null) {
                onChangeXY(0, 0);
              }
            }}
          />
        </div>
        {mode === "cursor" ? (
          hint ? (
            <p className="hint" style={{ gridColumn: "1 / -1" }}>
              {hint}
            </p>
          ) : null
        ) : (
          <>
            <label className="v2-field">
              <span>X</span>
              <input
                type="number"
                disabled={disabled || picking}
                value={x ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    onChangeXY(null, y ?? null);
                    return;
                  }
                  onChangeXY(Number(raw), y ?? null);
                }}
              />
            </label>
            <label className="v2-field">
              <span>Y</span>
              <input
                type="number"
                disabled={disabled || picking}
                value={y ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    onChangeXY(x ?? null, null);
                    return;
                  }
                  onChangeXY(x ?? null, Number(raw));
                }}
              />
            </label>
            <div
              className="v2-field props-point-actions"
              style={{ gridColumn: "1 / -1" }}
            >
              <button
                type="button"
                disabled={disabled || picking}
                onClick={() => void onPick()}
              >
                {picking
                  ? "Overlay actif — clique sur l’écran…"
                  : "Choisir à l’écran"}
              </button>
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <label className="v2-field">
        <span>X</span>
        <input
          type="number"
          disabled={disabled || picking}
          value={x ?? ""}
          onChange={(e) => {
            onChangeXY(Number(e.target.value), y ?? 0);
          }}
        />
      </label>
      <label className="v2-field">
        <span>Y</span>
        <input
          type="number"
          disabled={disabled || picking}
          value={y ?? ""}
          onChange={(e) => {
            onChangeXY(x ?? 0, Number(e.target.value));
          }}
        />
      </label>
      <div className="v2-field props-point-actions" style={{ gridColumn: "1 / -1" }}>
        <button
          type="button"
          disabled={disabled || picking}
          onClick={() => void onPick()}
        >
          {picking ? "Overlay actif — clique sur l’écran…" : "Choisir à l’écran"}
        </button>
        {hint ? <p className="hint">{hint}</p> : null}
      </div>
    </>
  );
}

export function ActionProps({
  action,
  disabled,
  onChange,
  branchAddMenuItems,
  onOpenScript,
}: Props) {
  const [picking, setPicking] = useState(false);

  if (!action) {
    return null;
  }

  if (action.type === "mouse.click") {
    return (
      <div className="props-grid">
        <label className="v2-field">
          <span>Bouton</span>
          <Select
            className="v2-select"
            value={action.button ?? "left"}
            disabled={disabled || picking}
            options={MOUSE_BUTTON_OPTS}
            onChange={(v) =>
              onChange({
                ...action,
                button: v as "left" | "right" | "middle",
              })
            }
          />
        </label>
        <PointFields
          x={action.x}
          y={action.y}
          optional
          disabled={disabled}
          picking={picking}
          setPicking={setPicking}
          onChangeXY={(nx, ny) => onChange({ ...action, x: nx, y: ny })}
          hint="Clic à la position du curseur au moment de l’exécution."
        />
      </div>
    );
  }

  if (action.type === "mouse.move") {
    return (
      <div className="props-grid">
        <PointFields
          x={action.x}
          y={action.y}
          disabled={disabled}
          picking={picking}
          setPicking={setPicking}
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

  if (action.type === "mouse.down" || action.type === "mouse.up") {
    const kind = action.type;
    return (
      <div className="props-grid">
        <label className="v2-field">
          <span>Bouton</span>
          <Select
            className="v2-select"
            value={action.button ?? "left"}
            disabled={disabled || picking}
            options={MOUSE_BUTTON_OPTS}
            onChange={(v) =>
              onChange({
                ...action,
                button: v as "left" | "right" | "middle",
              })
            }
          />
        </label>
        <PointFields
          x={action.x}
          y={action.y}
          optional
          disabled={disabled}
          picking={picking}
          setPicking={setPicking}
          onChangeXY={(nx, ny) => onChange({ ...action, x: nx, y: ny })}
        />
        <p className="hint" style={{ gridColumn: "1 / -1" }}>
          {kind === "mouse.down"
            ? "Enfonce le bouton (drag / maintien)."
            : "Relâche le bouton."}
        </p>
      </div>
    );
  }

  if (action.type === "mouse.wheel") {
    return (
      <div className="props-grid">
        <label className="v2-field">
          <span>Delta (120 = cran)</span>
          <input
            type="number"
            disabled={disabled || picking}
            value={action.delta}
            onChange={(e) =>
              onChange({ ...action, delta: Number(e.target.value) })
            }
          />
        </label>
        <PointFields
          x={action.x}
          y={action.y}
          optional
          disabled={disabled}
          picking={picking}
          setPicking={setPicking}
          onChangeXY={(nx, ny) => onChange({ ...action, x: nx, y: ny })}
        />
      </div>
    );
  }

  if (action.type === "delay") {
    return (
      <label className="v2-field">
        <span>Durée (ms)</span>
        <input
          type="number"
          min={0}
          disabled={disabled}
          value={action.ms}
          onChange={(e) => onChange({ ...action, ms: Number(e.target.value) })}
        />
      </label>
    );
  }

  if (action.type === "http.request") {
    return (
      <div className="props-grid">
        <label className="v2-field">
          <span>Méthode</span>
          <Select
            className="v2-select"
            value={action.method ?? "GET"}
            disabled={disabled}
            options={HTTP_METHOD_OPTS}
            onChange={(method) => onChange({ ...action, method })}
          />
        </label>
        <label className="v2-field">
          <span>URL ({`{{var}}`} ok)</span>
          <input
            type="text"
            disabled={disabled}
            value={action.url}
            onChange={(e) => onChange({ ...action, url: e.target.value })}
          />
        </label>
        <label className="v2-field" style={{ gridColumn: "1 / -1" }}>
          <span>Body</span>
          <textarea
            rows={4}
            disabled={disabled}
            value={action.body ?? ""}
            onChange={(e) =>
              onChange({
                ...action,
                body: e.target.value === "" ? null : e.target.value,
              })
            }
            style={{ fontFamily: "ui-monospace, Consolas, monospace", width: "100%" }}
          />
        </label>
        <label className="v2-field">
          <span>Timeout (ms)</span>
          <input
            type="number"
            min={0}
            disabled={disabled}
            value={action.timeoutMs ?? 10000}
            onChange={(e) =>
              onChange({ ...action, timeoutMs: Number(e.target.value) })
            }
          />
        </label>
        <label className="v2-field">
          <span>Échec si status ≥ 400</span>
          <input
            type="checkbox"
            disabled={disabled}
            checked={!!action.failOnStatus}
            onChange={(e) =>
              onChange({ ...action, failOnStatus: e.target.checked })
            }
          />
        </label>
        <label className="v2-field">
          <span>Variable statut</span>
          <input
            type="text"
            disabled={disabled}
            placeholder="status"
            value={action.statusVar ?? ""}
            onChange={(e) =>
              onChange({
                ...action,
                statusVar: e.target.value === "" ? null : e.target.value,
              })
            }
          />
        </label>
        <label className="v2-field">
          <span>Variable corps</span>
          <input
            type="text"
            disabled={disabled}
            placeholder="body"
            value={action.bodyVar ?? ""}
            onChange={(e) =>
              onChange({
                ...action,
                bodyVar: e.target.value === "" ? null : e.target.value,
              })
            }
          />
        </label>
        <div className="v2-field" style={{ gridColumn: "1 / -1" }}>
          <span>En-têtes</span>
          {(action.headers ?? []).map((h, i) => (
            <div key={i} className="props-grid" style={{ marginTop: 6 }}>
              <input
                type="text"
                disabled={disabled}
                placeholder="Nom"
                value={h.name}
                onChange={(e) => {
                  const headers = [...(action.headers ?? [])];
                  headers[i] = { ...headers[i], name: e.target.value };
                  onChange({ ...action, headers });
                }}
              />
              <input
                type="text"
                disabled={disabled}
                placeholder="Valeur"
                value={h.value}
                onChange={(e) => {
                  const headers = [...(action.headers ?? [])];
                  headers[i] = { ...headers[i], value: e.target.value };
                  onChange({ ...action, headers });
                }}
              />
              <button
                type="button"
                className="ghost"
                disabled={disabled}
                onClick={() => {
                  const headers = (action.headers ?? []).filter((_, j) => j !== i);
                  onChange({ ...action, headers });
                }}
              >
                Retirer
              </button>
            </div>
          ))}
          <div className="actions wrap" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="ghost"
              disabled={disabled}
              onClick={() =>
                onChange({
                  ...action,
                  headers: [...(action.headers ?? []), { name: "", value: "" }],
                })
              }
            >
              Ajouter un en-tête
            </button>
            <button
              type="button"
              className="ghost"
              disabled={disabled}
              onClick={() => {
                const headers = [...(action.headers ?? [])];
                const idx = headers.findIndex(
                  (h) => h.name.toLowerCase() === "authorization",
                );
                const bearer = {
                  name: "Authorization",
                  value: "Bearer {{token}}",
                };
                if (idx >= 0) headers[idx] = bearer;
                else headers.push(bearer);
                onChange({ ...action, headers });
              }}
            >
              + Bearer
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (action.type === "json.path") {
    return (
      <div className="props-grid">
        <label className="v2-field">
          <span>Variable source (JSON)</span>
          <input
            type="text"
            disabled={disabled}
            value={action.sourceVar}
            onChange={(e) => onChange({ ...action, sourceVar: e.target.value })}
          />
        </label>
        <label className="v2-field">
          <span>Chemin (a.b.0.c)</span>
          <input
            type="text"
            disabled={disabled}
            value={action.path}
            onChange={(e) => onChange({ ...action, path: e.target.value })}
          />
        </label>
        <label className="v2-field">
          <span>Variable destination</span>
          <input
            type="text"
            disabled={disabled}
            value={action.destVar}
            onChange={(e) => onChange({ ...action, destVar: e.target.value })}
          />
        </label>
      </div>
    );
  }

  if (action.type === "script.run") {
    return (
      <ScriptRunProps
        action={action}
        disabled={disabled}
        onChange={onChange}
        onOpenScript={onOpenScript}
      />
    );
  }

  if (
    action.type === "key.tap" ||
    action.type === "key.down" ||
    action.type === "key.up"
  ) {
    const mods = modsOf(action);
    const keyTitle =
      action.type === "key.down"
        ? "Maintenir"
        : action.type === "key.up"
          ? "Relâcher"
          : "Touche";
    return (
      <div className="props-grid">
        <label className="v2-field">
          <span>{keyTitle} ({`{{var}}`} ok)</span>
          <input
            type="text"
            disabled={disabled}
            value={action.key}
            onChange={(e) => onChange({ ...action, key: e.target.value })}
          />
        </label>
        <label className="v2-field">
          <span>Ctrl</span>
          <input
            type="checkbox"
            disabled={disabled}
            checked={!!mods.ctrl}
            onChange={(e) =>
              onChange({ ...action, mods: { ...mods, ctrl: e.target.checked } })
            }
          />
        </label>
        <label className="v2-field">
          <span>Alt</span>
          <input
            type="checkbox"
            disabled={disabled}
            checked={!!mods.alt}
            onChange={(e) =>
              onChange({ ...action, mods: { ...mods, alt: e.target.checked } })
            }
          />
        </label>
        <label className="v2-field">
          <span>Shift</span>
          <input
            type="checkbox"
            disabled={disabled}
            checked={!!mods.shift}
            onChange={(e) =>
              onChange({ ...action, mods: { ...mods, shift: e.target.checked } })
            }
          />
        </label>
        <button
          type="button"
          className="ghost"
          disabled={disabled}
          onClick={() => {
            const onKey = (e: KeyboardEvent) => {
              e.preventDefault();
              e.stopPropagation();
              window.removeEventListener("keydown", onKey, true);
              if (e.key === "Escape") return;
              const label =
                e.key.length === 1 ? e.key.toUpperCase() : e.key;
              onChange({
                ...action,
                key: label,
                mods: {
                  ctrl: e.ctrlKey,
                  alt: e.altKey,
                  shift: e.shiftKey,
                },
              });
            };
            window.addEventListener("keydown", onKey, true);
          }}
        >
          Capturer
        </button>
      </div>
    );
  }

  if (action.type === "clipboard.set") {
    return (
      <label className="v2-field">
        <span>Texte</span>
        <input
          type="text"
          disabled={disabled}
          value={action.text}
          onChange={(e) => onChange({ ...action, text: e.target.value })}
        />
        <p className="hint">
          Texte à placer dans le presse-papiers. {`{{nom}}`} insère une variable.
        </p>
      </label>
    );
  }

  if (action.type === "clipboard.get") {
    return (
      <label className="v2-field">
        <span>Variable</span>
        <input
          type="text"
          disabled={disabled}
          value={action.name}
          onChange={(e) => onChange({ ...action, name: e.target.value })}
        />
        <p className="hint">Copie le presse-papiers dans cette variable.</p>
      </label>
    );
  }

  if (action.type === "var.set") {
    return (
      <div className="props-grid">
        <label className="v2-field">
          <span>Nom</span>
          <input
            type="text"
            disabled={disabled}
            value={action.name}
            onChange={(e) => onChange({ ...action, name: e.target.value })}
          />
        </label>
        <label className="v2-field">
          <span>Valeur</span>
          <input
            type="text"
            disabled={disabled}
            value={
              typeof action.value === "string"
                ? action.value
                : String(action.value)
            }
            onChange={(e) =>
              onChange({ ...action, value: parseLit(e.target.value) })
            }
          />
        </label>
      </div>
    );
  }

  if (action.type === "control.if") {
    const left = action.condition.left;
    const right = action.condition.right;
    return (
      <div className="props-grid">
        <label className="v2-field">
          <span>Gauche</span>
          <Select
            className="v2-select"
            disabled={disabled}
            value={operandMode(left)}
            options={OPERAND_MODE_OPTS}
            onChange={(v) =>
              onChange({
                ...action,
                condition: {
                  ...action.condition,
                  left: v === "var" ? { var: "n" } : 0,
                },
              })
            }
          />
        </label>
        <label className="v2-field">
          <span>{operandMode(left) === "var" ? "Var" : "Valeur"}</span>
          <input
            type="text"
            disabled={disabled}
            value={isVarOperand(left) ? left.var : litString(left)}
            onChange={(e) =>
              onChange({
                ...action,
                condition: {
                  ...action.condition,
                  left:
                    operandMode(left) === "var"
                      ? { var: e.target.value }
                      : parseLit(e.target.value),
                },
              })
            }
          />
        </label>
        <label className="v2-field">
          <span>Opérateur</span>
          <Select
            className="v2-select"
            disabled={disabled}
            value={action.condition.op}
            options={COMPARE_OP_OPTS}
            onChange={(op) =>
              onChange({
                ...action,
                condition: {
                  ...action.condition,
                  op: op as CompareOp,
                },
              })
            }
          />
        </label>
        <label className="v2-field">
          <span>Droite</span>
          <Select
            className="v2-select"
            disabled={disabled}
            value={operandMode(right)}
            options={OPERAND_MODE_OPTS}
            onChange={(v) =>
              onChange({
                ...action,
                condition: {
                  ...action.condition,
                  right: v === "var" ? { var: "n" } : 0,
                },
              })
            }
          />
        </label>
        <label className="v2-field">
          <span>{operandMode(right) === "var" ? "Var" : "Valeur"}</span>
          <input
            type="text"
            disabled={disabled}
            value={isVarOperand(right) ? right.var : litString(right)}
            onChange={(e) =>
              onChange({
                ...action,
                condition: {
                  ...action.condition,
                  right:
                    operandMode(right) === "var"
                      ? { var: e.target.value }
                      : parseLit(e.target.value),
                },
              })
            }
          />
        </label>
        <div className="actions wrap">
          {branchAddMenuItems ? (
            <>
              <ActionPickerMenu
                label="+ Alors"
                disabled={disabled}
                items={branchAddMenuItems("then")}
              />
              <ActionPickerMenu
                label="+ Sinon"
                disabled={disabled}
                items={branchAddMenuItems("else")}
              />
            </>
          ) : null}
        </div>
      </div>
    );
  }

  if (action.type !== "process.run") {
    return null;
  }

  return (
    <div className="props-grid">
      <label className="v2-field">
        <span>Commande</span>
        <input
          type="text"
          disabled={disabled}
          value={action.command}
          onChange={(e) => onChange({ ...action, command: e.target.value })}
        />
      </label>
      <label className="v2-field">
        <span>Args (espace)</span>
        <input
          type="text"
          disabled={disabled}
          value={(action.args ?? []).join(" ")}
          onChange={(e) =>
            onChange({
              ...action,
              args: e.target.value.trim() ? e.target.value.trim().split(/\s+/) : [],
            })
          }
        />
      </label>
    </div>
  );
}

function ScriptRunProps({
  action,
  disabled,
  onChange,
  onOpenScript,
}: {
  action: Extract<MacroAction, { type: "script.run" }>;
  disabled?: boolean;
  onChange: (action: MacroAction) => void;
  onOpenScript?: (scriptId: string, label?: string) => void;
}) {
  const [scripts, setScripts] = useState<ScriptDoc[]>([]);
  const [libDoc, setLibDoc] = useState<ScriptDoc | null>(null);
  const [sourceOpen, setSourceOpen] = useState(true);
  const [paramsOpen, setParamsOpen] = useState(true);
  const [execOpen, setExecOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void invoke<ScriptDoc[]>("list_scripts_cmd")
      .then((list) => {
        if (!cancelled) setScripts(list);
      })
      .catch(() => {
        if (!cancelled) setScripts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const useLibrary = !!(action.scriptId && action.scriptId.length > 0);

  useEffect(() => {
    if (!useLibrary || !action.scriptId) {
      setLibDoc(null);
      return;
    }
    let cancelled = false;
    void invoke<ScriptDoc>("load_script_cmd", { id: action.scriptId })
      .then((doc) => {
        if (!cancelled) setLibDoc(doc);
      })
      .catch(() => {
        if (!cancelled) setLibDoc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [useLibrary, action.scriptId]);

  const paramSource = useLibrary ? (libDoc?.source ?? "") : (action.source ?? "");
  const defs = parseParamDefs(paramSource);
  const params = action.params ?? {};
  const permLabels = libDoc ? activePermissionLabels(libDoc) : [];

  function applyPreset(preset: ScriptPreset) {
    onChange({
      ...action,
      scriptId: null,
      source: preset.source,
      params: {},
    });
  }

  return (
    <div className="v2-scriptrun-props">
      <div className="v2-scriptrun-props-title">
        {actionTitleFr("script.run")}
        {useLibrary && libDoc ? (
          <span className="v2-scriptrun-props-sub">· {libDoc.name}</span>
        ) : !useLibrary ? (
          <span className="v2-scriptrun-props-sub">· Inline</span>
        ) : null}
      </div>

      <section className="v2-scriptrun-section">
        <button
          type="button"
          className="v2-scriptrun-section-head"
          onClick={() => setSourceOpen((v) => !v)}
        >
          Source {sourceOpen ? "▾" : "▸"}
        </button>
        {sourceOpen ? (
          <div className="v2-scriptrun-section-body props-grid">
            <div className="v2-field" style={{ gridColumn: "1 / -1" }}>
              <Segmented
                value={useLibrary ? "library" : "inline"}
                onChange={(mode) => {
                  if (mode === "inline") {
                    onChange({ ...action, scriptId: null });
                  } else {
                    const first = scripts[0]?.id ?? null;
                    onChange({
                      ...action,
                      scriptId: action.scriptId || first,
                      source: "",
                    });
                  }
                }}
                options={[
                  { value: "library", label: "Bibliothèque" },
                  { value: "inline", label: "Inline" },
                ]}
                disabled={disabled}
              />
            </div>
            {useLibrary ? (
              <>
                <label className="v2-field" style={{ gridColumn: "1 / -1" }}>
                  <span>Script bibliothèque</span>
                  <Select
                    className="v2-select"
                    disabled={disabled}
                    value={action.scriptId ?? ""}
                    options={[
                      { value: "", label: "— Choisir —" },
                      ...scripts.map((s) => ({ value: s.id, label: s.name })),
                    ]}
                    onChange={(v) => {
                      const scriptId = v === "" ? null : v;
                      onChange({
                        ...action,
                        scriptId,
                        source: scriptId ? "" : action.source ?? "",
                      });
                    }}
                  />
                </label>
                {libDoc && permLabels.length > 0 ? (
                  <div
                    className="v2-script-perm-chips"
                    style={{ gridColumn: "1 / -1" }}
                  >
                    {permLabels.map((p) => (
                      <span key={p} className="v2-script-perm-chip">
                        {p}
                      </span>
                    ))}
                  </div>
                ) : null}
                {action.scriptId && onOpenScript ? (
                  <button
                    type="button"
                    className="v2-btn v2-btn-ghost"
                    style={{ gridColumn: "1 / -1" }}
                    disabled={disabled}
                    onClick={() =>
                      onOpenScript(action.scriptId!, libDoc?.name)
                    }
                  >
                    Ouvrir dans l’éditeur
                  </button>
                ) : null}
              </>
            ) : (
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="v2-field">
                  <span>Source JavaScript</span>
                  <textarea
                    rows={7}
                    disabled={disabled}
                    value={action.source ?? ""}
                    onChange={(e) =>
                      onChange({ ...action, source: e.target.value })
                    }
                    className="v2-script-inline-source"
                  />
                </label>
                <div className="v2-scriptrun-examples">
                  <DropdownMenu
                    label="Exemples ▾"
                    disabled={disabled}
                    triggerClassName="v2-btn v2-btn-ghost"
                    menuClassName="v2-scriptrun-examples-menu"
                    items={
                      [
                        ...SCRIPT_PRESETS.map((p) => ({
                          id: `ex-${p.id}`,
                          label: p.name,
                          icon: <FileCode2 size={14} />,
                          onSelect: () => applyPreset(p),
                        })),
                        { id: "sep-min", label: "", separator: true },
                        {
                          id: "minimal",
                          label: "Template minimal",
                          icon: <FileCode2 size={14} />,
                          onSelect: () => {
                            onChange({
                              ...action,
                              source:
                                "//@param label string world\ncaster.log(caster.get('label'));\n",
                            });
                          },
                        },
                      ] satisfies DropdownEntry[]
                    }
                  />
                </div>
              </div>
            )}
          </div>
        ) : null}
      </section>

      {defs.length > 0 ? (
        <section className="v2-scriptrun-section">
          <button
            type="button"
            className="v2-scriptrun-section-head"
            onClick={() => setParamsOpen((v) => !v)}
          >
            Paramètres {paramsOpen ? "▾" : "▸"}
          </button>
          {paramsOpen ? (
            <div className="v2-scriptrun-section-body">
              <ScriptParamsFields
                defs={defs}
                values={params}
                disabled={disabled}
                compact={false}
                onChange={(name, value) =>
                  onChange({
                    ...action,
                    params: { ...params, [name]: value },
                  })
                }
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="v2-scriptrun-section">
        <button
          type="button"
          className="v2-scriptrun-section-head"
          onClick={() => setExecOpen((v) => !v)}
        >
          Exécution {execOpen ? "▾" : "▸"}
        </button>
        {execOpen ? (
          <div className="v2-scriptrun-section-body props-grid">
            <label className="v2-field">
              <span>Timeout (ms)</span>
              <input
                type="number"
                min={0}
                disabled={disabled}
                value={action.timeoutMs ?? 10000}
                onChange={(e) =>
                  onChange({ ...action, timeoutMs: Number(e.target.value) })
                }
              />
            </label>
            <label className="v2-field">
              <span>Stocker le résultat dans</span>
              <Tooltip content="Le résultat du script sera accessible dans la macro sous ce nom.">
                <input
                  type="text"
                  disabled={disabled}
                  placeholder="nomDeVariable"
                  value={action.resultVar ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...action,
                      resultVar:
                        e.target.value.trim() === "" ? null : e.target.value,
                    })
                  }
                />
              </Tooltip>
            </label>
          </div>
        ) : null}
      </section>
    </div>
  );
}
