import { useRef, type RefObject } from "react";
import {
  ChevronDown,
  Clock,
  Code2,
  History,
  MousePointer2,
  Plus,
  Search,
  Star,
  Workflow,
} from "lucide-react";
import { DropdownMenu, Select, Tooltip } from "../ui/v2";
import type {
  AutomationFilter,
  AutomationFolderOption,
  FilterCounts,
} from "./types";
import { folderOptionKey } from "./types";
import { filterPillTooltip } from "./rowLabels";

type Props = {
  query: string;
  onQueryChange: (q: string) => void;
  filter: AutomationFilter;
  onFilterChange: (f: AutomationFilter) => void;
  folderKey: string | null;
  onFolderKeyChange: (key: string | null) => void;
  folders: AutomationFolderOption[];
  counts: FilterCounts;
  onCreateMacro: () => void;
  onCreateClicker: () => void;
  onCreateScript: () => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
};

const FILTER_PILLS: {
  value: AutomationFilter;
  label: string;
  icon: typeof Clock;
  countKey: keyof FilterCounts;
}[] = [
  { value: "all", label: "Tous", icon: Clock, countKey: "all" },
  { value: "favorites", label: "Favoris", icon: Star, countKey: "favorites" },
  {
    value: "recent",
    label: "Dernières exécutions",
    icon: History,
    countKey: "recent",
  },
  { value: "scripts", label: "Scripts", icon: Code2, countKey: "scripts" },
];

export function AutomationsToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  folderKey,
  onFolderKeyChange,
  folders,
  counts,
  onCreateMacro,
  onCreateClicker,
  onCreateScript,
  searchInputRef,
  createOpen,
  onCreateOpenChange,
}: Props) {
  const localSearchRef = useRef<HTMLInputElement>(null);
  const searchRef = searchInputRef ?? localSearchRef;

  const folderOptions = [
    { value: "", label: "Tous les dossiers" },
    ...folders.map((f) => ({
      value: folderOptionKey(f),
      label:
        folders.filter((o) => o.name === f.name).length > 1
          ? `${f.name} (${f.kind === "macro" ? "macro" : "clicker"})`
          : f.name,
    })),
  ];

  return (
    <div className="v2-automations-chrome">
      <div className="v2-automations-filter-bar">
        <div className="v2-filter-pills" role="group" aria-label="Filtre">
          {FILTER_PILLS.map(({ value, label, icon: Icon, countKey }) => (
            <Tooltip key={value} content={filterPillTooltip(value)}>
              <button
                type="button"
                className={["v2-filter-pill", filter === value ? "active" : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onFilterChange(value)}
              >
                <Icon size={13} aria-hidden />
                {label}
                <span className="v2-filter-pill-count">{counts[countKey]}</span>
              </button>
            </Tooltip>
          ))}
        </div>
        <div className="v2-automations-filter-bar-end">
          {folders.length > 0 ? (
            <Select
              className="v2-select v2-automations-folder-select"
              value={folderKey ?? ""}
              triggerLabel={
                folderKey
                  ? `Dossier : ${
                      folders.find((f) => folderOptionKey(f) === folderKey)
                        ?.name ?? "…"
                    }`
                  : "Dossier"
              }
              ariaLabel="Filtrer par dossier"
              options={folderOptions}
              onChange={(v) => onFolderKeyChange(v || null)}
            />
          ) : null}
          <label className="v2-automations-search">
            <Search
              size={12}
              aria-hidden
              className="v2-automations-search-icon"
            />
            <input
              ref={searchRef}
              type="search"
              placeholder="Rechercher…"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="v2-search-inline v2-automations-filter-search"
              aria-label="Rechercher les automations"
            />
          </label>
          <DropdownMenu
            label="Créer"
            ariaLabel="Créer une automation"
            align="end"
            triggerClassName="v2-btn v2-btn-primary v2-automations-create-btn"
            open={createOpen}
            onOpenChange={onCreateOpenChange}
            items={[
              {
                id: "macro",
                label: "Macro",
                description: "Séquence d’actions",
                icon: <Workflow size={14} />,
                onSelect: onCreateMacro,
              },
              {
                id: "clicker",
                label: "Clicker",
                description: "Preset CPS",
                icon: <MousePointer2 size={14} />,
                onSelect: onCreateClicker,
              },
              {
                id: "script",
                label: "Script",
                description: "JavaScript",
                icon: <Code2 size={14} />,
                onSelect: onCreateScript,
              },
            ]}
          >
            <Plus size={14} aria-hidden />
            Créer
            <ChevronDown size={14} aria-hidden />
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
