import type { ProcessFilter } from "../clickerTypes";

type Props = {
  filter: ProcessFilter;
  onOpenSettings?: () => void;
};

function filterSummary(filter: ProcessFilter): string {
  if (!filter.enabled) return "Tous les processus";
  const names = filter.names.filter((n) => n.trim().length > 0);
  if (names.length === 0) {
    return filter.mode === "allow" ? "Aucun processus autorisé" : "Tous autorisés";
  }
  const list = names.slice(0, 3).join(", ");
  const extra = names.length > 3 ? ` +${names.length - 3}` : "";
  return filter.mode === "allow"
    ? `Autoriser : ${list}${extra}`
    : `Bloquer : ${list}${extra}`;
}

export function ClickerProcessFilterRow({ filter, onOpenSettings }: Props) {
  return (
    <div className="v2-clicker-process-row">
      <span className="v2-clicker-process-label">Processus</span>
      <span
        className={[
          "v2-clicker-process-badge",
          filter.enabled ? "v2-clicker-process-badge--active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        title={filterSummary(filter)}
      >
        {filterSummary(filter)}
      </span>
      {onOpenSettings ? (
        <button
          type="button"
          className="v2-btn v2-btn-ghost v2-clicker-process-link"
          onClick={onOpenSettings}
        >
          Paramètres
        </button>
      ) : null}
    </div>
  );
}
