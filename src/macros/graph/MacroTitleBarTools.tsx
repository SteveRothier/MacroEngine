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
  onBack?: () => void;
  locked: boolean;
  onLockChange?: (locked: boolean) => void;
  onDuplicate?: () => void;
  onImport?: () => void;
  onExport?: () => void;
  loading?: boolean;
  dirty?: boolean;
  engineState: string;
  recording: boolean;
  recordPaused: boolean;
  recordCount: number;
  onPlay: () => void;
  /** When set, shows a secondary play-from-selection control. */
  onPlayFrom?: () => void;
  onPause?: () => void;
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
  dirty = false,
  engineState,
  recording,
  recordPaused,
  recordCount,
  onPlay,
  onPlayFrom,
  onPause,
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
            {
              id: "record-status",
              label: recordPaused
                ? t("macros.toolbar.recordStatusPaused", {
                    count: recordCount,
                  })
                : t("macros.toolbar.recordStatus", { count: recordCount }),
              groupHeader: true,
            },
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
          ] satisfies DropdownEntry[])
        : ([
            {
              id: "capture",
              label: t("macros.toolbar.capture"),
              icon: <Circle size={14} />,
              disabled: locked || busy,
              onSelect: onStartRecord,
            },
          ] satisfies DropdownEntry[])),
      { id: "sep-capture", label: "", separator: true },
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
      ...(onOpenProcessSettings
        ? ([
            { id: "sep-process", label: "", separator: true },
            {
              id: "process-filter",
              label: t("scripts.permissions.process"),
              icon: <Terminal size={14} />,
              onSelect: () => onOpenProcessSettings(),
            },
          ] satisfies DropdownEntry[])
        : []),
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
      t,
      locked,
      busy,
      canUndo,
      onUndo,
      canRedo,
      onRedo,
      recording,
      recordPaused,
      recordCount,
      onResumeRecord,
      onPauseRecord,
      onStopRecord,
      onStartRecord,
      onLockChange,
      loading,
      mutateDisabled,
      onDuplicate,
      onImport,
      onExport,
      onOpenProcessSettings,
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
    [moreItems, t, busy, onPlay, onBack],
  );

  return (
    <>
      <EditorToolbar
        onContextMenu={toolbarCtx.openFromEvent}
        start={
          <>
            {onBack ? (
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
            ) : null}
            {meta}
            {dirty ? (
              <span className="caster-dirty-pill">{t("shell.dirty")}</span>
            ) : null}
          </>
        }
        end={
          <>
            <div className="caster-toolbar-group">
              {!running ? (
                <div className="caster-titlebar-run-group">
                  <button
                    type="button"
                    className="caster-titlebar-btn caster-btn-run"
                    disabled={busy}
                    onClick={onPlay}
                  >
                    <Play size={14} aria-hidden />
                    <span>{t("shell.exec.run")}</span>
                  </button>
                  {onPlayFrom ? (
                    <DropdownMenu
                      label={t("macros.toolbar.playFrom")}
                      ariaLabel={t("macros.toolbar.playFromTitle")}
                      align="end"
                      disabled={busy}
                      triggerClassName="caster-titlebar-btn caster-titlebar-icon-btn caster-btn-run-chevron"
                      items={[
                        {
                          id: "play-from",
                          label: t("macros.toolbar.playFrom"),
                          shortcut: t("macros.toolbar.playFromShortcut"),
                          icon: <Play size={14} />,
                          onSelect: onPlayFrom,
                        },
                      ]}
                    >
                      <ChevronDown size={12} aria-hidden />
                    </DropdownMenu>
                  ) : null}
                </div>
              ) : null}
              {running && engineState === "paused" && onResume ? (
                <button
                  type="button"
                  className="caster-titlebar-btn caster-btn-run"
                  disabled={loading}
                  onClick={onResume}
                >
                  <Play size={14} aria-hidden />
                  <span>{t("shell.exec.resume")}</span>
                </button>
              ) : null}
              {running && engineState !== "paused" && onPause ? (
                <button
                  type="button"
                  className="caster-titlebar-btn caster-btn-ghost"
                  disabled={loading}
                  onClick={onPause}
                >
                  <Pause size={14} aria-hidden />
                  <span>{t("shell.exec.pause")}</span>
                </button>
              ) : null}
              {onStop ? (
                <button
                  type="button"
                  className="caster-titlebar-btn caster-btn-ghost"
                  disabled={!running || loading}
                  onClick={onStop}
                >
                  <Square size={14} aria-hidden />
                  <span>{t("shell.exec.stop")}</span>
                </button>
              ) : null}
              <span
                className={[
                  "caster-run-status-pill",
                  running ? "is-running" : "",
                  engineState === "paused" ? "is-paused" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="status"
              >
                <span className="caster-run-status-dot" aria-hidden />
                {engineState === "paused"
                  ? t("shell.exec.paused")
                  : running
                    ? t("shell.exec.running")
                    : t("shell.exec.ready")}
              </span>
            </div>
            <div className="caster-toolbar-group caster-toolbar-group--tools">
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
