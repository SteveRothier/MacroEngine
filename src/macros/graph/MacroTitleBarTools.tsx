import type { ReactNode } from "react";
import { ArrowLeft, Circle, Pause, Play, Redo2, Square, Undo2 } from "lucide-react";
import { EditorToolbar } from "../../ui/v2";

type Props = {
  onBack: () => void;
  locked: boolean;
  engineState: string;
  recording: boolean;
  recordPaused: boolean;
  recordCount: number;
  onPlay: () => void;
  /** When set, shows a secondary play-from-selection control. */
  onPlayFrom?: () => void;
  onStartRecord: () => void;
  onPauseRecord: () => void;
  onResumeRecord: () => void;
  onStopRecord: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
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
  onPlayFrom,
  onStartRecord,
  onPauseRecord,
  onResumeRecord,
  onStopRecord,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  meta,
}: Props) {
  const running = engineState === "running" || engineState === "paused";
  const busy = running || recording;

  return (
    <EditorToolbar
      start={
        <>
          <button
            type="button"
            className="v2-titlebar-btn v2-btn v2-btn-ghost"
            onClick={onBack}
            title="Retour aux automations"
          >
            <ArrowLeft size={14} aria-hidden />
          </button>
          {meta}
        </>
      }
      end={
        <>
          <button
            type="button"
            className="v2-titlebar-btn v2-titlebar-icon-btn"
            disabled={locked || busy || !canUndo || !onUndo}
            onClick={onUndo}
            title="Retour en arrière (Ctrl+Z)"
            aria-label="Retour en arrière"
          >
            <Undo2 size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="v2-titlebar-btn v2-titlebar-icon-btn"
            disabled={locked || busy || !canRedo || !onRedo}
            onClick={onRedo}
            title="Retour en avant (Ctrl+Y)"
            aria-label="Retour en avant"
          >
            <Redo2 size={14} aria-hidden />
          </button>
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
          {onPlayFrom ? (
            <button
              type="button"
              className="v2-titlebar-btn v2-btn v2-btn-ghost"
              disabled={locked || busy}
              onClick={onPlayFrom}
              title="Tester depuis l’étape sélectionnée"
            >
              <Play size={14} aria-hidden />
              Depuis ici
            </button>
          ) : null}
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
        </>
      }
    />
  );
}
