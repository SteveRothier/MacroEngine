import type { ReactNode } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Circle,
  Copy,
  Download,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pause,
  Play,
  Redo2,
  Square,
  Undo2,
  Upload,
} from "lucide-react";
import { useT } from "../../i18n";
import { DropdownMenu, EditorToolbar } from "../../ui/shell";
import type { DropdownEntry } from "../../ui/shell";
import {
  ProcessFilterTool,
  type ProcessFilter,
  type ProcessFilterScopeMode,
} from "../../process";

type Props = {
  onBack: () => void;
  locked: boolean;
  onLockChange?: (locked: boolean) => void;
  onDuplicate?: () => void;
  onImport?: () => void;
  onExport?: () => void;
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
  processFilter: ProcessFilter;
  processFilterMode: ProcessFilterScopeMode;
  onProcessFilterModeChange: (mode: ProcessFilterScopeMode) => void;
  localProcessFilter: ProcessFilter;
  onLocalProcessFilterChange: (filter: ProcessFilter) => void;
  onOpenProcessSettings?: () => void;
  onGlobalProcessFilterChange?: (filter: ProcessFilter) => void;
  processFilterPresets?: import("../../process").ProcessFilterPreset[];
  onProcessFilterPresetsChange?: (
    presets: import("../../process").ProcessFilterPreset[],
  ) => void;
};

export function MacroTitleBarTools({
  onBack,
  locked,
  onLockChange,
  onDuplicate,
  onImport,
  onExport,
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
  processFilter,
  processFilterMode,
  onProcessFilterModeChange,
  localProcessFilter,
  onLocalProcessFilterChange,
  onOpenProcessSettings,
  onGlobalProcessFilterChange,
  processFilterPresets,
  onProcessFilterPresetsChange,
}: Props) {
  const t = useT();
  const running = engineState === "running" || engineState === "paused";
  const busy = running || recording || loading;
  const mutateDisabled = locked || loading || busy;

  const moreItems: DropdownEntry[] = [
    ...(onLockChange
      ? ([
          {
            id: "lock-toggle",
            label: locked
              ? t("macros.toolbar.unlockTitle")
              : t("macros.toolbar.lockTitle"),
            icon: locked ? <LockOpen size={14} /> : <Lock size={14} />,
            disabled: loading,
            onSelect: () => onLockChange(!locked),
          },
          { id: "sep-lock", label: "", separator: true },
        ] satisfies DropdownEntry[])
      : []),
    {
      id: "duplicate",
      label: t("macros.menu.ctx.duplicate"),
      icon: <Copy size={14} />,
      disabled: mutateDisabled || !onDuplicate,
      onSelect: () => onDuplicate?.(),
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
  ];

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
          <ProcessFilterTool
            filter={processFilter}
            mode={processFilterMode}
            onModeChange={onProcessFilterModeChange}
            localFilter={localProcessFilter}
            onLocalFilterChange={onLocalProcessFilterChange}
            disabled={locked}
            onOpenSettings={onOpenProcessSettings}
            onGlobalFilterChange={onGlobalProcessFilterChange}
            presets={processFilterPresets}
            onPresetsChange={onProcessFilterPresetsChange}
          />
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
              className="caster-titlebar-btn caster-titlebar-icon-btn"
              disabled={locked || busy}
              onClick={onStartRecord}
              title={t("macros.toolbar.captureTitle")}
              aria-label={t("macros.toolbar.capture")}
            >
              <Circle size={14} aria-hidden />
            </button>
          ) : (
            <>
              {recordPaused ? (
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn"
                  onClick={onResumeRecord}
                  title={t("macros.toolbar.resumeCaptureTitle")}
                  aria-label={t("macros.toolbar.resumeCapture")}
                >
                  <Play size={14} aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn"
                  onClick={onPauseRecord}
                  title={t("macros.toolbar.pauseCaptureTitle")}
                  aria-label={t("macros.toolbar.pauseCapture")}
                >
                  <Pause size={14} aria-hidden />
                </button>
              )}
              <button
                type="button"
                className="caster-titlebar-btn caster-titlebar-icon-btn"
                onClick={onStopRecord}
                title={t("macros.toolbar.stopCaptureTitle")}
                aria-label={t("macros.toolbar.stopCapture")}
              >
                <Square size={14} aria-hidden />
              </button>
            </>
          )}
          <div className="caster-titlebar-test-split is-split">
            <button
              type="button"
              className="caster-titlebar-btn caster-titlebar-icon-btn caster-titlebar-test-split-main"
              disabled={busy}
              onClick={onPlay}
              title={t("macros.toolbar.testTitle")}
              aria-label={t("macros.toolbar.test")}
            >
              <Play size={14} aria-hidden />
            </button>
            <DropdownMenu
              label={t("macros.toolbar.playFrom")}
              ariaLabel={t("macros.toolbar.playFromTitle")}
              align="end"
              disabled={busy || !onPlayFrom}
              triggerClassName="caster-titlebar-btn caster-titlebar-icon-btn caster-titlebar-test-split-chevron"
              items={
                onPlayFrom
                  ? [
                      {
                        id: "play-from",
                        label: t("macros.toolbar.playFrom"),
                        shortcut: t("macros.toolbar.playFromShortcut"),
                        icon: <Play size={14} />,
                        onSelect: onPlayFrom,
                      },
                    ]
                  : []
              }
            >
              <ChevronDown size={12} aria-hidden />
            </DropdownMenu>
          </div>
          {onStop ? (
            <button
              type="button"
              className="caster-titlebar-btn caster-titlebar-icon-btn caster-titlebar-icon-btn-danger"
              disabled={!running || loading}
              onClick={onStop}
              title={t("macros.toolbar.stopTitle")}
              aria-label={t("macros.toolbar.stop")}
            >
              <Square size={14} aria-hidden />
            </button>
          ) : null}
          <DropdownMenu
            label={t("macros.toolbar.moreActions")}
            ariaLabel={t("macros.toolbar.moreActions")}
            align="end"
            disabled={loading}
            triggerClassName="caster-titlebar-btn caster-titlebar-icon-btn"
            items={moreItems}
          >
            <MoreHorizontal size={16} aria-hidden />
          </DropdownMenu>
        </>
      }
    />
  );
}
