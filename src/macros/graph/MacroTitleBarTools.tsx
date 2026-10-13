import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Circle,
  Copy,
  Download,
  Globe,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pause,
  Play,
  Redo2,
  Square,
  Terminal,
  Undo2,
  Upload,
} from "lucide-react";
import { useT } from "../../i18n";
import {
  ContextMenu,
  DropdownMenu,
  EditorToolbar,
  Tooltip,
  findMenuItem,
  useContextMenuState,
} from "../../ui/shell";
import type { DropdownEntry, MenuItemDef } from "../../ui/shell";
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
  /** Nom — toolbar start. */
  meta?: ReactNode;
  /** Répét. / raccourci — same group as Processus. */
  metaTools?: ReactNode;
  allowNetwork?: boolean;
  allowProcess?: boolean;
  onPermissionsChange?: (next: {
    allowNetwork?: boolean;
    allowProcess?: boolean;
  }) => void;
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
  metaTools,
  allowNetwork = false,
  allowProcess = false,
  onPermissionsChange,
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
  const toolbarCtx = useContextMenuState();
  const running = engineState === "running" || engineState === "paused";
  const busy = running || recording || loading;
  const mutateDisabled = locked || loading || busy;

  const moreItems: DropdownEntry[] = useMemo(
    () => [
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
      ...(onPermissionsChange
        ? ([
            { id: "sep-perms", label: "", separator: true },
            {
              id: "perm-header",
              label: t("macros.permissions.label"),
              groupHeader: true,
            },
            {
              id: "perm-network",
              label: t("scripts.permissions.network"),
              icon: allowNetwork ? <Check size={14} /> : <Globe size={14} />,
              disabled: mutateDisabled,
              onSelect: () =>
                onPermissionsChange({ allowNetwork: !allowNetwork }),
            },
            {
              id: "perm-process",
              label: t("scripts.permissions.process"),
              icon: allowProcess ? <Check size={14} /> : <Terminal size={14} />,
              disabled: mutateDisabled,
              onSelect: () =>
                onPermissionsChange({ allowProcess: !allowProcess }),
            },
          ] satisfies DropdownEntry[])
        : []),
    ],
    [
      onLockChange,
      locked,
      t,
      loading,
      mutateDisabled,
      onDuplicate,
      onImport,
      busy,
      onExport,
      onPermissionsChange,
      allowNetwork,
      allowProcess,
    ],
  );

  const contextItems: MenuItemDef[] = useMemo(
    () => [
      ...(moreItems as MenuItemDef[]),
      { id: "sep-ctx-run", label: "", separator: true },
      {
        id: "test",
        label: t("macros.toolbar.test"),
        icon: <Play size={14} />,
        disabled: busy,
        onSelect: onPlay,
      },
      {
        id: "back",
        label: t("macros.toolbar.back"),
        icon: <ArrowLeft size={14} />,
        onSelect: onBack,
      },
    ],
    [moreItems, t, busy, onPlay, onBack],
  );

  return (
    <>
      <EditorToolbar
        onContextMenu={toolbarCtx.openFromEvent}
        start={
          <>
            <Tooltip content={t("macros.toolbar.back")}>
              <button
                type="button"
                className="caster-titlebar-btn caster-titlebar-icon-btn"
                onClick={onBack}
                aria-label={t("macros.toolbar.back")}
              >
                <ArrowLeft size={14} aria-hidden />
              </button>
            </Tooltip>
            {meta}
          </>
        }
        end={
          <>
            <div className="caster-toolbar-group">
              {metaTools}
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
            </div>
            <span className="caster-toolbar-sep" aria-hidden />
            <div className="caster-toolbar-group">
              <Tooltip content={t("macros.toolbar.undoTitle")}>
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn"
                  disabled={locked || busy || !canUndo || !onUndo}
                  onClick={onUndo}
                  aria-label={t("macros.toolbar.undo")}
                >
                  <Undo2 size={14} aria-hidden />
                </button>
              </Tooltip>
              <Tooltip content={t("macros.toolbar.redoTitle")}>
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn"
                  disabled={locked || busy || !canRedo || !onRedo}
                  onClick={onRedo}
                  aria-label={t("macros.toolbar.redo")}
                >
                  <Redo2 size={14} aria-hidden />
                </button>
              </Tooltip>
            </div>
            <span className="caster-toolbar-sep" aria-hidden />
            <div className="caster-toolbar-group">
              {recording ? (
                <span className="caster-titlebar-record-status" role="status">
                  {recordPaused
                    ? t("macros.toolbar.recordStatusPaused", {
                        count: recordCount,
                      })
                    : t("macros.toolbar.recordStatus", { count: recordCount })}
                </span>
              ) : null}
              {!recording ? (
                <Tooltip content={t("macros.toolbar.captureTitle")}>
                  <button
                    type="button"
                    className="caster-titlebar-btn caster-titlebar-icon-btn"
                    disabled={locked || busy}
                    onClick={onStartRecord}
                    aria-label={t("macros.toolbar.capture")}
                  >
                    <Circle size={14} aria-hidden />
                  </button>
                </Tooltip>
              ) : (
                <>
                  {recordPaused ? (
                    <Tooltip content={t("macros.toolbar.resumeCaptureTitle")}>
                      <button
                        type="button"
                        className="caster-titlebar-btn caster-titlebar-icon-btn"
                        onClick={onResumeRecord}
                        aria-label={t("macros.toolbar.resumeCapture")}
                      >
                        <Play size={14} aria-hidden />
                      </button>
                    </Tooltip>
                  ) : (
                    <Tooltip content={t("macros.toolbar.pauseCaptureTitle")}>
                      <button
                        type="button"
                        className="caster-titlebar-btn caster-titlebar-icon-btn"
                        onClick={onPauseRecord}
                        aria-label={t("macros.toolbar.pauseCapture")}
                      >
                        <Pause size={14} aria-hidden />
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip content={t("macros.toolbar.stopCaptureTitle")}>
                    <button
                      type="button"
                      className="caster-titlebar-btn caster-titlebar-icon-btn"
                      onClick={onStopRecord}
                      aria-label={t("macros.toolbar.stopCapture")}
                    >
                      <Square size={14} aria-hidden />
                    </button>
                  </Tooltip>
                </>
              )}
              <div className="caster-titlebar-test-split is-split">
                <Tooltip content={t("macros.toolbar.testTitle")}>
                  <button
                    type="button"
                    className="caster-titlebar-btn caster-titlebar-icon-btn caster-titlebar-test-split-main"
                    disabled={busy}
                    onClick={onPlay}
                    aria-label={t("macros.toolbar.test")}
                  >
                    <Play size={14} aria-hidden />
                  </button>
                </Tooltip>
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
                <Tooltip content={t("macros.toolbar.stopTitle")}>
                  <button
                    type="button"
                    className="caster-titlebar-btn caster-titlebar-icon-btn caster-titlebar-icon-btn-danger"
                    disabled={!running || loading}
                    onClick={onStop}
                    aria-label={t("macros.toolbar.stop")}
                  >
                    <Square size={14} aria-hidden />
                  </button>
                </Tooltip>
              ) : null}
            </div>
            <span className="caster-toolbar-sep" aria-hidden />
            <div className="caster-toolbar-group">
              <DropdownMenu
                label={t("macros.toolbar.moreActions")}
                ariaLabel={t("macros.toolbar.moreActions")}
                align="end"
                disabled={loading}
                triggerClassName={[
                  "caster-titlebar-btn",
                  "caster-titlebar-icon-btn",
                  locked ? "caster-clicker-lock" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                items={moreItems}
              >
                <MoreHorizontal size={16} aria-hidden />
              </DropdownMenu>
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
