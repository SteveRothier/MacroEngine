import {
  Folder,
  FolderPlus,
  MoreHorizontal,
  PenLine,
  Trash2,
} from "lucide-react";
import { useT } from "../i18n";
import { DropdownMenu } from "../ui/v2";
import type { AutomationFolderOption, AutomationRow } from "./types";
import { folderOptionKey } from "./types";

type Props = {
  folderKey: string | null;
  onFolderKeyChange: (key: string | null) => void;
  folders: AutomationFolderOption[];
  onCreateFolder: (kind: "macro" | "clicker") => void;
  onRenameFolder: (folder: AutomationFolderOption) => void;
  onDeleteFolder: (folder: AutomationFolderOption) => void;
  dragRow?: AutomationRow | null;
  dropFolderKey?: string | null;
  onDropFolderKeyChange?: (key: string | null) => void;
  onDropOntoFolder?: (folder: AutomationFolderOption | null) => void;
};

export function AccueilFolderRail({
  folderKey,
  onFolderKeyChange,
  folders,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  dragRow = null,
  dropFolderKey = null,
  onDropFolderKeyChange,
  onDropOntoFolder,
}: Props) {
  const t = useT();
  const dragging =
    dragRow != null && dragRow.kind !== "script" && onDropOntoFolder != null;
  const dropFolders = dragging
    ? folders.filter((f) => f.kind === dragRow.kind)
    : folders;

  function folderLabel(f: AutomationFolderOption): string {
    const dup = folders.filter((o) => o.name === f.name).length > 1;
    if (!dup) return f.name;
    return t("automations.folder.namedWithKind", {
      name: f.name,
      kind:
        f.kind === "macro"
          ? t("automations.folder.kindSuffixMacro")
          : t("automations.folder.kindSuffixClicker"),
    });
  }

  return (
    <aside
      className={[
        "v2-accueil-folder-rail",
        dragging ? "is-drop-active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={
        dragging
          ? t("automations.folder.chipsDropAria", { name: dragRow.name })
          : t("automations.folder.chipsAria")
      }
    >
      <div className="v2-accueil-folder-rail-list" role="list">
        <button
          type="button"
          role="listitem"
          className={[
            "v2-accueil-folder-rail-item",
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
          <Folder size={14} aria-hidden />
          <span className="v2-accueil-folder-rail-label">
            {dragging
              ? t("automations.folder.chipNoFolder")
              : t("automations.folder.chipAll")}
          </span>
        </button>

        {dropFolders.map((f) => {
          const fKey = folderOptionKey(f);
          const compatible = !dragging || f.kind === dragRow.kind;
          const active = folderKey === fKey && !dragging;
          return (
            <div
              key={fKey}
              role="listitem"
              className={[
                "v2-accueil-folder-rail-row",
                active ? "is-active" : "",
                dragging && dropFolderKey === fKey ? "is-over" : "",
                dragging && !compatible ? "is-disabled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                className="v2-accueil-folder-rail-item"
                disabled={dragging && !compatible}
                onClick={() => {
                  if (dragging) return;
                  onFolderKeyChange(fKey);
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
                <Folder size={14} aria-hidden />
                <span className="v2-accueil-folder-rail-label">
                  {folderLabel(f)}
                </span>
                <span className="v2-accueil-folder-rail-kind" aria-hidden>
                  {f.kind === "macro" ? "M" : "C"}
                </span>
              </button>
              {!dragging ? (
                <DropdownMenu
                  label={t("automations.folder.manageLabel")}
                  ariaLabel={t("automations.folder.manageAria")}
                  align="end"
                  stopTriggerPropagation
                  triggerClassName="v2-btn v2-btn-ghost v2-accueil-folder-rail-more"
                  items={[
                    {
                      id: "rename",
                      label: t("automations.folder.renameFiltered"),
                      icon: <PenLine size={14} />,
                      onSelect: () => onRenameFolder(f),
                    },
                    {
                      id: "delete",
                      label: t("automations.folder.delete"),
                      icon: <Trash2 size={14} />,
                      danger: true,
                      onSelect: () => onDeleteFolder(f),
                    },
                  ]}
                >
                  <MoreHorizontal size={14} aria-hidden />
                </DropdownMenu>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="v2-accueil-folder-rail-footer">
        <DropdownMenu
          label={t("automations.folder.manageLabel")}
          ariaLabel={t("automations.folder.manageAria")}
          align="start"
          triggerClassName="v2-btn v2-btn-ghost v2-accueil-folder-rail-add"
          items={[
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
          ]}
        >
          <FolderPlus size={14} aria-hidden />
          {t("automations.folder.manageLabel")}
        </DropdownMenu>
      </div>
    </aside>
  );
}
