import { useEffect, useMemo, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileCode2 } from "lucide-react";
import { pickScreenPoint } from "../pick";
import { Segmented } from "../ui";
import { ActionPickerMenu, DropdownMenu, Select, Tooltip } from "../ui/shell";
import type { ActionPickerEntry, DropdownEntry } from "../ui/shell";
import type { CompareOp, KeyMods, MacroAction, MacroValue, Operand } from "./types";
import type { ScriptDoc } from "../scripts/types";
import { ScriptParamsFields } from "../scripts/ScriptParamsFields";
import { activePermissionLabels } from "../scripts/ScriptPermissionsMenu";
import { parseParamDefs } from "../scripts/parseParams";
import {
  getScriptPresets,
  type ScriptPreset,
} from "../scripts/presets";
import { useT, type TFunction } from "../i18n";
import { actionTitle } from "./actionLabels";

function mouseButtonOpts(t: TFunction) {
  return [
    { value: "left", label: t("macros.action.button.left") },
    { value: "right", label: t("macros.action.button.right") },
    { value: "middle", label: t("macros.action.button.middle") },
  ];
}

const HTTP_METHOD_OPTS = [
  { value: "GET", label: "GET" },
  { value: "POST", label: "POST" },
  { value: "PUT", label: "PUT" },
  { value: "DELETE", label: "DELETE" },
];

function operandModeOpts(t: TFunction) {
  return [
    { value: "var", label: t("macros.params.operandVar") },
    { value: "lit", label: t("macros.params.operandLit") },
  ];
}

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
  branchAddMenuItems?: (branch: "then" | "else" | "body") => ActionPickerEntry[];
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
  const t = useT();
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
        <div className="caster-field" style={{ gridColumn: "1 / -1" }}>
          <span>{t("macros.params.position")}</span>
          <Segmented
            ariaLabel={t("macros.params.positionModeAria")}
            value={mode}
            disabled={disabled || picking}
            options={[
              { value: "cursor", label: t("macros.params.cursor") },
              { value: "position", label: t("macros.params.position") },
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
            <label className="caster-field">
              <span>{t("macros.params.coordX")}</span>
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
            <label className="caster-field">
              <span>{t("macros.params.coordY")}</span>
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
              className="caster-field props-point-actions"
              style={{ gridColumn: "1 / -1" }}
            >
              <button
                type="button"
                disabled={disabled || picking}
                onClick={() => void onPick()}
              >
                {picking
                  ? t("macros.params.pickOverlay")
                  : t("macros.params.pickScreen")}
              </button>
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <label className="caster-field">
        <span>{t("macros.params.coordX")}</span>
        <input
          type="number"
          disabled={disabled || picking}
          value={x ?? ""}
          onChange={(e) => {
            onChangeXY(Number(e.target.value), y ?? 0);
          }}
        />
      </label>
      <label className="caster-field">
        <span>{t("macros.params.coordY")}</span>
        <input
          type="number"
          disabled={disabled || picking}
          value={y ?? ""}
          onChange={(e) => {
            onChangeXY(x ?? 0, Number(e.target.value));
          }}
        />
      </label>
      <div className="caster-field props-point-actions" style={{ gridColumn: "1 / -1" }}>
        <button
          type="button"
          disabled={disabled || picking}
          onClick={() => void onPick()}
        >
          {picking ? t("macros.params.pickOverlay") : t("macros.params.pickScreen")}
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
  const t = useT();
  const [picking, setPicking] = useState(false);

  if (!action) {
    return null;
  }

  if (action.type === "mouse.click") {
    return (
      <div className="props-grid">
        <label className="caster-field">
          <span>{t("macros.params.button")}</span>
          <Select
            className="caster-select"
            value={action.button ?? "left"}
            disabled={disabled || picking}
            options={mouseButtonOpts(t)}
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
          hint={t("macros.params.clickAtCursorHint")}
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
        <label className="caster-field">
          <span>{t("macros.params.button")}</span>
          <Select
            className="caster-select"
            value={action.button ?? "left"}
            disabled={disabled || picking}
            options={mouseButtonOpts(t)}
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
            ? t("macros.params.mouseDownHint")
            : t("macros.params.mouseUpHint")}
        </p>
      </div>
    );
  }

  if (action.type === "mouse.wheel") {
    return (
      <div className="props-grid">
        <label className="caster-field">
          <span>{t("macros.params.wheelDelta")}</span>
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
      <label className="caster-field">
        <span>{t("macros.params.durationMs")}</span>
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
        <label className="caster-field">
          <span>{t("macros.params.httpMethod")}</span>
          <Select
            className="caster-select"
            value={action.method ?? "GET"}
            disabled={disabled}
            options={HTTP_METHOD_OPTS}
            onChange={(method) => onChange({ ...action, method })}
          />
        </label>
        <label className="caster-field">
          <span>{t("macros.params.httpUrl")}</span>
          <input
            type="text"
            disabled={disabled}
            value={action.url}
            onChange={(e) => onChange({ ...action, url: e.target.value })}
          />
        </label>
        <label className="caster-field" style={{ gridColumn: "1 / -1" }}>
          <span>{t("macros.params.httpBody")}</span>
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
        <label className="caster-field">
          <span>{t("macros.params.httpTimeout")}</span>
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
        <label className="caster-field">
          <span>{t("macros.params.httpFailOn4xx")}</span>
          <input
            type="checkbox"
            disabled={disabled}
            checked={!!action.failOnStatus}
            onChange={(e) =>
              onChange({ ...action, failOnStatus: e.target.checked })
            }
          />
        </label>
        <label className="caster-field">
          <span>{t("macros.params.httpStatusVar")}</span>
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
        <label className="caster-field">
          <span>{t("macros.params.httpBodyVar")}</span>
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
        <div className="caster-field" style={{ gridColumn: "1 / -1" }}>
          <span>{t("macros.params.httpHeaders")}</span>
          {(action.headers ?? []).map((h, i) => (
            <div key={i} className="props-grid" style={{ marginTop: 6 }}>
              <input
                type="text"
                disabled={disabled}
                placeholder={t("macros.params.httpHeaderName")}
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
                placeholder={t("macros.params.httpHeaderValue")}
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
                {t("macros.params.httpRemoveHeader")}
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
              {t("macros.params.httpAddHeader")}
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
              {t("macros.params.httpAddBearer")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (action.type === "json.path") {
    return (
      <div className="props-grid">
        <label className="caster-field">
          <span>{t("macros.params.jsonSourceVar")}</span>
          <input
            type="text"
            disabled={disabled}
            value={action.sourceVar}
            onChange={(e) => onChange({ ...action, sourceVar: e.target.value })}
          />
        </label>
        <label className="caster-field">
          <span>{t("macros.params.jsonPath")}</span>
          <input
            type="text"
            disabled={disabled}
            value={action.path}
            onChange={(e) => onChange({ ...action, path: e.target.value })}
          />
        </label>
        <label className="caster-field">
          <span>{t("macros.params.jsonDestVar")}</span>
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
        ? t("macros.menu.add.keyDown")
        : action.type === "key.up"
          ? t("macros.menu.add.keyUp")
          : t("macros.params.key");
    return (
      <div className="props-grid">
        <label className="caster-field">
          <span>
            {keyTitle} {t("macros.params.keyVarOk")}
          </span>
          <input
            type="text"
            disabled={disabled}
            value={action.key}
            onChange={(e) => onChange({ ...action, key: e.target.value })}
          />
        </label>
        <label className="caster-field">
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
        <label className="caster-field">
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
        <label className="caster-field">
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
          {t("macros.params.captureKey")}
        </button>
      </div>
    );
  }

  if (action.type === "clipboard.set") {
    return (
      <label className="caster-field">
        <span>{t("macros.params.clipboardText")}</span>
        <input
          type="text"
          disabled={disabled}
          value={action.text}
          onChange={(e) => onChange({ ...action, text: e.target.value })}
        />
        <p className="hint">{t("macros.params.clipboardSetHint")}</p>
      </label>
    );
  }

  if (action.type === "clipboard.get") {
    return (
      <label className="caster-field">
        <span>{t("macros.params.operandVar")}</span>
        <input
          type="text"
          disabled={disabled}
          value={action.name}
          onChange={(e) => onChange({ ...action, name: e.target.value })}
        />
        <p className="hint">{t("macros.params.clipboardGetHint")}</p>
      </label>
    );
  }

  if (action.type === "var.set") {
    return (
      <div className="props-grid">
        <label className="caster-field">
          <span>{t("macros.params.varName")}</span>
          <input
            type="text"
            disabled={disabled}
            value={action.name}
            onChange={(e) => onChange({ ...action, name: e.target.value })}
          />
        </label>
        <label className="caster-field">
          <span>{t("macros.params.varValue")}</span>
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
        <label className="caster-field">
          <span>{t("macros.params.ifLeft")}</span>
          <Select
            className="caster-select"
            disabled={disabled}
            value={operandMode(left)}
            options={operandModeOpts(t)}
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
        <label className="caster-field">
          <span>
            {operandMode(left) === "var"
              ? t("macros.params.operandVarShort")
              : t("macros.params.varValue")}
          </span>
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
        <label className="caster-field">
          <span>{t("macros.params.ifOperator")}</span>
          <Select
            className="caster-select"
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
        <label className="caster-field">
          <span>{t("macros.params.ifRight")}</span>
          <Select
            className="caster-select"
            disabled={disabled}
            value={operandMode(right)}
            options={operandModeOpts(t)}
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
        <label className="caster-field">
          <span>
            {operandMode(right) === "var"
              ? t("macros.params.operandVarShort")
              : t("macros.params.varValue")}
          </span>
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
                label={t("macros.params.addThen")}
                disabled={disabled}
                items={branchAddMenuItems("then")}
              />
              <ActionPickerMenu
                label={t("macros.params.addElse")}
                disabled={disabled}
                items={branchAddMenuItems("else")}
              />
            </>
          ) : null}
        </div>
      </div>
    );
  }

  if (action.type === "control.while") {
    const left = action.condition.left;
    const right = action.condition.right;
    return (
      <div className="props-grid">
        <label className="caster-field">
          <span>{t("macros.params.ifLeft")}</span>
          <Select
            className="caster-select"
            disabled={disabled}
            value={operandMode(left)}
            options={operandModeOpts(t)}
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
        <label className="caster-field">
          <span>
            {operandMode(left) === "var"
              ? t("macros.params.operandVarShort")
              : t("macros.params.varValue")}
          </span>
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
        <label className="caster-field">
          <span>{t("macros.params.ifOperator")}</span>
          <Select
            className="caster-select"
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
        <label className="caster-field">
          <span>{t("macros.params.ifRight")}</span>
          <Select
            className="caster-select"
            disabled={disabled}
            value={operandMode(right)}
            options={operandModeOpts(t)}
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
        <label className="caster-field">
          <span>
            {operandMode(right) === "var"
              ? t("macros.params.operandVarShort")
              : t("macros.params.varValue")}
          </span>
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
        <label className="caster-field">
          <span>{t("macros.params.maxIterations")}</span>
          <input
            type="number"
            disabled={disabled}
            min={1}
            value={action.maxIterations ?? 10000}
            onChange={(e) => {
              const n = Number(e.target.value);
              onChange({
                ...action,
                maxIterations: Number.isFinite(n)
                  ? Math.max(1, Math.floor(n))
                  : 10000,
              });
            }}
          />
        </label>
        <div className="actions wrap">
          {branchAddMenuItems ? (
            <ActionPickerMenu
              label={t("macros.params.addBody")}
              disabled={disabled}
              items={branchAddMenuItems("body")}
            />
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
      <label className="caster-field">
        <span>{t("macros.params.processCommand")}</span>
        <input
          type="text"
          disabled={disabled}
          value={action.command}
          onChange={(e) => onChange({ ...action, command: e.target.value })}
        />
      </label>
      <label className="caster-field">
        <span>{t("macros.params.processArgs")}</span>
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
  const t = useT();
  const presets = useMemo(() => getScriptPresets(t), [t]);
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
  const permLabels = libDoc ? activePermissionLabels(libDoc, t) : [];

  function applyPreset(preset: ScriptPreset) {
    onChange({
      ...action,
      scriptId: null,
      source: preset.source,
      params: {},
    });
  }

  return (
    <div className="caster-scriptrun-props">
      <div className="caster-scriptrun-props-title">
        {actionTitle("script.run", t)}
        {useLibrary && libDoc ? (
          <span className="caster-scriptrun-props-sub">· {libDoc.name}</span>
        ) : !useLibrary ? (
          <span className="caster-scriptrun-props-sub">
            · {t("macros.library.scriptSourceInline")}
          </span>
        ) : null}
      </div>

      <section className="caster-scriptrun-section">
        <button
          type="button"
          className="caster-scriptrun-section-head"
          onClick={() => setSourceOpen((v) => !v)}
        >
          {t("macros.params.scriptSectionSource")} {sourceOpen ? "▾" : "▸"}
        </button>
        {sourceOpen ? (
          <div className="caster-scriptrun-section-body props-grid">
            <div className="caster-field" style={{ gridColumn: "1 / -1" }}>
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
                  { value: "library", label: t("macros.library.title") },
                  {
                    value: "inline",
                    label: t("macros.library.scriptSourceInline"),
                  },
                ]}
                disabled={disabled}
              />
            </div>
            {useLibrary ? (
              <>
                <label className="caster-field" style={{ gridColumn: "1 / -1" }}>
                  <span>{t("macros.library.scriptSourceLibrary")}</span>
                  <Select
                    className="caster-select"
                    disabled={disabled}
                    value={action.scriptId ?? ""}
                    options={[
                      { value: "", label: t("macros.library.scriptSourceChoose") },
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
                    className="caster-script-perm-chips"
                    style={{ gridColumn: "1 / -1" }}
                  >
                    {permLabels.map((p) => (
                      <span key={p} className="caster-script-perm-chip">
                        {p}
                      </span>
                    ))}
                  </div>
                ) : null}
                {action.scriptId && onOpenScript ? (
                  <button
                    type="button"
                    className="caster-btn caster-btn-ghost"
                    style={{ gridColumn: "1 / -1" }}
                    disabled={disabled}
                    onClick={() =>
                      onOpenScript(action.scriptId!, libDoc?.name)
                    }
                  >
                    {t("macros.library.openInEditor")}
                  </button>
                ) : null}
              </>
            ) : (
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="caster-field">
                  <span>{t("macros.params.scriptSourceJs")}</span>
                  <textarea
                    rows={7}
                    disabled={disabled}
                    value={action.source ?? ""}
                    onChange={(e) =>
                      onChange({ ...action, source: e.target.value })
                    }
                    className="caster-script-inline-source"
                  />
                </label>
                <div className="caster-scriptrun-examples">
                  <DropdownMenu
                    label={t("macros.params.scriptExamples")}
                    disabled={disabled}
                    triggerClassName="caster-btn caster-btn-ghost"
                    menuClassName="caster-scriptrun-examples-menu"
                    items={
                      [
                        ...presets.map((p) => ({
                          id: `ex-${p.id}`,
                          label: p.name,
                          icon: <FileCode2 size={14} />,
                          onSelect: () => applyPreset(p),
                        })),
                        { id: "sep-min", label: "", separator: true },
                        {
                          id: "minimal",
                          label: t("macros.params.scriptTemplateMinimal"),
                          icon: <FileCode2 size={14} />,
                          onSelect: () => {
                            onChange({
                              ...action,
                              source: t("macros.action.minimalScriptSource"),
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
        <section className="caster-scriptrun-section">
          <button
            type="button"
            className="caster-scriptrun-section-head"
            onClick={() => setParamsOpen((v) => !v)}
          >
            {t("macros.params.scriptSectionParams")} {paramsOpen ? "▾" : "▸"}
          </button>
          {paramsOpen ? (
            <div className="caster-scriptrun-section-body">
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

      <section className="caster-scriptrun-section">
        <button
          type="button"
          className="caster-scriptrun-section-head"
          onClick={() => setExecOpen((v) => !v)}
        >
          {t("macros.params.scriptSectionExec")} {execOpen ? "▾" : "▸"}
        </button>
        {execOpen ? (
          <div className="caster-scriptrun-section-body props-grid">
            <label className="caster-field">
              <span>{t("macros.params.httpTimeout")}</span>
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
            <label className="caster-field">
              <span>{t("macros.params.scriptResultVar")}</span>
              <Tooltip content={t("macros.params.scriptResultVarTip")}>
                <input
                  type="text"
                  disabled={disabled}
                  placeholder={t("macros.params.scriptResultPlaceholder")}
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
