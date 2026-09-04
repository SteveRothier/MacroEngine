import type { ReactNode } from "react";
import { ArrowLeft, Circle, Pause, Play, Square } from "lucide-react";

type Props = {
  onBack: () => void;
  locked: boolean;
  engineState: string;
  recording: boolean;
  recordPaused: boolean;
  recordCount: number;
  onPlay: () => void;
  onStartRecord: () => void;
  onPauseRecord: () => void;
  onResumeRecord: () => void;
  onStopRecord: () => void;
  /** Nom / répétitions / raccourci — fused into this bar. */
  meta?: ReactNode;
};

export function MacroTitleBarTools({
  onBack,
  locked,
  engineState,
  recording,
  recordPaused,
  recordCount,
  onPlay,
  onStartRecord,
  onPauseRecord,
  onResumeRecord,
  onStopRecord,
  meta,
}: Props) {
  const running = engineState === "running" || engineState === "paused";
  const busy = running || recording;

  return (
    <div className="v2-editor-toolbar">
      <button
        type="button"
        className="v2-titlebar-btn v2-btn v2-btn-ghost"
        onClick={onBack}
        title="Retour aux automations"
      >
        <ArrowLeft size={14} aria-hidden />
      </button>
      {meta}
      <div className="v2-editor-toolbar-spacer" />
      {recording ? (
        <span className="v2-titlebar-record-status" role="status">
          Capture{recordPaused ? " en pause" : ""} · {recordCount}
        </span>
      ) : null}
      {!recording ? (
        <button
          type="button"
          className="v2-titlebar-btn v2-btn v2-btn-ghost"
          disabled={locked || busy}
          onClick={onStartRecord}
          title="Capturer des gestes"
        >
          <Circle size={14} aria-hidden />
          Capturer
        </button>
      ) : (
        <>
          {recordPaused ? (
            <button
              type="button"
              className="v2-titlebar-btn v2-btn v2-btn-ghost"
              onClick={onResumeRecord}
              title="Reprendre la capture"
            >
              <Play size={14} aria-hidden />
              Reprendre
            </button>
          ) : (
            <button
              type="button"
              className="v2-titlebar-btn v2-btn v2-btn-ghost"
              onClick={onPauseRecord}
              title="Pause capture"
            >
              <Pause size={14} aria-hidden />
              Pause
            </button>
          )}
          <button
            type="button"
            className="v2-titlebar-btn v2-btn"
            onClick={onStopRecord}
            title="Arrêter et appliquer la capture"
          >
            <Square size={14} aria-hidden />
            Arrêter
          </button>
        </>
      )}
      <button
        type="button"
        className="v2-titlebar-btn v2-btn v2-btn-primary"
        disabled={locked || busy}
        onClick={onPlay}
        title="Tester la macro"
      >
        <Play size={14} aria-hidden />
        Tester
      </button>
      {locked ? (
        <span className="v2-clicker-lock" title="Macro verrouillée">
          Verrouillé
        </span>
      ) : null}
    </div>
  );
}
