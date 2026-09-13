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
  const localSearchRef = useRef<HTMLInputElement>(null);
  const searchRef = searchInputRef ?? localSearchRef;
  const dragging =
    dragRow != null && dragRow.kind !== "script" && onDropOntoFolder != null;
  const dropFolders = dragging
    ? folders.filter((f) => f.kind === dragRow.kind)
    : folders;

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

  const folderMenuItems = [
    {
      id: "folder-macro",
      label: "Dossier macros",
      icon: <FolderPlus size={14} />,
      onSelect: () => onCreateFolder?.("macro"),
    },
    {
      id: "folder-clicker",
      label: "Dossier clickers",
      icon: <FolderPlus size={14} />,
      onSelect: () => onCreateFolder?.("clicker"),
    },
    ...(folderKey && onRenameFolder
      ? [
          { id: "sep-rename", label: "", separator: true as const },
          {
            id: "rename-folder",
            label: "Renommer le dossier filtré",
            icon: <PenLine size={14} />,
            onSelect: () => onRenameFolder(),
          },
        ]
      : []),
    ...(folderKey && onDeleteFolder
      ? [
          {
            id: "delete-folder",
            label: "Supprimer le dossier",
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
          {onCreateFolder ? (
            <DropdownMenu
              label="Dossiers"
              ariaLabel="Gérer les dossiers"
              align="end"
              triggerClassName="v2-btn v2-btn-ghost"
              items={folderMenuItems}
            >
              <FolderPlus size={14} aria-hidden />
              Dossiers
              <ChevronDown size={14} aria-hidden />
            </DropdownMenu>
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

      {folders.length > 0 || dragging ? (
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
              ? `Déposer « ${dragRow.name} » dans un dossier`
              : "Dossiers"
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
            {dragging ? "Sans dossier" : "Tous"}
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
    </div>
  );
}
