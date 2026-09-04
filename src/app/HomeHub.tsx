import type { EngineStatus } from "../macros/types";
import { sessionLabelFr } from "../ui/labels";

type Props = {
  status: EngineStatus;
  presetLabel: string | null;
  onOpenClicker: () => void;
  onOpenLibrary: () => void;
};

export function HomeHub({
  status,
  presetLabel,
  onOpenClicker,
  onOpenLibrary,
}: Props) {
  const active =
    status.state === "running" ||
    status.state === "paused" ||
    status.state === "stopping";
  const session = sessionLabelFr(status);
  const statusTitle = active ? "Moteur actif" : "Moteur inactif";
  const statusSub = active
    ? session
      ? `Session ${session}`
      : "Session en cours"
    : "Aucune session en cours";

  return (
    <div className="v2-hub">
      <div className="v2-hub-inner">
        <div className="v2-hub-status">
          <div className="v2-hub-dot-row">
            <span
              className={["v2-hub-dot", active ? "v2-hub-dot--on" : ""]
                .filter(Boolean)
                .join(" ")}
              aria-hidden
            />
            <span className="v2-hub-status-title">{statusTitle}</span>
          </div>
          <p className="v2-hub-status-sub">{statusSub}</p>
        </div>

        <div className="v2-hub-cta">
          <button
            type="button"
            className="v2-btn v2-btn-primary v2-hub-cta-primary"
            onClick={onOpenClicker}
          >
            Ouvrir Clicker
          </button>
          <button
            type="button"
            className="v2-btn v2-btn-ghost v2-hub-cta-secondary"
            onClick={onOpenLibrary}
          >
            Bibliothèque
          </button>
        </div>

        <div className="v2-hub-summary">
          <span className="v2-hub-summary-item">
            {presetLabel ? `Preset : ${presetLabel}` : "Aucun preset récent"}
          </span>
          <span className="v2-hub-summary-divider" aria-hidden />
          <span className="v2-hub-summary-item">F6 pour démarrer / arrêter</span>
        </div>
      </div>
    </div>
  );
}
