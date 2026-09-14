import type { ReactNode } from "react";
import { ArrowLeft, Circle, Pause, Play, Redo2, Square, Undo2 } from "lucide-react";
import { useT } from "../../i18n";
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
  const t = useT();
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
            className="v2-titlebar-btn v2-titlebar-icon-btn"
            disabled={locked || busy || !canUndo || !onUndo}
            onClick={onUndo}
            title={t("macros.toolbar.undoTitle")}
            aria-label={t("macros.toolbar.undo")}
          >
            <Undo2 size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="v2-titlebar-btn v2-titlebar-icon-btn"
            disabled={locked || busy || !canRedo || !onRedo}
            onClick={onRedo}
            title={t("macros.toolbar.redoTitle")}
            aria-label={t("macros.toolbar.redo")}
          >
            <Redo2 size={14} aria-hidden />
          </button>
          {recording ? (
            <span className="v2-titlebar-record-status" role="status">
              {recordPaused
                ? t("macros.toolbar.recordStatusPaused", { count: recordCount })
                : t("macros.toolbar.recordStatus", { count: recordCount })}
            </span>
          ) : null}
          {!recording ? (
            <button
              type="button"
              className="v2-titlebar-btn v2-btn v2-btn-ghost"
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
                  className="v2-titlebar-btn v2-btn v2-btn-ghost"
                  onClick={onResumeRecord}
                  title={t("macros.toolbar.resumeCaptureTitle")}
                >
                  <Play size={14} aria-hidden />
                  {t("macros.toolbar.resumeCapture")}
                </button>
              ) : (
                <button
                  type="button"
                  className="v2-titlebar-btn v2-btn v2-btn-ghost"
                  onClick={onPauseRecord}
                  title={t("macros.toolbar.pauseCaptureTitle")}
                >
                  <Pause size={14} aria-hidden />
                  {t("macros.toolbar.pauseCapture")}
                </button>
              )}
              <button
                type="button"
                className="v2-titlebar-btn v2-btn"
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
              className="v2-titlebar-btn v2-btn v2-btn-ghost"
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
            className="v2-titlebar-btn v2-btn v2-btn-primary"
            disabled={locked || busy}
            onClick={onPlay}
            title={t("macros.toolbar.testTitle")}
          >
            <Play size={14} aria-hidden />
            {t("macros.toolbar.test")}
          </button>
          {locked ? (
            <span className="v2-clicker-lock" title={t("macros.toolbar.lockedTitle")}>
              {t("macros.toolbar.locked")}
            </span>
          ) : null}
        </>
      }
    />
  );
}
