import { useEffect, useRef, useState } from "react";
import type { MacroValue } from "../macros/types";
import {
  parseParamDefs,
  paramValueAsString,
  parseParamInput,
  type ScriptParamDef,
} from "./parseParams";

type Props = {
  defs: ScriptParamDef[];
  values: Record<string, MacroValue>;
  onChange: (name: string, value: MacroValue) => void;
  disabled?: boolean;
  /** Compact bar layout (editor). Default true. */
  compact?: boolean;
  onBlurField?: () => void;
};

const VISIBLE_MAX = 4;

export function ScriptParamsFields({
  defs,
  values,
  onChange,
  disabled,
  compact = true,
  onBlurField,
}: Props) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overflowOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOverflowOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [overflowOpen]);

  if (defs.length === 0) return null;

  const visible =
    defs.length > VISIBLE_MAX ? defs.slice(0, VISIBLE_MAX) : defs;
  const hidden =
    defs.length > VISIBLE_MAX ? defs.slice(VISIBLE_MAX) : [];

  return (
    <div
      className={
        compact ? "v2-script-params-bar" : "v2-script-params-fields"
      }
      ref={wrapRef}
    >
      {visible.map((def) => (
        <ParamControl
          key={def.name}
          def={def}
          value={values[def.name]}
          disabled={disabled}
          onChange={onChange}
          onBlurField={onBlurField}
        />
      ))}
      {hidden.length > 0 ? (
        <div className="v2-script-params-overflow">
          <button
            type="button"
            className="v2-btn v2-btn-ghost v2-script-params-more"
            disabled={disabled}
            onClick={() => setOverflowOpen((v) => !v)}
          >
            +{hidden.length} autres ▾
          </button>
          {overflowOpen ? (
            <div className="v2-menu-popover v2-script-params-popover">
              {hidden.map((def) => (
                <ParamControl
                  key={def.name}
                  def={def}
                  value={values[def.name]}
                  disabled={disabled}
                  onChange={onChange}
                  onBlurField={onBlurField}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ParamControl({
  def,
  value,
  disabled,
  onChange,
  onBlurField,
}: {
  def: ScriptParamDef;
  value: MacroValue | undefined;
  disabled?: boolean;
  onChange: (name: string, value: MacroValue) => void;
  onBlurField?: () => void;
}) {
  return (
    <label className="v2-script-param-field">
      <span>
        {def.name}
        <em>{def.type}</em>
      </span>
      {def.type === "boolean" ? (
        <input
          type="checkbox"
          disabled={disabled}
          checked={Boolean(value ?? def.default ?? false)}
          onChange={(e) => onChange(def.name, e.target.checked)}
        />
      ) : (
        <input
          type={def.type === "number" ? "number" : "text"}
          disabled={disabled}
          value={paramValueAsString(value, def.default)}
          onChange={(e) =>
            onChange(def.name, parseParamInput(def.type, e.target.value))
          }
          onBlur={onBlurField}
        />
      )}
    </label>
  );
}

export { parseParamDefs };
