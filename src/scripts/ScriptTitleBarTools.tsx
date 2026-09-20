import { ArrowLeft, MoreHorizontal, Play, Square } from "lucide-react";
import { useT, type TFunction } from "../i18n";
import { DropdownMenu, EditorToolbar, Select, Tooltip } from "../ui/shell";
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
}: Props) {
  const t = useT();
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

  return (
    <EditorToolbar
      className="caster-script-toolbar"
      start={
        <>
          <button
            type="button"
            className="caster-titlebar-btn caster-btn caster-btn-ghost"
            onClick={onBack}
            title={t("scripts.toolbar.back")}
          >
            <ArrowLeft size={14} aria-hidden />
          </button>
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
          {locked ? (
            <span
              className="caster-clicker-lock"
              title={t("scripts.toolbar.lockedTitle")}
            >
              {t("scripts.toolbar.locked")}
            </span>
          ) : null}
          {onConvertToMacro ? (
            <button
              type="button"
              className="caster-titlebar-btn caster-btn caster-btn-ghost"
              disabled={editDisabled || running}
              onClick={onConvertToMacro}
              title={t("scripts.toolbar.convertToMacroTitle")}
            >
              {t("scripts.toolbar.convertToMacro")}
            </button>
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
              onLanguageChange(v === "typescript" ? "typescript" : "javascript")
            }
          />
          <DropdownMenu
            label={t("scripts.toolbar.options")}
            ariaLabel={t("scripts.toolbar.optionsAria")}
            align="start"
            disabled={editDisabled && running}
            triggerClassName="caster-titlebar-btn caster-btn caster-btn-ghost"
            items={[
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
            ]}
          >
            <MoreHorizontal size={14} aria-hidden />
          </DropdownMenu>
          {dryRun ? (
            <span
              className="caster-script-perm-chip"
              title={t("scripts.toolbar.dryRunTip")}
            >
              {t("scripts.toolbar.dryRunBadge")}
            </span>
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
        running ? (
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
        )
      }
    />
  );
}
