import { useMemo, useState } from "react";
import { StatusPill } from "../ui/v2";

export type RunEntry = {
  id: string;
  at: number;
  name: string;
  kind: "macro" | "clicker";
  status: "success" | "failed" | "cancelled";
  durationMs?: number;
  lines: string[];
};

type Props = {
  entries: RunEntry[];
  liveLines?: string[];
  onSelect?: (id: string) => void;
};

function statusLabelFr(s: RunEntry["status"]): string {
  if (s === "success") return "Réussi";
  if (s === "failed") return "Échoué";
  return "Annulé";
}

function kindLabelFr(k: RunEntry["kind"]): string {
  return k === "macro" ? "Macro" : "Clicker";
}

export function RunsView({ entries, liveLines = [], onSelect }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.id ?? null);
  const [filter, setFilter] = useState<"all" | "macro" | "clicker">("all");

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => e.kind === filter);
  }, [entries, filter]);

  const selected = filtered.find((e) => e.id === selectedId) ?? filtered[0];
  const liveTail = liveLines.slice(-12);

  return (
    <div className="v2-page">
      <div className="v2-runs-filters">
        <div className="v2-runs-filters-inner">
          {(["all", "macro", "clicker"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={["v2-btn", filter === f ? "v2-btn-primary" : ""].join(" ")}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "Tout" : f === "macro" ? "Macros" : "Clicker"}
            </button>
          ))}
        </div>
      </div>
      <div className="v2-page-body">
        <div className="v2-runs-split">
          <div className="v2-runs-list">
            {filtered.length === 0 ? (
              <div className="v2-empty-state">
                <strong>Aucune exécution</strong>
                <p>Les runs sont dérivés du journal d’exécution.</p>
              </div>
            ) : (
              filtered.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={["v2-runs-item", selected?.id === e.id ? "active" : ""].join(
                    " ",
                  )}
                  onClick={() => {
                    setSelectedId(e.id);
                    onSelect?.(e.id);
                  }}
                >
                  <div className="v2-runs-item-head">
                    <strong>{e.name}</strong>
                    <StatusPill
                      kind={
                        e.status === "success"
                          ? "healthy"
                          : e.status === "failed"
                            ? "failed"
                            : "paused"
                      }
                      label={statusLabelFr(e.status)}
                    />
                  </div>
                  <div className="v2-runs-item-meta">
                    {new Date(e.at).toLocaleString("fr-FR")} · {kindLabelFr(e.kind)}
                    {e.durationMs != null ? ` · ${e.durationMs} ms` : ""}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="v2-settings-pane">
            {selected ? (
              <>
                <h2 className="v2-runs-detail-title">{selected.name}</h2>
                <pre className="v2-runs-detail-pre">
                  {selected.lines.join("\n") || "Pas de détail"}
                </pre>
              </>
            ) : (
              <p className="v2-empty-state">Sélectionne une exécution</p>
            )}
            {liveTail.length > 0 ? (
              <div className="v2-runs-live">
                <h3>Flux en direct</h3>
                <pre className="v2-runs-detail-pre">{liveTail.join("\n")}</pre>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Heuristic: group journal lines into run-like entries for the Runs view. */
export function parseRunLogLines(lines: string[]): RunEntry[] {
  const entries: RunEntry[] = [];
  let current: RunEntry | null = null;
  let idx = 0;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const startMatch =
      /(?:launch|start|démarr|macro|clicker|preset)\s*[:\-]?\s*(.+)/i.exec(line) ||
      /(?:▶|→)\s*(.+)/.exec(line);

    if (startMatch && (lower.includes("launch") || lower.includes("start") || lower.includes("démarr"))) {
      if (current) entries.push(current);
      const name = startMatch[1]?.trim() || "Session";
      const kind: "macro" | "clicker" = lower.includes("clicker") ? "clicker" : "macro";
      current = {
        id: `run-${idx++}-${Date.now()}`,
        at: Date.now(),
        name,
        kind,
        status: "success",
        lines: [line],
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
      if (lower.includes("fail") || lower.includes("error") || lower.includes("échec")) {
        current.status = "failed";
      } else if (lower.includes("cancel") || lower.includes("arrêt") || lower.includes("annul")) {
        current.status = "cancelled";
      }
    }
  }
  if (current) entries.push(current);

  if (entries.length === 0 && lines.length > 0) {
    entries.push({
      id: "run-journal",
      at: Date.now(),
      name: "Journal",
      kind: "macro",
      status: "success",
      lines: lines.slice(-40),
    });
  }

  return entries.reverse();
}
