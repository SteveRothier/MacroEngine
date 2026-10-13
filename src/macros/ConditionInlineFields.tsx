import type { ReactNode } from "react";
import { Select } from "../ui/shell";
import { WheelNumberInput } from "../ui/WheelNumberInput";
import { useT } from "../i18n";
import {
  CLIPBOARD_PREDICATE_OPTS,
  MOUSE_BUTTON_OPTS,
  MOUSE_PREDICATE_OPTS,
  PROCESS_PREDICATE_OPTS,
  TIME_COMPARE_OP_OPTS,
  TIME_UNIT_OPTS,
  WINDOW_PREDICATE_OPTS,
  conditionFamily,
  isClipboardPredicate,
  isMousePredicate,
  isProcessPredicate,
  isWindowPredicate,
  patchConditionParams,
  setMousePredicate,
  type ClipboardPredicate,
  type MousePredicate,
  type ProcessPredicate,
  type WindowPredicate,
} from "./conditionOps";
import type { CompareOp, Condition, ConditionParams } from "./types";

type Props = {
  condition: Condition;
  disabled?: boolean;
  onChange: (condition: Condition) => void;
};

function ConditionField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="caster-condition-field">
      <span className="caster-condition-field-label">{label}</span>
      {children}
    </label>
  );
}

/** Normalize to `#rrggbb` for `<input type="color">`, or null if invalid. */
function toColorInputValue(raw: string): string | null {
  const s = raw.trim();
  const m6 = /^#?([0-9a-fA-F]{6})$/.exec(s);
  if (m6) return `#${m6[1]!.toLowerCase()}`;
  const m3 = /^#?([0-9a-fA-F]{3})$/.exec(s);
  if (m3) {
    const [a, b, c] = m3[1]!;
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  return null;
}

/** Compact family-specific condition params for the Si/Tant que action bar. */
export function ConditionInlineFields({
  condition,
  disabled,
  onChange,
}: Props) {
  const t = useT();
  const family = conditionFamily(condition);
  const params = condition.params ?? {};

  const processOpts = PROCESS_PREDICATE_OPTS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }));
  const windowOpts = WINDOW_PREDICATE_OPTS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }));
  const mousePredOpts = MOUSE_PREDICATE_OPTS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }));
  const mouseButtonOpts = MOUSE_BUTTON_OPTS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }));
  const clipboardOpts = CLIPBOARD_PREDICATE_OPTS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }));
  const timeUnitOpts = TIME_UNIT_OPTS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }));

  const mousePred = isMousePredicate(condition.predicate)
    ? condition.predicate
    : "mouse.inRect";

  const colorRaw = params.color ?? "#ffffff";
  const colorPickerValue = toColorInputValue(colorRaw) ?? "#ffffff";

  if (family === "process") {
    return (
      <div className="caster-condition-inline" role="group">
        <Select
          className="action-cell-select caster-condition-pred"
          disabled={disabled}
          value={
            isProcessPredicate(condition.predicate)
              ? condition.predicate
              : "process.eq"
          }
          ariaLabel={t("macros.params.processPredicate")}
          options={processOpts}
          onChange={(v) =>
            onChange({
              ...condition,
              predicate: v as ProcessPredicate,
              value: condition.value ?? "",
            })
          }
        />
        <ConditionField label={t("macros.params.processExe")}>
          <input
            type="text"
            className="action-cell-input caster-condition-value caster-condition-value--wide"
            disabled={disabled}
            value={condition.value ?? ""}
            placeholder={t("macros.params.processExePlaceholder")}
            onChange={(e) =>
              onChange({
                ...condition,
                predicate: condition.predicate ?? "process.eq",
                value: e.target.value,
              })
            }
          />
        </ConditionField>
      </div>
    );
  }

  if (family === "window") {
    return (
      <div className="caster-condition-inline" role="group">
        <Select
          className="action-cell-select caster-condition-pred"
          disabled={disabled}
          value={
            isWindowPredicate(condition.predicate)
              ? condition.predicate
              : "window.title.contains"
          }
          ariaLabel={t("macros.params.processPredicate")}
          options={windowOpts}
          onChange={(v) =>
            onChange({
              ...condition,
              predicate: v as WindowPredicate,
              value: condition.value ?? "",
            })
          }
        />
        <ConditionField label={t("macros.params.windowTitle")}>
          <input
            type="text"
            className="action-cell-input caster-condition-value caster-condition-value--wide"
            disabled={disabled}
            value={condition.value ?? ""}
            placeholder={t("macros.params.windowTitlePlaceholder")}
            onChange={(e) =>
              onChange({
                ...condition,
                predicate: condition.predicate ?? "window.title.contains",
                value: e.target.value,
              })
            }
          />
        </ConditionField>
        <ConditionField label={t("macros.params.windowExeOptional")}>
          <input
            type="text"
            className="action-cell-input caster-condition-value"
            disabled={disabled}
            value={params.exe ?? ""}
            placeholder={t("macros.params.processExePlaceholder")}
            onChange={(e) =>
              onChange(
                patchConditionParams(condition, {
                  exe: e.target.value || undefined,
                }),
              )
            }
          />
        </ConditionField>
      </div>
    );
  }

  if (family === "pixel") {
    return (
      <div className="caster-condition-inline" role="group">
        <ConditionField label="X">
          <WheelNumberInput
            className="action-cell-input action-cell-num caster-condition-num--coord"
            disabled={disabled}
            value={params.x ?? 0}
            onValueChange={(n) =>
              onChange(patchConditionParams(condition, { x: Math.floor(n) }))
            }
          />
        </ConditionField>
        <ConditionField label="Y">
          <WheelNumberInput
            className="action-cell-input action-cell-num caster-condition-num--coord"
            disabled={disabled}
            value={params.y ?? 0}
            onValueChange={(n) =>
              onChange(patchConditionParams(condition, { y: Math.floor(n) }))
            }
          />
        </ConditionField>
        <ConditionField label={t("macros.params.pixelColor")}>
          <span className="caster-condition-color">
            <input
              type="color"
              className="caster-condition-swatch"
              disabled={disabled}
              value={colorPickerValue}
              aria-label={t("macros.params.pixelColor")}
              onChange={(e) =>
                onChange(
                  patchConditionParams(condition, { color: e.target.value }),
                )
              }
            />
            <input
              type="text"
              className="action-cell-input caster-condition-value caster-condition-value--hex"
              disabled={disabled}
              value={colorRaw}
              placeholder="#rrggbb"
              onChange={(e) =>
                onChange(
                  patchConditionParams(condition, { color: e.target.value }),
                )
              }
            />
          </span>
        </ConditionField>
        <ConditionField label={t("macros.params.pixelTolerance")}>
          <WheelNumberInput
            className="action-cell-input action-cell-num caster-condition-num--tol"
            disabled={disabled}
            min={0}
            max={255}
            value={params.tolerance ?? 10}
            onValueChange={(n) =>
              onChange(
                patchConditionParams(condition, {
                  tolerance: Math.max(0, Math.min(255, Math.floor(n))),
                }),
              )
            }
          />
        </ConditionField>
      </div>
    );
  }

  if (family === "mouse") {
    return (
      <div className="caster-condition-inline" role="group">
        <Select
          className="action-cell-select caster-condition-pred"
          disabled={disabled}
          value={mousePred}
          ariaLabel={t("macros.params.processPredicate")}
          options={mousePredOpts}
          onChange={(v) =>
            onChange(setMousePredicate(condition, v as MousePredicate))
          }
        />
        {mousePred === "mouse.button.down" ? (
          <ConditionField label={t("macros.params.mouseButton")}>
            <Select
              className="action-cell-select caster-condition-mode"
              disabled={disabled}
              value={params.button ?? "left"}
              ariaLabel={t("macros.params.mouseButton")}
              options={mouseButtonOpts}
              onChange={(v) =>
                onChange(
                  patchConditionParams(condition, {
                    button: v as "left" | "right" | "middle",
                  }),
                )
              }
            />
          </ConditionField>
        ) : (
          (["x1", "y1", "x2", "y2"] as const).map((key) => (
            <ConditionField key={key} label={key.toUpperCase()}>
              <WheelNumberInput
                className="action-cell-input action-cell-num caster-condition-num--coord"
                disabled={disabled}
                value={params[key] ?? 0}
                onValueChange={(n) =>
                  onChange(
                    patchConditionParams(condition, {
                      [key]: Math.floor(n),
                    }),
                  )
                }
              />
            </ConditionField>
          ))
        )}
      </div>
    );
  }

  if (family === "key") {
    return (
      <div className="caster-condition-inline" role="group">
        <ConditionField label={t("macros.params.key")}>
          <input
            type="text"
            className="action-cell-input caster-condition-value"
            disabled={disabled}
            value={params.key ?? ""}
            placeholder="F1"
            onChange={(e) =>
              onChange(patchConditionParams(condition, { key: e.target.value }))
            }
          />
        </ConditionField>
        {(["ctrl", "alt", "shift"] as const).map((mod) => (
          <label key={mod} className="caster-condition-check">
            <input
              type="checkbox"
              disabled={disabled}
              checked={!!params.mods?.[mod]}
              onChange={(e) =>
                onChange(
                  patchConditionParams(condition, {
                    mods: {
                      ctrl: !!params.mods?.ctrl,
                      alt: !!params.mods?.alt,
                      shift: !!params.mods?.shift,
                      [mod]: e.target.checked,
                    },
                  }),
                )
              }
            />
            <span>
              {mod === "ctrl" ? "Ctrl" : mod === "alt" ? "Alt" : "Shift"}
            </span>
          </label>
        ))}
      </div>
    );
  }

  if (family === "time") {
    return (
      <div className="caster-condition-inline" role="group">
        <ConditionField label={t("macros.params.timeUnit")}>
          <Select
            className="action-cell-select caster-condition-pred"
            disabled={disabled}
            value={params.unit ?? "hour"}
            ariaLabel={t("macros.params.timeUnit")}
            options={timeUnitOpts}
            onChange={(v) =>
              onChange(
                patchConditionParams(condition, {
                  unit: v as NonNullable<ConditionParams["unit"]>,
                }),
              )
            }
          />
        </ConditionField>
        <ConditionField label={t("macros.params.ifOperator")}>
          <Select
            className="action-cell-select caster-condition-op"
            disabled={disabled}
            value={params.op ?? "gte"}
            ariaLabel={t("macros.params.ifOperator")}
            options={TIME_COMPARE_OP_OPTS}
            onChange={(v) =>
              onChange(
                patchConditionParams(condition, { op: v as CompareOp }),
              )
            }
          />
        </ConditionField>
        <ConditionField label={t("macros.params.varValue")}>
          <WheelNumberInput
            className="action-cell-input action-cell-num caster-condition-num--coord"
            disabled={disabled}
            min={0}
            value={typeof params.value === "number" ? params.value : 0}
            onValueChange={(n) =>
              onChange(
                patchConditionParams(condition, { value: Math.floor(n) }),
              )
            }
          />
        </ConditionField>
      </div>
    );
  }

  if (family === "clipboard") {
    return (
      <div className="caster-condition-inline" role="group">
        <Select
          className="action-cell-select caster-condition-pred"
          disabled={disabled}
          value={
            isClipboardPredicate(condition.predicate)
              ? condition.predicate
              : "clipboard.contains"
          }
          ariaLabel={t("macros.params.processPredicate")}
          options={clipboardOpts}
          onChange={(v) =>
            onChange({
              ...condition,
              predicate: v as ClipboardPredicate,
              value: condition.value ?? "",
            })
          }
        />
        {condition.predicate !== "clipboard.empty" ? (
          <ConditionField label={t("macros.params.clipboardText")}>
            <input
              type="text"
              className="action-cell-input caster-condition-value caster-condition-value--wide"
              disabled={disabled}
              value={condition.value ?? ""}
              onChange={(e) =>
                onChange({
                  ...condition,
                  predicate: condition.predicate ?? "clipboard.contains",
                  value: e.target.value,
                })
              }
            />
          </ConditionField>
        ) : null}
      </div>
    );
  }

  if (family === "variable") {
    return (
      <div className="caster-condition-inline" role="group">
        <ConditionField label={t("macros.params.varName")}>
          <input
            type="text"
            className="action-cell-input caster-condition-value"
            disabled={disabled}
            value={condition.value ?? ""}
            placeholder="n"
            title={t("macros.params.varDefinedTip")}
            onChange={(e) =>
              onChange({
                ...condition,
                predicate: "var.defined",
                value: e.target.value,
              })
            }
          />
        </ConditionField>
      </div>
    );
  }

  return null;
}
