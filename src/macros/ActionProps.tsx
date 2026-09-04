import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { pickScreenPoint } from "../pick";
import { Segmented, AddMenu } from "../ui";
import type { AddMenuEntry } from "../ui";
import type { CompareOp, KeyMods, MacroAction, MacroValue, Operand } from "./types";
import type { ScriptDoc } from "../scripts/types";

const SCRIPT_SNIPPET_GET = `// GET JSON → variable
const res = caster.fetch({ method: "GET", url: "https://httpbin.org/get" });
caster.set("status", res.status);
caster.set("body", res.body);
caster.log("ok " + res.status);
`;

const SCRIPT_SNIPPET_SET = `// Lire / écrire une variable
const n = caster.get("n") ?? 0;
caster.set("n", n + 1);
caster.log("n=" + caster.get("n"));
`;

type Props = {
  action: MacroAction | null;
  disabled?: boolean;
  onChange: (action: MacroAction) => void;
  branchAddMenuItems?: (branch: "then" | "else") => AddMenuEntry[];
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
          <select
            value={action.button ?? "left"}
            disabled={disabled || picking}
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
          <select
            value={action.button ?? "left"}
            disabled={disabled || picking}
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
          <select
            value={action.method ?? "GET"}
            disabled={disabled}
            onChange={(e) => onChange({ ...action, method: e.target.value })}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
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
      <ScriptRunProps action={action} disabled={disabled} onChange={onChange} />
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
          <select
            disabled={disabled}
            value={operandMode(left)}
            onChange={(e) =>
              onChange({
                ...action,
                condition: {
                  ...action.condition,
                  left:
                    e.target.value === "var"
                      ? { var: "n" }
                      : 0,
                },
              })
            }
          >
            <option value="var">Variable</option>
            <option value="lit">Littéral</option>
          </select>
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
          <select
            disabled={disabled}
            value={action.condition.op}
            onChange={(e) =>
              onChange({
                ...action,
                condition: {
                  ...action.condition,
                  op: e.target.value as CompareOp,
                },
              })
            }
          >
            <option value="eq">=</option>
            <option value="ne">≠</option>
            <option value="gt">&gt;</option>
            <option value="lt">&lt;</option>
            <option value="gte">≥</option>
            <option value="lte">≤</option>
          </select>
        </label>
        <label className="v2-field">
          <span>Droite</span>
          <select
            disabled={disabled}
            value={operandMode(right)}
            onChange={(e) =>
              onChange({
                ...action,
                condition: {
                  ...action.condition,
                  right: e.target.value === "var" ? { var: "n" } : 0,
                },
              })
            }
          >
            <option value="var">Variable</option>
            <option value="lit">Littéral</option>
          </select>
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
              <AddMenu
                label="+ Alors"
                disabled={disabled}
                items={branchAddMenuItems("then")}
              />
              <AddMenu
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
}: {
  action: Extract<MacroAction, { type: "script.run" }>;
  disabled?: boolean;
  onChange: (action: MacroAction) => void;
}) {
  const [scripts, setScripts] = useState<ScriptDoc[]>([]);

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

  return (
    <div className="props-grid">
      <label className="v2-field" style={{ gridColumn: "1 / -1" }}>
        <span>Script bibliothèque</span>
        <select
          disabled={disabled}
          value={action.scriptId ?? ""}
          onChange={(e) => {
            const scriptId = e.target.value === "" ? null : e.target.value;
            onChange({
              ...action,
              scriptId,
              source: scriptId ? "" : action.source ?? "",
            });
          }}
        >
          <option value="">— Inline —</option>
          {scripts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {!s.allowNetwork ? " (sans réseau)" : ""}
            </option>
          ))}
        </select>
      </label>
      {!useLibrary ? (
        <>
          <label className="v2-field" style={{ gridColumn: "1 / -1" }}>
            <span>Source JavaScript</span>
            <textarea
              rows={10}
              disabled={disabled}
              value={action.source ?? ""}
              onChange={(e) => onChange({ ...action, source: e.target.value })}
              style={{
                fontFamily: "ui-monospace, Consolas, monospace",
                width: "100%",
                fontSize: 12,
              }}
            />
          </label>
          <div className="actions wrap" style={{ gridColumn: "1 / -1" }}>
            <button
              type="button"
              className="ghost"
              disabled={disabled}
              onClick={() => onChange({ ...action, source: SCRIPT_SNIPPET_GET })}
            >
              Snippet GET JSON
            </button>
            <button
              type="button"
              className="ghost"
              disabled={disabled}
              onClick={() => onChange({ ...action, source: SCRIPT_SNIPPET_SET })}
            >
              Snippet set var
            </button>
          </div>
        </>
      ) : null}
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
    </div>
  );
}
