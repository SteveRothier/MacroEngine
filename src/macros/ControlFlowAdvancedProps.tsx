import { WheelNumberInput } from "../ui/WheelNumberInput";
import { useT } from "../i18n";
import type { MacroAction } from "./types";

type ControlFlowAction =
  | Extract<MacroAction, { type: "control.if" }>
  | Extract<MacroAction, { type: "control.while" }>;

type Props = {
  action: ControlFlowAction;
  disabled?: boolean;
  onChange: (action: MacroAction) => void;
};

/** While-only options (max iterations). Branch adds live in the action list. */
export function ControlFlowAdvancedProps({
  action,
  disabled,
  onChange,
}: Props) {
  const t = useT();

  if (action.type !== "control.while") return null;

  return (
    <div className="caster-control-flow-advanced">
      <section className="caster-control-flow-options">
        <strong className="caster-control-flow-options-title">
          {t("macros.params.branchOptions")}
        </strong>
        <label className="caster-field">
          <span>{t("macros.params.maxIterations")}</span>
          <WheelNumberInput
            disabled={disabled}
            min={1}
            value={action.maxIterations ?? 10000}
            onValueChange={(n) =>
              onChange({
                ...action,
                maxIterations: Number.isFinite(n)
                  ? Math.max(1, Math.floor(n))
                  : 10000,
              })
            }
          />
        </label>
      </section>
    </div>
  );
}
