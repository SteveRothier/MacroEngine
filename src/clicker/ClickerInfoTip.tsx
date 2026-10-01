import { Info } from "lucide-react";
import { Tooltip } from "../ui/shell";

type Props = {
  text: string;
};

/** Compact info control that shows an explanation via the shell Tooltip. */
export function ClickerInfoTip({ text }: Props) {
  if (!text) return null;
  return (
    <Tooltip content={text} side="top" delay={200}>
      <button
        type="button"
        className="caster-clicker-info-tip"
        aria-label={text}
      >
        <Info size={14} strokeWidth={2} aria-hidden />
      </button>
    </Tooltip>
  );
}
