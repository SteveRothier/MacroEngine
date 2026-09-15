import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { EmptyState } from "../ui/shell";
import { useT } from "../i18n";

type Filter = "all" | "macro" | "clicker" | "system";

type Props = {
  lines: string[];
  onClear: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RunJournalDock({ lines, onClear, open, onOpenChange }: Props) {
  const t = useT();
  const [filter, setFilter] = useState<Filter>("all");

  if (!open) return null;

  const filterLabels: Record<Filter, string> = {
    all: t("runs.filterAll"),
    macro: t("runs.filterMacros"),
    clicker: t("runs.filterClicker"),
    system: t("runs.filterSystem"),
  };

  const filtered = lines.filter((l) => {
    if (filter === "all") return true;
    if (filter === "macro") return /macro/i.test(l);
    if (filter === "clicker") return /clicker/i.test(l);
    return !/macro|clicker/i.test(l);
  });

  return (
    <div className="caster-journal-overlay" role="region" aria-label={t("runs.aria")}>
      <div className="caster-journal-head">
        <span className="caster-journal-title">{t("runs.title")}</span>
        <div className="caster-journal-filters">
          {(["all", "macro", "clicker", "system"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={["caster-btn caster-btn-ghost", filter === f ? "active" : ""].join(" ")}
              style={{ fontSize: 11, padding: "2px 8px" }}
              onClick={() => setFilter(f)}
            >
              {filterLabels[f]}
            </button>
          ))}
          <button
            type="button"
            className="caster-btn caster-btn-ghost"
            title={t("runs.clear")}
            onClick={onClear}
          >
            <Trash2 size={12} />
          </button>
          <button
            type="button"
            className="caster-btn caster-btn-ghost"
            title={t("runs.close")}
            onClick={() => onOpenChange(false)}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="caster-journal-body">
        {filtered.length === 0 ? (
          <EmptyState title={t("runs.emptyTitle")} lead={t("runs.emptyLead")} />
        ) : (
          filtered.map((line, i) => (
            <div
              key={`${i}-${line.slice(0, 20)}`}
              className={[
                "caster-journal-line",
                /macro/i.test(line) ? "caster-journal-line--macro" : "",
                /clicker/i.test(line) ? "caster-journal-line--clicker" : "",
                /fail|error/i.test(line) ? "caster-journal-line--error" : "",
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
