import type { ReactNode } from "react";
import { ArrowLeft, Circle, Pause, Play, Redo2, Square, Undo2 } from "lucide-react";
import { useT } from "../../i18n";
import { EditorToolbar } from "../../ui/shell";

type Props = {
  onBack: () => void;
  locked: boolean;
  loading?: boolean;
  engineState: string;
  recording: boolean;
  recordPaused: boolean;
  recordCount: number;
  onPlay: () => void;
  /** When set, shows a secondary play-from-selection control. */
  onPlayFrom?: () => void;
  onStop?: () => void;
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
  loading = false,
  engineState,
  recording,
  recordPaused,
  recordCount,
  onPlay,
  onPlayFrom,
  onStop,
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
  const t = useT();
  const running = engineState === "running" || engineState === "paused";
  const busy = running || recording || loading;

  return (
    <EditorToolbar
      start={
        <>
          <button
            type="button"
            className="caster-titlebar-btn caster-btn caster-btn-ghost"
            onClick={onBack}
            title={t("macros.toolbar.back")}
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
            className="caster-titlebar-btn caster-titlebar-icon-btn"
            disabled={locked || busy || !canUndo || !onUndo}
            onClick={onUndo}
            title={t("macros.toolbar.undoTitle")}
            aria-label={t("macros.toolbar.undo")}
          >
            <Undo2 size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="caster-titlebar-btn caster-titlebar-icon-btn"
            disabled={locked || busy || !canRedo || !onRedo}
            onClick={onRedo}
            title={t("macros.toolbar.redoTitle")}
            aria-label={t("macros.toolbar.redo")}
          >
            <Redo2 size={14} aria-hidden />
          </button>
          {recording ? (
            <span className="caster-titlebar-record-status" role="status">
              {recordPaused
                ? t("macros.toolbar.recordStatusPaused", { count: recordCount })
                : t("macros.toolbar.recordStatus", { count: recordCount })}
            </span>
          ) : null}
          {!recording ? (
            <button
              type="button"
              className="caster-titlebar-btn caster-btn caster-btn-ghost"
              disabled={locked || busy}
              onClick={onStartRecord}
              title={t("macros.toolbar.captureTitle")}
            >
              <Circle size={14} aria-hidden />
              {t("macros.toolbar.capture")}
            </button>
          ) : (
            <>
              {recordPaused ? (
                <button
                  type="button"
                  className="caster-titlebar-btn caster-btn caster-btn-ghost"
                  onClick={onResumeRecord}
                  title={t("macros.toolbar.resumeCaptureTitle")}
                >
                  <Play size={14} aria-hidden />
                  {t("macros.toolbar.resumeCapture")}
                </button>
              ) : (
                <button
                  type="button"
                  className="caster-titlebar-btn caster-btn caster-btn-ghost"
                  onClick={onPauseRecord}
                  title={t("macros.toolbar.pauseCaptureTitle")}
                >
                  <Pause size={14} aria-hidden />
                  {t("macros.toolbar.pauseCapture")}
                </button>
              )}
              <button
                type="button"
                className="caster-titlebar-btn caster-btn"
                onClick={onStopRecord}
                title={t("macros.toolbar.stopCaptureTitle")}
              >
                <Square size={14} aria-hidden />
                {t("macros.toolbar.stopCapture")}
              </button>
            </>
          )}
          {onPlayFrom ? (
            <button
              type="button"
              className="caster-titlebar-btn caster-btn caster-btn-ghost"
              disabled={locked || busy}
              onClick={onPlayFrom}
              title={t("macros.toolbar.playFromTitle")}
            >
              <Play size={14} aria-hidden />
              {t("macros.toolbar.playFrom")}
            </button>
          ) : null}
          <button
            type="button"
            className="caster-titlebar-btn caster-btn caster-btn-primary"
            disabled={locked || busy}
            onClick={onPlay}
            title={t("macros.toolbar.testTitle")}
          >
            <Play size={14} aria-hidden />
            {t("macros.toolbar.test")}
          </button>
          {onStop ? (
            <button
              type="button"
              className="caster-titlebar-btn caster-btn caster-btn-danger-ghost"
              disabled={!running || loading}
              onClick={onStop}
              title={t("macros.toolbar.stopTitle")}
            >
              <Square size={14} aria-hidden />
              {t("macros.toolbar.stop")}
            </button>
          ) : null}
          {locked ? (
            <span className="caster-clicker-lock" title={t("macros.toolbar.lockedTitle")}>
              {t("macros.toolbar.locked")}
            </span>
          ) : null}
        </>
      }
    />
  );
}
