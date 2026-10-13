import { useMemo } from "react";
import {
  ArrowLeft,
  Lock,
  LockOpen,
  MoreHorizontal,
  Play,
  Square,
} from "lucide-react";
import { useT, type TFunction } from "../i18n";
import {
  DEFAULT_PROCESS_FILTER,
  ProcessFilterTool,
  type ProcessFilter,
  type ProcessFilterPreset,
  type ProcessFilterScopeMode,
} from "../process";
import {
  ContextMenu,
  DropdownMenu,
  EditorToolbar,
  Select,
  Tooltip,
  findMenuItem,
  useContextMenuState,
} from "../ui/shell";
import type { DropdownEntry, MenuItemDef } from "../ui/shell";
import {
  ScriptPermissionsMenu,
  type ScriptPermissions,
} from "./ScriptPermissionsMenu";
import type { ScriptLanguage } from "./types";

export type EngineBusyKind = "macro" | "clicker" | "record" | "script";

type Props = {
  onBack: () => void;
  name: string;
  onNameChange: (name: string) => void;
  language: ScriptLanguage;
  onLanguageChange: (language: ScriptLanguage) => void;
  isModule: boolean;
  onIsModuleChange: (isModule: boolean) => void;
  permissions: ScriptPermissions;
  onPermissionsChange: (partial: Partial<ScriptPermissions>) => void;
  locked?: boolean;
  onLockChange?: (locked: boolean) => void;
  loading?: boolean;
  dryRun?: boolean;
  onDryRunChange?: (dryRun: boolean) => void;
  stepMode?: boolean;
  onStepModeChange?: (stepMode: boolean) => void;
  stepPausedMethod?: string | null;
  onStepContinue?: () => void;
  onConvertToMacro?: () => void;
  running: boolean;
  engineBusy: EngineBusyKind | null;
  lintBlocked?: boolean;
  lintBlockReason?: string | null;
  onRun: () => void;
  onStop: () => void;
  saveStatus: "idle" | "saving" | "saved" | "error";
  onRetrySave?: () => void;
  processFilter?: ProcessFilter;
  processFilterMode?: ProcessFilterScopeMode;
  onProcessFilterModeChange?: (mode: ProcessFilterScopeMode) => void;
  localProcessFilter?: ProcessFilter;
  onLocalProcessFilterChange?: (filter: ProcessFilter) => void;
  onGlobalProcessFilterChange?: (filter: ProcessFilter) => void;
  onOpenProcessSettings?: () => void;
  processFilterPresets?: ProcessFilterPreset[];
  onProcessFilterPresetsChange?: (presets: ProcessFilterPreset[]) => void;
};

function busyTooltip(kind: EngineBusyKind, t: TFunction): string {
  const label =
    kind === "clicker"
      ? t("scripts.toolbar.busyClicker")
      : kind === "record"
        ? t("scripts.toolbar.busyRecord")
        : kind === "script"
          ? t("scripts.toolbar.busyScript")
          : t("scripts.toolbar.busyMacro");
  return t("scripts.toolbar.busyTip", { label });
}

export function ScriptTitleBarTools({
  onBack,
  name,
  onNameChange,
  language,
  onLanguageChange,
  isModule,
  onIsModuleChange,
  permissions,
  onPermissionsChange,
  locked = false,
  onLockChange,
  loading = false,
  dryRun = false,
  onDryRunChange,
  stepMode = false,
  onStepModeChange,
  stepPausedMethod = null,
  onStepContinue,
  onConvertToMacro,
  running,
  engineBusy,
  lintBlocked = false,
  lintBlockReason = null,
  onRun,
  onStop,
  saveStatus,
  onRetrySave,
  processFilter = DEFAULT_PROCESS_FILTER,
  processFilterMode = "inherit",
  onProcessFilterModeChange,
  localProcessFilter = DEFAULT_PROCESS_FILTER,
  onLocalProcessFilterChange,
  onGlobalProcessFilterChange,
  onOpenProcessSettings,
  processFilterPresets,
  onProcessFilterPresetsChange,
}: Props) {
  const t = useT();
  const toolbarCtx = useContextMenuState();
  const editDisabled = locked || loading;
  const statusLabel =
    saveStatus === "saving"
      ? t("scripts.toolbar.saving")
      : saveStatus === "saved"
        ? t("scripts.toolbar.saved")
        : saveStatus === "error"
          ? t("scripts.toolbar.saveError")
          : null;

  const runBlocked =
    loading ||
    isModule ||
    lintBlocked ||
    (!running && engineBusy != null && engineBusy !== "script");

  const langOptions = [
    {
      value: "javascript",
      label: t("scripts.language.javascript"),
    },
    {
      value: "typescript",
      label: t("scripts.language.typescript"),
    },
  ];

  const moreItems: DropdownEntry[] = useMemo(
    () => [
      ...(onLockChange
        ? ([
            {
              id: "lock-toggle",
              label: locked
                ? t("scripts.toolbar.unlockTitle")
                : t("scripts.toolbar.lockTitle"),
              icon: locked ? <LockOpen size={14} /> : <Lock size={14} />,
              disabled: loading,
              onSelect: () => onLockChange(!locked),
            },
            { id: "sep-lock", label: "", separator: true },
          ] satisfies DropdownEntry[])
        : []),
      {
        id: "module",
        label: isModule
          ? t("scripts.toolbar.optionsModuleOn")
          : t("scripts.toolbar.optionsModuleOff"),
        description: t("scripts.module.tip"),
        disabled: editDisabled,
        onSelect: () => onIsModuleChange(!isModule),
      },
      {
        id: "dry-run",
        label: dryRun
          ? t("scripts.toolbar.optionsDryRunOn")
          : t("scripts.toolbar.optionsDryRunOff"),
        description: t("scripts.toolbar.dryRunTip"),
        disabled: running || !onDryRunChange,
        onSelect: () => onDryRunChange?.(!dryRun),
      },
      {
        id: "step-mode",
        label: stepMode
          ? t("scripts.toolbar.optionsStepOn")
          : t("scripts.toolbar.optionsStepOff"),
        description: t("scripts.toolbar.stepTip"),
        disabled: running || !onStepModeChange,
        onSelect: () => onStepModeChange?.(!stepMode),
      },
    ],
    [
      onLockChange,
      locked,
      t,
      loading,
      isModule,
      editDisabled,
      onIsModuleChange,
      dryRun,
      running,
      onDryRunChange,
      stepMode,
      onStepModeChange,
    ],
  );

  const contextItems: MenuItemDef[] = useMemo(
    () => [
      ...(moreItems as MenuItemDef[]),
      ...(onConvertToMacro
        ? ([
            { id: "sep-ctx-convert", label: "", separator: true },
            {
              id: "convert-macro",
              label: t("scripts.toolbar.convertToMacro"),
              disabled: editDisabled || running,
              onSelect: onConvertToMacro,
            },
          ] satisfies MenuItemDef[])
        : []),
      { id: "sep-ctx-run", label: "", separator: true },
      {
        id: "run",
        label: running
          ? t("scripts.toolbar.stop")
          : t("scripts.toolbar.run"),
        icon: running ? <Square size={14} /> : <Play size={14} />,
        disabled: running ? false : runBlocked,
        onSelect: running ? onStop : onRun,
      },
      {
        id: "back",
        label: t("scripts.toolbar.back"),
        icon: <ArrowLeft size={14} />,
        onSelect: onBack,
      },
    ],
    [
      moreItems,
      onConvertToMacro,
      t,
      editDisabled,
      running,
      runBlocked,
      onStop,
      onRun,
      onBack,
    ],
  );

  return (
    <>
      <EditorToolbar
        className="caster-script-toolbar"
        onContextMenu={toolbarCtx.openFromEvent}
        start={
          <>
            <Tooltip content={t("scripts.toolbar.back")}>
              <button
                type="button"
                className="caster-titlebar-btn caster-titlebar-icon-btn"
                onClick={onBack}
                aria-label={t("scripts.toolbar.back")}
              >
                <ArrowLeft size={14} aria-hidden />
              </button>
            </Tooltip>
            <input
              className="caster-titlebar-name-input caster-titlebar-name-input--wide"
              value={name}
              disabled={editDisabled}
              placeholder={t("scripts.toolbar.namePlaceholder")}
              aria-label={t("scripts.toolbar.nameAria")}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            {onConvertToMacro ? (
              <Tooltip content={t("scripts.toolbar.convertToMacroTitle")}>
                <button
                  type="button"
                  className="caster-titlebar-btn caster-btn caster-btn-ghost"
                  disabled={editDisabled || running}
                  onClick={onConvertToMacro}
                  aria-label={t("scripts.toolbar.convertToMacroTitle")}
                >
                  {t("scripts.toolbar.convertToMacro")}
                </button>
              </Tooltip>
            ) : null}
            <ScriptPermissionsMenu
              value={permissions}
              onChange={onPermissionsChange}
              disabled={editDisabled}
            />
            <Select
              className="caster-select caster-script-toolbar-lang"
              value={language}
              disabled={editDisabled}
              ariaLabel={t("scripts.language.label")}
              options={langOptions}
              onChange={(v) =>
                onLanguageChange(
                  v === "typescript" ? "typescript" : "javascript",
                )
              }
            />
            <DropdownMenu
              label={t("scripts.toolbar.options")}
              ariaLabel={t("scripts.toolbar.optionsAria")}
              align="start"
              disabled={running && editDisabled}
              triggerClassName={[
                "caster-titlebar-btn",
                "caster-btn",
                "caster-btn-ghost",
                locked ? "caster-clicker-lock" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              items={moreItems}
            >
              <MoreHorizontal size={14} aria-hidden />
            </DropdownMenu>
            {dryRun ? (
              <Tooltip content={t("scripts.toolbar.dryRunTip")}>
                <span className="caster-script-perm-chip" tabIndex={0}>
                  {t("scripts.toolbar.dryRunBadge")}
                </span>
              </Tooltip>
            ) : null}
            {stepPausedMethod ? (
              <button
                type="button"
                className="caster-btn caster-btn-primary caster-script-run-btn"
                onClick={() => onStepContinue?.()}
                aria-label={t("scripts.toolbar.stepContinue")}
              >
                {t("scripts.toolbar.stepPaused", { method: stepPausedMethod })}{" "}
                · {t("scripts.toolbar.stepContinue")}
              </button>
            ) : null}
            {statusLabel && saveStatus === "error" ? (
              <Tooltip content={t("scripts.toolbar.saveErrorTip")}>
                <button
                  type="button"
                  className="caster-script-save-status is-error"
                  onClick={() => onRetrySave?.()}
                >
                  {statusLabel}
                </button>
              </Tooltip>
            ) : statusLabel && saveStatus === "saving" ? (
              <span
                className="caster-script-save-status is-saving"
                role="status"
              >
                {statusLabel}
              </span>
            ) : null}
          </>
        }
        end={
          <>
            {onProcessFilterModeChange && onLocalProcessFilterChange ? (
              <>
                <div className="caster-toolbar-group">
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
              </>
            ) : null}
            <div className="caster-toolbar-group">
              {running ? (
                <Tooltip content={t("scripts.toolbar.stopTip")}>
                  <button
                    type="button"
                    className="caster-btn caster-script-run-btn is-stop"
                    onClick={onStop}
                    aria-pressed={true}
                    aria-label={t("scripts.toolbar.stop")}
                  >
                    <Square size={14} aria-hidden />
                    {t("scripts.toolbar.stop")}
                  </button>
                </Tooltip>
              ) : (
                <Tooltip
                  content={
                    isModule
                      ? t("scripts.toolbar.runModuleBlocked")
                      : lintBlocked && lintBlockReason
                        ? lintBlockReason
                        : runBlocked && engineBusy
                          ? busyTooltip(engineBusy, t)
                          : t("scripts.toolbar.runTip")
                  }
                >
                  <button
                    type="button"
                    className="caster-btn caster-btn-primary caster-script-run-btn"
                    onClick={onRun}
                    disabled={runBlocked}
                    aria-pressed={false}
                    aria-label={t("scripts.toolbar.run")}
                  >
                    <Play size={14} aria-hidden />
                    {t("scripts.toolbar.run")}
                  </button>
                </Tooltip>
              )}
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
        ariaLabel={t("scripts.toolbar.optionsAria")}
      />
    </>
  );
}
