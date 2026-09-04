import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, SlidersHorizontal } from "lucide-react";
import { DisplayPopover, Tooltip } from "../ui/v2";
import type { AutomationFilter, DisplayOptions } from "./types";
import { filterPillTooltip, sortByLabel } from "./rowLabels";

type Props = {
  query: string;
  onQueryChange: (q: string) => void;
  filter: AutomationFilter;
  onFilterChange: (f: AutomationFilter) => void;
  display: DisplayOptions;
  onDisplayChange: (d: DisplayOptions) => void;
  onCreateMacro: () => void;
  onCreateClicker: () => void;
};

const FILTER_PILLS: { value: AutomationFilter; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "favorites", label: "Favoris" },
  { value: "recent", label: "Dernières exécutions" },
];

export function AutomationsToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  display,
  onDisplayChange,
  onCreateMacro,
  onCreateClicker,
}: Props) {
  const [displayOpen, setDisplayOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const displayBtnRef = useRef<HTMLButtonElement>(null);
  const createWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!createOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!createWrapRef.current?.contains(e.target as Node)) {
        setCreateOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [createOpen]);

  return (
    <div className="v2-automations-chrome">
      <div className="v2-automations-filter-bar">
        <div className="v2-filter-pills" role="group" aria-label="Filtre">
          {FILTER_PILLS.map(({ value, label }) => (
            <Tooltip key={value} content={filterPillTooltip(value)}>
              <button
                type="button"
                className={["v2-filter-pill", filter === value ? "active" : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onFilterChange(value)}
              >
                {label}
              </button>
            </Tooltip>
          ))}
        </div>
        <div className="v2-automations-filter-bar-end">
          <Tooltip content="Rechercher par nom">
            <input
              type="search"
              placeholder="Filtrer…"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="v2-search-inline v2-automations-filter-search"
              aria-label="Filtrer les automations"
            />
          </Tooltip>
          <Tooltip content={`Trier par : ${sortByLabel(display.sortBy)}`}>
            <button
              ref={displayBtnRef}
              type="button"
              className="v2-btn v2-btn-ghost v2-automations-display-btn"
              onClick={() => setDisplayOpen((o) => !o)}
              aria-label={`Trier par : ${sortByLabel(display.sortBy)}`}
            >
              <SlidersHorizontal size={14} aria-hidden />
            </button>
          </Tooltip>
          <DisplayPopover
            open={displayOpen}
            onClose={() => setDisplayOpen(false)}
            anchorRef={displayBtnRef}
          >
            <label className="v2-field">
              <span>Trier par</span>
              <select
                value={display.sortBy}
                onChange={(e) =>
                  onDisplayChange({
                    ...display,
                    sortBy: e.target.value as DisplayOptions["sortBy"],
                  })
                }
              >
                <option value="name">Nom</option>
                <option value="type">Type</option>
                <option value="status">Statut</option>
              </select>
            </label>
          </DisplayPopover>
          <div className="v2-toolbar-menu" ref={createWrapRef}>
            <Tooltip content="Créer une automation">
              <button
                type="button"
                className="v2-btn v2-btn-primary v2-automations-create-btn"
                onClick={() => setCreateOpen((o) => !o)}
                aria-expanded={createOpen}
              >
                <Plus size={14} aria-hidden />
                Créer
                <ChevronDown size={14} aria-hidden />
              </button>
            </Tooltip>
            {createOpen ? (
              <div className="v2-menu-popover">
                <button
                  type="button"
                  className="v2-btn v2-btn-ghost"
                  onClick={() => {
                    setCreateOpen(false);
                    onCreateMacro();
                  }}
                >
                  Macro vierge
                </button>
                <button
                  type="button"
                  className="v2-btn v2-btn-ghost"
                  onClick={() => {
                    setCreateOpen(false);
                    onCreateClicker();
                  }}
                >
                  Preset clicker
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
