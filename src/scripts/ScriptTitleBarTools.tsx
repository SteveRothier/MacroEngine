import { ArrowLeft, Play, Square } from "lucide-react";
import { useT, type TFunction } from "../i18n";
import { EditorToolbar, Tooltip } from "../ui/shell";
import {
  ScriptPermissionsMenu,
  type ScriptPermissions,
} from "./ScriptPermissionsMenu";

export type EngineBusyKind = "macro" | "clicker" | "record" | "script";

type Props = {
  onBack: () => void;
  name: string;
  onNameChange: (name: string) => void;
  permissions: ScriptPermissions;
  onPermissionsChange: (partial: Partial<ScriptPermissions>) => void;
  running: boolean;
  engineBusy: EngineBusyKind | null;
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
  permissions,
  onPermissionsChange,
  running,
  engineBusy,
  onRun,
  onStop,
  saveStatus,
  onRetrySave,
}: Props) {
  const t = useT();
  const statusLabel =
    saveStatus === "saving"
      ? t("scripts.toolbar.saving")
      : saveStatus === "saved"
        ? t("scripts.toolbar.saved")
        : saveStatus === "error"
          ? t("scripts.toolbar.saveError")
          : null;

  const runBlocked = !running && engineBusy != null && engineBusy !== "script";

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
            placeholder={t("scripts.toolbar.namePlaceholder")}
            aria-label={t("scripts.toolbar.nameAria")}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <ScriptPermissionsMenu
            value={permissions}
            onChange={onPermissionsChange}
          />
          {statusLabel ? (
            saveStatus === "error" ? (
              <Tooltip content={t("scripts.toolbar.saveErrorTip")}>
                <button
                  type="button"
                  className="caster-script-save-status is-error"
                  onClick={() => onRetrySave?.()}
                >
                  {statusLabel}
                </button>
              </Tooltip>
            ) : (
              <span
                className={[
                  "caster-script-save-status",
                  saveStatus === "saving" ? "is-saving" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="status"
              >
                {statusLabel}
              </span>
            )
          ) : (
            <span className="caster-script-save-status is-placeholder" aria-hidden>
              {t("scripts.toolbar.saved")}
            </span>
          )}
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
              runBlocked && engineBusy
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
