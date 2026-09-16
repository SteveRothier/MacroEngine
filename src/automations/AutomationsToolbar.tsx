import { useRef, type RefObject } from "react";
import {
  ChevronDown,
  Code2,
  FolderPlus,
  MousePointer2,
  Plus,
  Redo2,
  Search,
  Undo2,
  Workflow,
} from "lucide-react";
import { useT } from "../i18n";
import { DropdownMenu, Tooltip } from "../ui/shell";
import type { AutomationFilter, FilterCounts } from "./types";
import { filterPillTooltip } from "./rowLabels";

type Props = {
  query: string;
  onQueryChange: (q: string) => void;
  filter: AutomationFilter;
  onFilterChange: (f: AutomationFilter) => void;
  counts: FilterCounts;
  onCreateMacro: () => void;
  onCreateClicker: () => void;
  onCreateScript: () => void;
  onCreateFolder?: () => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
};

const FILTER_VIEW_DEFS: {
  value: AutomationFilter;
  labelKey:
    | "automations.filter.all"
    | "automations.filter.favorites"
    | "automations.filter.recent";
  countKey: keyof FilterCounts;
}[] = [
  {
    value: "all",
    labelKey: "automations.filter.all",
    countKey: "all",
  },
  {
    value: "favorites",
    labelKey: "automations.filter.favorites",
    countKey: "favorites",
  },
  {
    value: "recent",
    labelKey: "automations.filter.recent",
    countKey: "recent",
  },
];

export function AutomationsToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  counts,
  onCreateMacro,
  onCreateClicker,
  onCreateScript,
  onCreateFolder,
  searchInputRef,
  createOpen,
  onCreateOpenChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: Props) {
  const t = useT();
  const localSearchRef = useRef<HTMLInputElement>(null);
  const searchRef = searchInputRef ?? localSearchRef;

  const createItems = [
    {
      id: "macro",
      label: t("automations.create.macro"),
      description: t("automations.create.macroDesc"),
      icon: <Workflow size={14} />,
      onSelect: onCreateMacro,
    },
    {
      id: "clicker",
      label: t("automations.create.clicker"),
      description: t("automations.create.clickerDesc"),
      icon: <MousePointer2 size={14} />,
      onSelect: onCreateClicker,
    },
    {
      id: "script",
      label: t("automations.create.script"),
      description: t("automations.create.scriptDesc"),
      icon: <Code2 size={14} />,
      onSelect: onCreateScript,
    },
    ...(onCreateFolder
      ? [
          { id: "sep-folders", label: "", separator: true as const },
          {
            id: "folder",
            label: t("automations.folder.create"),
            icon: <FolderPlus size={14} />,
            onSelect: () => onCreateFolder(),
          },
        ]
      : []),
  ];

  return (
    <div className="caster-automations-chrome">
      <div className="caster-automations-filter-bar">
        <div
          className="caster-segmented caster-segmented--compact caster-automations-view-segmented"
          role="group"
          aria-label={t("automations.filter.aria")}
        >
          {FILTER_VIEW_DEFS.map(({ value, labelKey, countKey }) => (
            <Tooltip key={value} content={filterPillTooltip(value, t)}>
              <button
                type="button"
                className={[
                  "caster-segmented-btn",
                  filter === value ? "active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={filter === value}
                onClick={() => onFilterChange(value)}
              >
                {t(labelKey)}
                <span className="caster-automations-view-count">
                  {counts[countKey]}
                </span>
              </button>
            </Tooltip>
          ))}
        </div>

        <label className="caster-automations-search">
          <Search
            size={12}
            aria-hidden
            className="caster-automations-search-icon"
          />
          <input
            ref={searchRef}
            type="search"
            placeholder={t("automations.search.placeholder")}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="caster-search-inline caster-automations-filter-search"
            aria-label={t("automations.search.aria")}
          />
        </label>

        <div className="caster-automations-filter-bar-end">
          {onUndo || onRedo ? (
            <div
              className="caster-segmented caster-segmented--compact caster-automations-history"
              role="group"
              aria-label={t("automations.toolbar.aria")}
            >
              <button
                type="button"
                className="caster-segmented-btn caster-automations-history-btn"
                disabled={!canUndo}
                onClick={onUndo}
                title={t("automations.toolbar.undoTitle")}
                aria-label={t("automations.toolbar.undo")}
              >
                <Undo2 size={14} aria-hidden />
              </button>
              <button
                type="button"
                className="caster-segmented-btn caster-automations-history-btn"
                disabled={!canRedo}
                onClick={onRedo}
                title={t("automations.toolbar.redoTitle")}
                aria-label={t("automations.toolbar.redo")}
              >
                <Redo2 size={14} aria-hidden />
              </button>
            </div>
          ) : null}
          <DropdownMenu
            label={t("automations.create.label")}
            ariaLabel={t("automations.create.aria")}
            align="end"
            triggerClassName="caster-btn caster-btn-primary caster-automations-create-btn"
            open={createOpen}
            onOpenChange={onCreateOpenChange}
            items={createItems}
          >
            <Plus size={14} aria-hidden />
            {t("automations.create.label")}
            <ChevronDown size={14} aria-hidden />
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
