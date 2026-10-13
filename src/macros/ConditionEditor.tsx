import { useT } from "../i18n";
import { Select } from "../ui/shell";
import type { CompareOp, Condition, Operand } from "./types";
import {
  COMPARE_OP_OPTS,
  operandDisplay,
  operandMode,
  setOperandValue,
  switchOperandMode,
} from "./conditionOps";

type Props = {
  condition: Condition;
  disabled?: boolean;
  onChange: (condition: Condition) => void;
};

function OperandField({
  value,
  disabled,
  ariaLabel,
  onChange,
}: {
  value: Operand;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (next: Operand) => void;
}) {
  const t = useT();
  const mode = operandMode(value);
  return (
    <span className="caster-condition-operand">
      <Select
        className="action-cell-select caster-condition-mode"
        disabled={disabled}
        value={mode}
        ariaLabel={ariaLabel}
        options={[
          { value: "var", label: t("macros.params.operandVarShort") },
          { value: "lit", label: t("macros.params.operandLitShort") },
        ]}
        onChange={(v) =>
          onChange(switchOperandMode(value, v === "var" ? "var" : "lit"))
        }
      />
      <input
        type="text"
        className="action-cell-input caster-condition-value"
        disabled={disabled}
        value={operandDisplay(value)}
        aria-label={
          mode === "var"
            ? t("macros.params.operandVarShort")
            : t("macros.params.varValue")
        }
        onChange={(e) => onChange(setOperandValue(value, e.target.value))}
      />
    </span>
  );
}

/** Compact one-line condition editor: [Var|Lit][value] [op] [Var|Lit][value]. */
export function ConditionEditor({ condition, disabled, onChange }: Props) {
  const t = useT();
  const hideRight = condition.op === "empty";
  return (
    <div className="caster-condition-editor" role="group" aria-label={t("macros.params.ifOperator")}>
      <OperandField
        value={condition.left}
        disabled={disabled}
        ariaLabel={t("macros.params.ifLeft")}
        onChange={(left) => onChange({ ...condition, left })}
      />
      <Select
        className="action-cell-select caster-condition-op"
        disabled={disabled}
        value={condition.op}
        ariaLabel={t("macros.params.ifOperator")}
        options={COMPARE_OP_OPTS}
        onChange={(op) =>
          onChange({ ...condition, op: op as CompareOp })
        }
      />
      {hideRight ? null : (
        <OperandField
          value={condition.right}
          disabled={disabled}
          ariaLabel={t("macros.params.ifRight")}
          onChange={(right) => onChange({ ...condition, right })}
        />
      )}
    </div>
  );
}
