import { RotateCcw } from "lucide-react";
import { useT } from "../i18n";
import type { ConsoleLine } from "./ScriptConsole";

type Props = {
  lines: ConsoleLine[];
  running: boolean;
  onRelaunch: () => void;
};

export function ScriptRunTimeline({ lines, running, onRelaunch }: Props) {
  const t = useT();
  if (lines.length === 0 && !running) return null;

  return (
    <div className="caster-script-run-timeline">
      <div className="caster-script-run-timeline-head">
        <span>{t("scripts.timeline.title")}</span>
        <button
          type="button"
          className="caster-btn caster-btn-ghost caster-script-run-relaunch"
          disabled={running}
          onClick={onRelaunch}
        >
          <RotateCcw size={13} aria-hidden />
          {t("scripts.timeline.relaunch")}
        </button>
      </div>
      <ul className="caster-script-run-timeline-list" aria-live="polite">
        {lines.length === 0 ? (
          <li className="caster-script-run-timeline-empty">
            {t("scripts.timeline.running")}
          </li>
        ) : (
          lines.map((line) => (
            <li
              key={line.id}
              className={`caster-script-run-timeline-item is-${line.level}`}
            >
              <span className="caster-script-run-timeline-time">{line.time}</span>
              <span className="caster-script-run-timeline-msg">{line.text}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
