import { ArrowLeft, Play, Square } from "lucide-react";
import { EditorToolbar, Tooltip } from "../ui/v2";
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

function busyTooltip(kind: EngineBusyKind): string {
  const label =
    kind === "clicker"
      ? "un clicker"
      : kind === "record"
        ? "un enregistrement"
        : kind === "script"
          ? "un autre script"
          : "une macro";
  return `Impossible de lancer le script : ${label} est déjà en cours. Arrêtez (F8) avant de continuer.`;
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
  const statusLabel =
    saveStatus === "saving"
      ? "● Enregistrement…"
      : saveStatus === "saved"
        ? "● Enregistré"
        : saveStatus === "error"
          ? "● Erreur d’enregistrement"
          : null;

  const runBlocked = !running && engineBusy != null && engineBusy !== "script";

  return (
    <EditorToolbar
      className="v2-script-toolbar"
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
          <input
            className="v2-titlebar-name-input v2-titlebar-name-input--wide"
            value={name}
            placeholder="Nom du script"
            aria-label="Nom du script"
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
              <Tooltip content="Échec de l’enregistrement. Nouvelle tentative en cours…">
                <button
                  type="button"
                  className="v2-script-save-status is-error"
                  onClick={() => onRetrySave?.()}
                >
                  {statusLabel}
                </button>
              </Tooltip>
            ) : (
              <span
                className={[
                  "v2-script-save-status",
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
            <span className="v2-script-save-status is-placeholder" aria-hidden>
              ● Enregistré
            </span>
          )}
        </>
      }
      end={
        running ? (
          <Tooltip content="Arrêter (F8)">
            <button
              type="button"
              className="v2-btn v2-script-run-btn is-stop"
              onClick={onStop}
              aria-pressed={true}
              aria-label="Arrêter (F8)"
            >
              <Square size={14} aria-hidden />
              Arrêter (F8)
            </button>
          </Tooltip>
        ) : (
          <Tooltip
            content={
              runBlocked && engineBusy
                ? busyTooltip(engineBusy)
                : "Exécuter le script"
            }
          >
            <button
              type="button"
              className="v2-btn v2-btn-primary v2-script-run-btn"
              onClick={onRun}
              disabled={runBlocked}
              aria-pressed={false}
              aria-label="Exécuter"
            >
              <Play size={14} aria-hidden />
              Exécuter
            </button>
          </Tooltip>
        )
      }
    />
  );
}
