import { useRef, type RefObject } from "react";
import {
  ChevronDown,
  Clock,
  Code2,
  Folder,
  FolderPlus,
  History,
  MousePointer2,
  PenLine,
  Plus,
  Search,
  Star,
  Trash2,
  Workflow,
} from "lucide-react";
import { useT } from "../i18n";
import { DropdownMenu, Select, Tooltip } from "../ui/v2";
import type {
  AutomationFilter,
  AutomationFolderOption,
  AutomationRow,
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
  dragRow?: AutomationRow | null;
  dropFolderKey?: string | null;
  onDropFolderKeyChange?: (key: string | null) => void;
  onDropOntoFolder?: (folder: AutomationFolderOption | null) => void;
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
  icon: typeof Clock;
  countKey: keyof FilterCounts;
}[] = [
  {
    value: "all",
    labelKey: "automations.filter.all",
    icon: Clock,
    countKey: "all",
  },
  {
    value: "favorites",
    labelKey: "automations.filter.favorites",
    icon: Star,
    countKey: "favorites",
  },
  {
    value: "recent",
    labelKey: "automations.filter.recent",
    icon: History,
    countKey: "recent",
  },
  {
    value: "scripts",
    labelKey: "automations.filter.scripts",
    icon: Code2,
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
  dragRow = null,
  dropFolderKey = null,
  onDropFolderKeyChange,
  onDropOntoFolder,
  searchInputRef,
  createOpen,
  onCreateOpenChange,
}: Props) {
  const t = useT();
  const localSearchRef = useRef<HTMLInputElement>(null);
  const searchRef = searchInputRef ?? localSearchRef;
  const dragging =
    dragRow != null && dragRow.kind !== "script" && onDropOntoFolder != null;
  const dropFolders = dragging
    ? folders.filter((f) => f.kind === dragRow.kind)
    : folders;
  const showFolderChips = folders.length > 0 || dragging;

  const activeView =
    FILTER_VIEW_DEFS.find((d) => d.value === filter) ?? FILTER_VIEW_DEFS[0];
  const ActiveViewIcon = activeView.icon;
  const viewOptions = FILTER_VIEW_DEFS.map(({ value, labelKey, countKey }) => ({
    value,
    label: `${t(labelKey)} · ${counts[countKey]}`,
  }));
  const viewTriggerLabel = `${t(activeView.labelKey)} · ${counts[activeView.countKey]}`;

  const folderMenuItems = [
    {
      id: "folder-macro",
      label: t("automations.folder.createMacro"),
      icon: <FolderPlus size={14} />,
      onSelect: () => onCreateFolder?.("macro"),
    },
    {
      id: "folder-clicker",
      label: t("automations.folder.createClicker"),
      icon: <FolderPlus size={14} />,
      onSelect: () => onCreateFolder?.("clicker"),
    },
    ...(folderKey && onRenameFolder
      ? [
          { id: "sep-rename", label: "", separator: true as const },
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
        <div className="v2-automations-view-select">
          <ActiveViewIcon
            size={13}
            aria-hidden
            className="v2-automations-view-select-icon"
          />
          <Select
            className="v2-select v2-automations-view-select-control"
            value={filter}
            options={viewOptions}
            triggerLabel={viewTriggerLabel}
            ariaLabel={t("automations.filter.aria")}
            title={filterPillTooltip(filter, t)}
            onChange={(v) => onFilterChange(v as AutomationFilter)}
          />
        </div>

        {showFolderChips ? (
          <div
            className={[
              "v2-auto-folder-chips",
              dragging ? "is-drop-active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="toolbar"
            aria-label={
              dragging
                ? t("automations.folder.chipsDropAria", { name: dragRow.name })
                : t("automations.folder.chipsAria")
            }
          >
            <button
              type="button"
              className={[
                "v2-auto-folder-chip",
                !folderKey && !dragging ? "is-active" : "",
                dragging && dropFolderKey === "root" ? "is-over" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (dragging) return;
                onFolderKeyChange(null);
              }}
              onPointerEnter={() => {
                if (dragging) onDropFolderKeyChange?.("root");
              }}
              onPointerLeave={() => {
                if (dragging && dropFolderKey === "root")
                  onDropFolderKeyChange?.(null);
              }}
              onPointerUp={() => {
                if (!dragging) return;
                onDropOntoFolder?.(null);
              }}
            >
              <Folder size={13} aria-hidden />
              {dragging
                ? t("automations.folder.chipNoFolder")
                : t("automations.folder.chipAll")}
            </button>
            {dropFolders.map((f) => {
              const fKey = folderOptionKey(f);
              const compatible = !dragging || f.kind === dragRow.kind;
              return (
                <button
                  key={fKey}
                  type="button"
                  disabled={dragging && !compatible}
                  className={[
                    "v2-auto-folder-chip",
                    folderKey === fKey && !dragging ? "is-active" : "",
                    dragging && dropFolderKey === fKey ? "is-over" : "",
                    dragging && !compatible ? "is-disabled" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    if (dragging) return;
                    onFolderKeyChange(folderKey === fKey ? null : fKey);
                  }}
                  onPointerEnter={() => {
                    if (dragging && compatible) onDropFolderKeyChange?.(fKey);
                  }}
                  onPointerLeave={() => {
                    if (dragging && dropFolderKey === fKey)
                      onDropFolderKeyChange?.(null);
                  }}
                  onPointerUp={() => {
                    if (!dragging || !compatible) return;
                    onDropOntoFolder?.(f);
                  }}
                >
                  <Folder size={13} aria-hidden />
                  {f.name}
                  <span className="v2-auto-folder-chip-kind">
                    {f.kind === "macro" ? "M" : "C"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="v2-automations-filter-bar-end">
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
          {onCreateFolder ? (
            <Tooltip content={t("automations.folder.manageLabel")}>
              <DropdownMenu
                label={t("automations.folder.manageLabel")}
                ariaLabel={t("automations.folder.manageAria")}
                align="end"
                triggerClassName="v2-btn v2-btn-ghost v2-automations-folder-manage-btn"
                items={folderMenuItems}
              >
                <FolderPlus size={14} aria-hidden />
                <ChevronDown size={12} aria-hidden />
              </DropdownMenu>
            </Tooltip>
          ) : null}
          <DropdownMenu
            label={t("automations.create.label")}
            ariaLabel={t("automations.create.aria")}
            align="end"
            triggerClassName="v2-btn v2-btn-primary v2-automations-create-btn"
            open={createOpen}
            onOpenChange={onCreateOpenChange}
            items={[
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
            ]}
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
