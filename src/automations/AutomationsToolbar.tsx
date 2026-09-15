import { useRef, type RefObject } from "react";
import {
  ChevronDown,
  Code2,
  FolderPlus,
  MousePointer2,
  PenLine,
  Plus,
  Search,
  Trash2,
  Workflow,
} from "lucide-react";
import { useT } from "../i18n";
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
  onCreateFolder?: (kind: "macro" | "clicker") => void;
  onRenameFolder?: () => void;
  onDeleteFolder?: () => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
};

const FILTER_VIEW_DEFS: {
  value: AutomationFilter;
  labelKey:
    | "automations.filter.all"
    | "automations.filter.favorites"
    | "automations.filter.recent"
    | "automations.filter.scripts";
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
  {
    value: "scripts",
    labelKey: "automations.filter.scripts",
    countKey: "scripts",
  },
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
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  searchInputRef,
  createOpen,
  onCreateOpenChange,
}: Props) {
  const t = useT();
  const localSearchRef = useRef<HTMLInputElement>(null);
  const searchRef = searchInputRef ?? localSearchRef;

  const folderOptions = [
    { value: "", label: t("automations.folder.chipAll") },
    ...folders.map((f) => ({
      value: folderOptionKey(f),
      label:
        folders.filter((o) => o.name === f.name).length > 1
          ? t("automations.folder.namedWithKind", {
              name: f.name,
              kind:
                f.kind === "macro"
                  ? t("automations.folder.kindSuffixMacro")
                  : t("automations.folder.kindSuffixClicker"),
            })
          : f.name,
    })),
  ];
  const selectedFolderName =
    folders.find((f) => folderOptionKey(f) === folderKey)?.name ?? null;
  const folderTriggerLabel = folderKey
    ? (selectedFolderName ?? "…")
    : t("automations.folder.chipAll");

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
            id: "folder-macro",
            label: t("automations.folder.createMacro"),
            icon: <FolderPlus size={14} />,
            onSelect: () => onCreateFolder("macro"),
          },
          {
            id: "folder-clicker",
            label: t("automations.folder.createClicker"),
            icon: <FolderPlus size={14} />,
            onSelect: () => onCreateFolder("clicker"),
          },
        ]
      : []),
    ...(folderKey && onRenameFolder
      ? [
          {
            id: "rename-folder",
            label: t("automations.folder.renameFiltered"),
            icon: <PenLine size={14} />,
            onSelect: () => onRenameFolder(),
          },
        ]
      : []),
    ...(folderKey && onDeleteFolder
      ? [
          {
            id: "delete-folder",
            label: t("automations.folder.delete"),
            icon: <Trash2 size={14} />,
            danger: true as const,
            onSelect: () => onDeleteFolder(),
          },
        ]
      : []),
  ];

  return (
    <div className="v2-automations-chrome">
      <div className="v2-automations-filter-bar">
        <div
          className="v2-segmented v2-segmented--compact v2-automations-view-segmented"
          role="group"
          aria-label={t("automations.filter.aria")}
        >
          {FILTER_VIEW_DEFS.map(({ value, labelKey, countKey }) => (
            <Tooltip key={value} content={filterPillTooltip(value, t)}>
              <button
                type="button"
                className={[
                  "v2-segmented-btn",
                  filter === value ? "active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={filter === value}
                onClick={() => onFilterChange(value)}
              >
                {t(labelKey)}
                <span className="v2-automations-view-count">
                  {counts[countKey]}
                </span>
              </button>
            </Tooltip>
          ))}
        </div>

        {folders.length > 0 ? (
          <Select
            className="v2-select v2-automations-folder-select"
            value={folderKey ?? ""}
            options={folderOptions}
            triggerLabel={folderTriggerLabel}
            ariaLabel={t("automations.folder.selectAria")}
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
            placeholder={t("automations.search.placeholder")}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="v2-search-inline v2-automations-filter-search"
            aria-label={t("automations.search.aria")}
          />
        </label>

        <div className="v2-automations-filter-bar-end">
          <DropdownMenu
            label={t("automations.create.label")}
            ariaLabel={t("automations.create.aria")}
            align="end"
            triggerClassName="v2-btn v2-btn-primary v2-automations-create-btn"
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
