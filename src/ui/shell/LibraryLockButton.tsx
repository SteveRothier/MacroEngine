import { Lock } from "lucide-react";
import { Tooltip } from "./Tooltip";

type Props = {
  locked: boolean;
  lockTitle: string;
  unlockTitle: string;
  onToggle: (locked: boolean) => void;
  disabled?: boolean;
};

/** Titlebar lock toggle — muted Lock to lock, orange Lock to unlock. */
export function LibraryLockButton({
  locked,
  lockTitle,
  unlockTitle,
  onToggle,
  disabled,
}: Props) {
  const title = locked ? unlockTitle : lockTitle;
  return (
    <Tooltip content={title}>
      <button
        type="button"
        className={[
          "caster-titlebar-btn",
          "caster-btn",
          "caster-btn-ghost",
          locked ? "caster-clicker-lock" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => onToggle(!locked)}
        disabled={disabled}
        aria-label={title}
        aria-pressed={locked}
      >
        <Lock size={14} aria-hidden />
      </button>
    </Tooltip>
  );
}
