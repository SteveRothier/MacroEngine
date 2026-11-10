import { useMemo } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Circle,
  ClipboardPaste,
  Copy,
  Download,
  Lock,
  TestTube2,
  LockOpen,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  Square,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { useT } from "../../i18n";
import {
  ActionPickerMenu,
  ContextMenu,
  EditorToolbar,
  Tooltip,
  findMenuItem,
  useContextMenuState,
} from "../../ui/shell";
import type { ActionPickerEntry, MenuItemDef } from "../../ui/shell";

type Props = {
  onBack?: () => void;
  locked: boolean;
  onLockChange?: (locked: boolean) => void;
  onImport?: () => void;
  onExport?: () => void;
  loading?: boolean;
  engineState: string;
  recording: boolean;
  recordPaused: boolean;
  recordCount: number;
  onPlay: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onStartRecord: () => void;
  onPauseRecord: () => void;
  onResumeRecord: () => void;
  onStopRecord: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canCopySteps?: boolean;
  canPasteSteps?: boolean;
  canCutSteps?: boolean;
  canDeleteSteps?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onCopySteps?: () => void;
  onPasteSteps?: () => void;
  onCutSteps?: () => void;
  onDeleteSteps?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  addMenuItems?: ActionPickerEntry[];
  dryRun?: boolean;
  onDryRunChange?: (dryRun: boolean) => void;
};

export function MacroTitleBarTools({
  onBack,
  locked,
  onLockChange,
  onImport,
  onExport,
  loading = false,
  engineState,
  recording,
  recordPaused,
  recordCount: _recordCount,
  onPlay,
  onResume,
  onStop,
  onStartRecord,
  onPauseRecord,
  onResumeRecord,
  onStopRecord,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  canCopySteps = false,
  canPasteSteps = false,
  canCutSteps = false,
  canDeleteSteps = false,
  canMoveUp = false,
  canMoveDown = false,
  onCopySteps,
  onPasteSteps,
  onCutSteps,
  onDeleteSteps,
  onMoveUp,
  onMoveDown,
  addMenuItems,
  dryRun = false,
  onDryRunChange,
}: Props) {
  const t = useT();
  const toolbarCtx = useContextMenuState();
  const running = engineState === "running" || engineState === "paused";
  const busy = running || recording || loading;
  const mutateDisabled = locked || loading || busy;
  const isResume = running && engineState === "paused" && Boolean(onResume);
  const isStop = running && !isResume;
  const runLabel = !running
    ? t("shell.exec.run")
    : isResume
      ? t("shell.exec.resume")
      : t("shell.exec.stop");

  const contextItems: MenuItemDef[] = useMemo(
    () => [
      {
        id: "undo",
        label: t("macros.toolbar.undo"),
        icon: <Undo2 size={14} />,
        disabled: locked || busy || !canUndo || !onUndo,
        onSelect: () => onUndo?.(),
      },
      {
        id: "redo",
        label: t("macros.toolbar.redo"),
        icon: <Redo2 size={14} />,
        disabled: locked || busy || !canRedo || !onRedo,
        onSelect: () => onRedo?.(),
      },
      { id: "sep-history", label: "", separator: true },
      ...(recording
        ? ([
            recordPaused
              ? {
                  id: "resume-capture",
                  label: t("macros.toolbar.resumeCapture"),
                  icon: <Play size={14} />,
                  onSelect: onResumeRecord,
                }
              : {
                  id: "pause-capture",
                  label: t("macros.toolbar.pauseCapture"),
                  icon: <Pause size={14} />,
                  onSelect: onPauseRecord,
                },
            {
              id: "stop-capture",
              label: t("macros.toolbar.stopCapture"),
              icon: <Square size={14} />,
              onSelect: onStopRecord,
            },
          ] satisfies MenuItemDef[])
        : ([
            {
              id: "capture",
              label: t("macros.toolbar.capture"),
              icon: <Circle size={14} />,
              disabled: locked || busy,
              onSelect: onStartRecord,
            },
          ] satisfies MenuItemDef[])),
      { id: "sep-ctx-run", label: "", separator: true },
      {
        id: "test",
        label: t("macros.toolbar.test"),
        icon: <Play size={14} />,
        disabled: busy,
        onSelect: onPlay,
      },
      { id: "sep-io", label: "", separator: true },
      {
        id: "import",
        label: t("macros.menu.more.import"),
        icon: <Upload size={14} />,
        disabled: mutateDisabled || !onImport,
        onSelect: () => onImport?.(),
      },
      {
        id: "export",
        label: t("macros.menu.more.export"),
        icon: <Download size={14} />,
        disabled: loading || busy || !onExport,
        onSelect: () => onExport?.(),
      },
      ...(onBack
        ? [
            {
              id: "back",
              label: t("macros.toolbar.back"),
              icon: <ArrowLeft size={14} />,
              onSelect: onBack,
            },
          ]
        : []),
    ],
    [
      t,
      locked,
      busy,
      loading,
      mutateDisabled,
      canUndo,
      onUndo,
      canRedo,
      onRedo,
      recording,
      recordPaused,
      onResumeRecord,
      onPauseRecord,
      onStopRecord,
      onStartRecord,
      onPlay,
      onImport,
      onExport,
      onBack,
    ],
  );

  return (
    <>
      <EditorToolbar
        className="caster-editor-toolbar--macro"
        onContextMenu={toolbarCtx.openFromEvent}
        start={
          <>
            {onBack ? (
              <Tooltip side="bottom" content={t("macros.toolbar.back")}>
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn"
                  onClick={onBack}
                  aria-label={t("macros.toolbar.back")}
                >
                  <ArrowLeft size={14} aria-hidden />
                </button>
              </Tooltip>
            ) : null}
            <div className="caster-toolbar-group">
              <Tooltip side="bottom" content={t("macros.toolbar.undoTitle")}>
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn"
                  disabled={locked || busy || !canUndo || !onUndo}
                  aria-label={t("macros.toolbar.undo")}
                  onClick={() => onUndo?.()}
                >
                  <Undo2 size={14} aria-hidden />
                </button>
              </Tooltip>
              <Tooltip side="bottom" content={t("macros.toolbar.redoTitle")}>
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn"
                  disabled={locked || busy || !canRedo || !onRedo}
                  aria-label={t("macros.toolbar.redo")}
                  onClick={() => onRedo?.()}
                >
                  <Redo2 size={14} aria-hidden />
                </button>
              </Tooltip>
            </div>
            {addMenuItems ? (
              <div className="caster-toolbar-group">
                <Tooltip side="bottom" content={t("macros.toolbar.addTitle")}>
                  <ActionPickerMenu
                    label={t("macros.toolbar.addTitle")}
                    disabled={mutateDisabled}
                    items={addMenuItems}
                    nativeTitle={false}
                    triggerClassName="caster-titlebar-btn caster-titlebar-icon-btn"
                    triggerContent={<Plus size={14} aria-hidden />}
                  />
                </Tooltip>
              </div>
            ) : null}
            <div className="caster-toolbar-group">
              <Tooltip side="bottom" content={t("macros.toolbar.cutStepsTitle")}>
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn"
                  disabled={locked || busy || !canCutSteps || !onCutSteps}
                  aria-label={t("macros.toolbar.cutSteps")}
                  onClick={() => onCutSteps?.()}
                >
                  <Scissors size={14} aria-hidden />
                </button>
              </Tooltip>
              <Tooltip side="bottom" content={t("macros.toolbar.copyStepsTitle")}>
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn"
                  disabled={locked || busy || !canCopySteps || !onCopySteps}
                  aria-label={t("macros.toolbar.copySteps")}
                  onClick={() => onCopySteps?.()}
                >
                  <Copy size={14} aria-hidden />
                </button>
              </Tooltip>
              <Tooltip side="bottom" content={t("macros.toolbar.pasteStepsTitle")}>
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn"
                  disabled={
                    locked || busy || !canPasteSteps || !onPasteSteps
                  }
                  aria-label={t("macros.toolbar.pasteSteps")}
                  onClick={() => onPasteSteps?.()}
                >
                  <ClipboardPaste size={14} aria-hidden />
                </button>
              </Tooltip>
              <Tooltip side="bottom" content={t("macros.toolbar.deleteStepsTitle")}>
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn caster-titlebar-icon-btn-danger"
                  disabled={
                    locked || busy || !canDeleteSteps || !onDeleteSteps
                  }
                  aria-label={t("macros.toolbar.deleteSteps")}
                  onClick={() => onDeleteSteps?.()}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </Tooltip>
            </div>
            <div className="caster-toolbar-group">
              <Tooltip side="bottom" content={t("macros.toolbar.moveUpTitle")}>
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn"
                  disabled={locked || busy || !canMoveUp || !onMoveUp}
                  aria-label={t("macros.menu.ctx.moveUp")}
                  onClick={() => onMoveUp?.()}
                >
                  <ArrowUp size={14} aria-hidden />
                </button>
              </Tooltip>
              <Tooltip side="bottom" content={t("macros.toolbar.moveDownTitle")}>
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn"
                  disabled={locked || busy || !canMoveDown || !onMoveDown}
                  aria-label={t("macros.menu.ctx.moveDown")}
                  onClick={() => onMoveDown?.()}
                >
                  <ArrowDown size={14} aria-hidden />
                </button>
              </Tooltip>
            </div>
            <div className="caster-toolbar-group">
              {recording ? (
                <>
                  {recordPaused ? (
                    <Tooltip side="bottom" content={t("macros.toolbar.resumeCaptureTitle")}>
                      <button
                        type="button"
                        className="caster-titlebar-btn caster-titlebar-icon-btn is-recording"
                        aria-label={t("macros.toolbar.resumeCapture")}
                        onClick={onResumeRecord}
                      >
                        <Play size={14} aria-hidden />
                      </button>
                    </Tooltip>
                  ) : (
                    <Tooltip side="bottom" content={t("macros.toolbar.pauseCaptureTitle")}>
                      <button
                        type="button"
                        className="caster-titlebar-btn caster-titlebar-icon-btn is-recording"
                        aria-label={t("macros.toolbar.pauseCapture")}
                        onClick={onPauseRecord}
                      >
                        <Pause size={14} aria-hidden />
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip side="bottom" content={t("macros.toolbar.stopCaptureTitle")}>
                    <button
                      type="button"
                      className="caster-titlebar-btn caster-titlebar-icon-btn is-recording"
                      aria-label={t("macros.toolbar.stopCapture")}
                      onClick={onStopRecord}
                    >
                      <Square size={14} aria-hidden />
                    </button>
                  </Tooltip>
                </>
              ) : (
                <Tooltip side="bottom" content={t("macros.toolbar.captureTitle")}>
                  <button
                    type="button"
                    className="caster-titlebar-btn caster-titlebar-icon-btn"
                    disabled={locked || busy}
                    aria-label={t("macros.toolbar.capture")}
                    onClick={onStartRecord}
                  >
                    <Circle size={14} aria-hidden />
                  </button>
                </Tooltip>
              )}
            </div>
          </>
        }
        end={
          <>
            <div className="caster-toolbar-group">
              <Tooltip side="bottom" content={t("macros.menu.more.import")}>
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn"
                  disabled={mutateDisabled || !onImport}
                  aria-label={t("macros.menu.more.import")}
                  onClick={() => onImport?.()}
                >
                  <Upload size={14} aria-hidden />
                </button>
              </Tooltip>
              <Tooltip side="bottom" content={t("macros.menu.more.export")}>
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn"
                  disabled={loading || busy || !onExport}
                  aria-label={t("macros.menu.more.export")}
                  onClick={() => onExport?.()}
                >
                  <Download size={14} aria-hidden />
                </button>
              </Tooltip>
              <Tooltip
                side="bottom"
                content={
                  locked
                    ? t("macros.toolbar.unlockTitle")
                    : t("macros.toolbar.lockTitle")
                }
              >
                <button
                  type="button"
                  className={[
                    "caster-titlebar-btn",
                    "caster-titlebar-icon-btn",
                    locked ? "is-active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={loading || !onLockChange}
                  aria-label={
                    locked
                      ? t("macros.toolbar.unlockTitle")
                      : t("macros.toolbar.lockTitle")
                  }
                  aria-pressed={locked}
                  onClick={() => onLockChange?.(!locked)}
                >
                  {locked ? (
                    <Lock size={14} aria-hidden />
                  ) : (
                    <LockOpen size={14} aria-hidden />
                  )}
                </button>
              </Tooltip>
            </div>
            <Tooltip side="bottom" content={t("macros.toolbar.dryRunTitle")}>
              <button
                type="button"
                className={[
                  "caster-toolbar-dry-run",
                  dryRun ? "is-on" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={busy || !onDryRunChange}
                aria-label={t("macros.toolbar.dryRun")}
                aria-pressed={dryRun}
                onClick={() => onDryRunChange?.(!dryRun)}
              >
                <TestTube2 size={14} aria-hidden />
                <span className="caster-toolbar-dry-run-label">
                  {t("macros.toolbar.dryRun")}
                </span>
              </button>
            </Tooltip>
            <div
              className={[
                "caster-titlebar-run-group",
                "is-solo",
                running ? "is-running" : "",
                isStop ? "is-stop" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                className="caster-titlebar-btn caster-btn-run caster-btn-run--solo"
                disabled={
                  !running
                    ? recording || loading
                    : loading || (isStop && !onStop)
                }
                aria-label={runLabel}
                onClick={() => {
                  if (!running) {
                    onPlay();
                    return;
                  }
                  if (isResume) {
                    onResume?.();
                    return;
                  }
                  onStop?.();
                }}
              >
                <span className="caster-btn-run-face">
                  <span className="caster-btn-run-icon">
                    {isStop ? (
                      <Square size={14} aria-hidden />
                    ) : (
                      <Play size={14} aria-hidden />
                    )}
                  </span>
                  <span className="caster-btn-run-label">{runLabel}</span>
                </span>
              </button>
            </div>
          </>
        }
      />
      <ContextMenu
        open={toolbarCtx.open}
        x={toolbarCtx.x}
        y={toolbarCtx.y}
        items={contextItems}
        onClose={toolbarCtx.close}
        onSelect={(id) => findMenuItem(contextItems, id)?.onSelect?.()}
        ariaLabel={t("macros.toolbar.moreActions")}
      />
    </>
  );
}
