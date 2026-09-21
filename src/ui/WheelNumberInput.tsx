import { useState, type InputHTMLAttributes } from "react";
import { useGlobalWheelNudge } from "./useGlobalWheelNudge";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value: number | string;
  onValueChange: (n: number) => void;
  /** Optional fields that may be cleared (stores empty string upstream). */
  onEmptyChange?: () => void;
};

/** Number input that nudges via window wheel while focused. */
export function WheelNumberInput({
  value,
  onValueChange,
  onEmptyChange,
  disabled,
  min,
  max,
  step,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);

  useGlobalWheelNudge(focused && !disabled, (delta) => {
    const raw = typeof value === "number" ? value : Number(value);
    const cur = Number.isFinite(raw) ? raw : 0;
    const stepN = step != null && step !== "" ? Number(step) : 1;
    const unit = Number.isFinite(stepN) && stepN > 0 ? stepN : 1;
    // `delta` is already ±1 or ±10 (Shift); scale by the input's step.
    let next = Math.round(cur + delta * unit);
    const minN = min != null && min !== "" ? Number(min) : null;
    const maxN = max != null && max !== "" ? Number(max) : null;
    if (minN != null && Number.isFinite(minN)) next = Math.max(minN, next);
    if (maxN != null && Number.isFinite(maxN)) next = Math.min(maxN, next);
    onValueChange(next);
  });

  return (
    <input
      {...rest}
      type="number"
      value={value}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      onFocus={(ev) => {
        setFocused(true);
        onFocus?.(ev);
      }}
      onBlur={(ev) => {
        setFocused(false);
        onBlur?.(ev);
      }}
      onChange={(ev) => {
        if (ev.target.value.trim() === "") {
          onEmptyChange?.();
          return;
        }
        const n = Number(ev.target.value);
        if (!Number.isFinite(n)) return;
        onValueChange(n);
      }}
    />
  );
}
