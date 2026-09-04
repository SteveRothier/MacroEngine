import { useState } from "react";
import { Trash2, X } from "lucide-react";

type Filter = "all" | "macro" | "clicker" | "system";

const FILTER_LABELS: Record<Filter, string> = {
  all: "Tout",
  macro: "Macros",
  clicker: "Clicker",
  system: "Système",
};

type Props = {
  lines: string[];
  onClear: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RunJournalDock({ lines, onClear, open, onOpenChange }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  if (!open) return null;

  const filtered = lines.filter((l) => {
    if (filter === "all") return true;
    if (filter === "macro") return /macro/i.test(l);
    if (filter === "clicker") return /clicker/i.test(l);
    return !/macro|clicker/i.test(l);
  });

  return (
    <div className="v2-journal-overlay" role="region" aria-label="Journal">
      <div className="v2-journal-head">
        <span className="v2-journal-title">Journal</span>
        <div className="v2-journal-filters">
          {(["all", "macro", "clicker", "system"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={["v2-btn v2-btn-ghost", filter === f ? "active" : ""].join(" ")}
              style={{ fontSize: 11, padding: "2px 8px" }}
              onClick={() => setFilter(f)}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
          <button
            type="button"
            className="v2-btn v2-btn-ghost"
            title="Vider"
            onClick={onClear}
          >
            <Trash2 size={12} />
          </button>
          <button
            type="button"
            className="v2-btn v2-btn-ghost"
            title="Fermer"
            onClick={() => onOpenChange(false)}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="v2-journal-body">
        {filtered.length === 0 ? (
          <p className="v2-journal-empty">Aucune entrée</p>
        ) : (
          filtered.map((line, i) => (
            <div
              key={`${i}-${line.slice(0, 20)}`}
              className={[
                "v2-journal-line",
                /macro/i.test(line) ? "v2-journal-line--macro" : "",
                /clicker/i.test(line) ? "v2-journal-line--clicker" : "",
                /fail|error/i.test(line) ? "v2-journal-line--error" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
