import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Clock,
  Code2,
  Folder,
  LayoutGrid,
  MousePointer2,
  Plus,
  Search,
  Star,
  Workflow,
  X,
} from "lucide-react";
import { useT } from "../i18n";
import { useUnifiedAutomations } from "../automations/useUnifiedAutomations";
import { buildAutomationRowMenuItems } from "../automations/automationRowMenuItems";
import { automationRowMenuIcons } from "../automations/automationRowMenuIcons";
import { runLibraryConvert } from "../automations/convertLibraryItem";
import type {
  AutomationFolderOption,
  AutomationKindFilter,
  AutomationRow,
} from "../automations/types";
import {
  ContextMenu,
  DropdownMenu,
  findMenuItem,
  Tooltip,
  useContextMenuState,
  useToast,
  type MenuItemDef,
} from "../ui/shell";
import {
  askScriptLanguage,
  confirmAction,
  confirmChoice,
  promptAction,
} from "../ui";
import { DEFAULT_CLICKER } from "../clicker/clickerTypes";
import { defaultScriptSource } from "../scripts/defaultSources";
import { newScriptId } from "../scripts/newScriptId";
import type { ScriptDoc } from "../scripts/types";
import { BoundLibItem, LibTreeFolder } from "./LibTreeNodes";
import {
  buildLibTree,
  buildNavigationEntries,
  cx,
  errMessage,
  filterBrowseRows,
  matchesLibraryQuery,
  sortRowsByRecentOrder,
  stubRow,
  UNFILED_ID,
  type LibScope,
  type LibTreeNode,
} from "./libTree";
import { useLibPointerDnd } from "./useLibPointerDnd";

export type WorkspaceLibraryProps = {
  activeKey: string | null;
  refreshKey?: number;
  dirtyMacroId?: string | null;
  dirtyClickerId?: string | null;
  dirtyScriptId?: string | null;
  recentListMax?: number;
  confirmTrash?: boolean;
  confirmDeleteFolder?: boolean;
  onOpen: (row: AutomationRow) => void;
  onCreateMacro: () => void;
  onCreateClicker: () => void;
  onCreateScript: () => void;
  onRefresh?: () => void;
  onItemRenamed?: (
    kind: AutomationRow["kind"],
    id: string,
    newName: string,
  ) => void;
};

function buildFolderMenuItems(
  folder: AutomationFolderOption,
  t: (key: string) => string,
  actions: {
    renameFolder: (folder: AutomationFolderOption) => void;
    createFolder: (parentId: string | null) => void;
    createKindInFolder: (
      kind: AutomationRow["kind"],
      folder: AutomationFolderOption,
    ) => void;
    deleteFolder: (folder: AutomationFolderOption) => void;
  },
): MenuItemDef[] {
  return [
    {
      id: "rename-folder",
      label: t("automations.menu.empty.renameFolder"),
      onSelect: () => void actions.renameFolder(folder),
    },
    {
      id: "new-subfolder",
      label: t("automations.menu.empty.newFolder"),
      onSelect: () => void actions.createFolder(folder.id),
    },
    { id: "sep-create-in", label: "", separator: true },
    {
      id: "new-macro-in",
      label: t("automations.create.macro"),
      icon: <Workflow size={14} />,
      onSelect: () => void actions.createKindInFolder("macro", folder),
    },
    {
      id: "new-clicker-in",
      label: t("automations.create.clicker"),
      icon: <MousePointer2 size={14} />,
      onSelect: () => void actions.createKindInFolder("clicker", folder),
    },
    {
      id: "new-script-in",
      label: t("automations.create.script"),
      icon: <Code2 size={14} />,
      onSelect: () => void actions.createKindInFolder("script", folder),
    },
    { id: "sep-f", label: "", separator: true },
    {
      id: "delete-folder",
      label: t("automations.confirm.deleteFolderTitle"),
      danger: true,
      onSelect: () => void actions.deleteFolder(folder),
    },
  ];
}

export function WorkspaceLibrary({
  activeKey,
  refreshKey,
  dirtyMacroId,
  dirtyClickerId,
  dirtyScriptId,
  recentListMax = 12,
  confirmTrash = true,
  confirmDeleteFolder = true,
  onOpen,
  onCreateMacro,
  onCreateClicker,
  onCreateScript,
  onRefresh,
  onItemRenamed,
}: WorkspaceLibraryProps) {
  const t = useT();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<LibScope>("all");
  const [kindFilter, setKindFilter] = useState<AutomationKindFilter>("all");
  /** Folders start collapsed; ids present here are expanded. */
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [ctxItems, setCtxItems] = useState<MenuItemDef[]>([]);
  const ctxMenu = useContextMenuState();
  const foldersRef = useRef<AutomationFolderOption[]>([]);
  const moveRowRef = useRef<
    (row: AutomationRow, folder: AutomationFolderOption | null) => Promise<void>
  >(async () => {});

  const { allRows, folders, loading, refresh, recentOrder } =
    useUnifiedAutomations({
      dirtyMacroId,
      dirtyClickerId,
      dirtyScriptId,
      refreshKey,
      query,
      filter: "all",
      kindFilter,
      recentListMax,
      active: true,
    });
  foldersRef.current = folders;

  const bump = useCallback(() => {
    void refresh({ silent: true });
    onRefresh?.();
  }, [onRefresh, refresh]);

  const { dropTarget, draggingKey, dragGhost, onItemPointerDown, openRow } =
    useLibPointerDnd({
      foldersRef,
      onMove: (row, folder) => moveRowRef.current(row, folder),
      onOpen,
    });

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const q = query.trim().toLowerCase();
  const matchQuery = useCallback(
    (r: AutomationRow) => matchesLibraryQuery(r, q),
    [q],
  );

  const activeBrowse = useMemo(
    () => filterBrowseRows(allRows, kindFilter),
    [allRows, kindFilter],
  );

  const favorites = useMemo(
    () => activeBrowse.filter((r) => r.favorite),
    [activeBrowse],
  );

  const recentRows = useMemo(
    () => sortRowsByRecentOrder(activeBrowse, recentOrder),
    [activeBrowse, recentOrder],
  );

  const treeSource = useMemo(
    () => allRows.filter((r) => !r.trashed),
    [allRows],
  );

  const { folders: folderTree, unfiled: unfiledRows } = useMemo(
    () =>
      buildLibTree(
        folders,
        treeSource.filter(
          (r) => kindFilter === "all" || r.kind === kindFilter,
        ),
        matchQuery,
        Boolean(q),
      ),
    [folders, kindFilter, matchQuery, q, treeSource],
  );

  const isNodeOpen = useCallback(
    (node: LibTreeNode) => {
      if (q) return node.items.length > 0 || node.children.length > 0;
      return expanded.has(node.id);
    },
    [expanded, q],
  );

  const favVisible = useMemo(
    () => favorites.filter(matchQuery),
    [favorites, matchQuery],
  );
  const recentVisible = useMemo(
    () => recentRows.filter(matchQuery),
    [matchQuery, recentRows],
  );

  const navEntries = useMemo(
    () =>
      buildNavigationEntries({
        scope,
        favVisible,
        recentVisible,
        folderTree,
        unfiledRows,
        isNodeOpen,
      }),
    [favVisible, folderTree, isNodeOpen, recentVisible, scope, unfiledRows],
  );

  async function createFolder(parentId: string | null) {
    const name = await promptAction({
      title: t("automations.confirm.createFolderTitle"),
      defaultValue: "",
      confirmLabel: t("automations.confirm.createFolderConfirm"),
      placeholder: t("automations.confirm.createFolderPlaceholder"),
    });
    if (!name?.trim()) return;
    try {
      await invoke("create_library_folder_cmd", {
        kind: "macro",
        name: name.trim(),
        parentId,
      });
      toast.success(
        t("automations.toast.folderCreated", { name: name.trim() }),
      );
      bump();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  async function createKindInFolder(
    kind: AutomationRow["kind"],
    folder: AutomationFolderOption,
  ) {
    try {
      if (kind === "macro") {
        const doc = await invoke<{ name: string }>("create_saved_macro", {
          name: null,
        });
        await invoke("move_library_item_cmd", {
          kind: "macro",
          id: doc.name,
          folderId: folder.id,
          beforeId: null,
        });
        bump();
        toast.success(t("shell.macroCreated"));
        onOpen(stubRow("macro", doc.name, doc.name, folder));
        return;
      }
      if (kind === "clicker") {
        const name = `Preset ${Date.now().toString(36)}`;
        await invoke("save_clicker_preset", {
          name,
          config: DEFAULT_CLICKER,
        });
        await invoke("move_library_item_cmd", {
          kind: "clicker",
          id: name,
          folderId: folder.id,
          beforeId: null,
        });
        bump();
        toast.success(t("shell.clickerCreated"));
        onOpen(stubRow("clicker", name, name, folder));
        return;
      }
      const outcome = await confirmChoice({
        title: t("scripts.create.title"),
        message: t("scripts.create.message"),
        confirmLabel: t("scripts.create.runnable"),
        discardLabel: t("scripts.create.module"),
        cancelLabel: t("common.cancel"),
      });
      if (outcome === "cancel") return;
      const isModule = outcome === "discard";
      const language = await askScriptLanguage({
        title: t("scripts.create.languageTitle"),
        message: t("scripts.create.languageMessage"),
        javascriptLabel: t("scripts.language.javascript"),
        typescriptLabel: t("scripts.language.typescript"),
        cancelLabel: t("common.cancel"),
      });
      if (!language) return;
      const id = newScriptId();
      const name = t("shell.newScriptName");
      const doc: ScriptDoc = {
        id,
        name,
        source: defaultScriptSource(language, isModule),
        language,
        isModule,
        allowNetwork: false,
        allowClipboard: false,
        allowFs: false,
        allowMacroControl: false,
        allowInput: false,
        allowProcess: false,
        paramValues: {},
      };
      await invoke("save_script_cmd", { doc });
      await invoke("move_library_item_cmd", {
        kind: "script",
        id,
        folderId: folder.id,
        beforeId: null,
      });
      bump();
      toast.success(t("shell.scriptCreated"));
      onOpen(stubRow("script", id, name, folder));
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  const createMenuItems: MenuItemDef[] = [
    {
      id: "folder",
      label: t("automations.folder.create"),
      icon: <Folder size={14} />,
      onSelect: () => void createFolder(null),
    },
    { id: "sep-create", label: "", separator: true },
    {
      id: "macro",
      label: t("automations.create.macro"),
      icon: <Workflow size={14} />,
      onSelect: onCreateMacro,
    },
    {
      id: "clicker",
      label: t("automations.create.clicker"),
      icon: <MousePointer2 size={14} />,
      onSelect: onCreateClicker,
    },
    {
      id: "script",
      label: t("automations.create.script"),
      icon: <Code2 size={14} />,
      onSelect: onCreateScript,
    },
  ];

  async function renameFolder(folder: AutomationFolderOption) {
    const next = await promptAction({
      title: t("automations.confirm.renameFolderTitle"),
      defaultValue: folder.name,
      confirmLabel: t("automations.confirm.renameFolderConfirm"),
      placeholder: t("automations.confirm.renameFolderPlaceholder"),
    });
    if (!next?.trim() || next.trim() === folder.name) return;
    try {
      await invoke("rename_library_folder_cmd", {
        kind: "macro",
        id: folder.id,
        name: next.trim(),
      });
      toast.success(
        t("automations.toast.folderRenamed", { name: next.trim() }),
      );
      bump();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  async function deleteFolder(folder: AutomationFolderOption) {
    if (confirmDeleteFolder) {
      const ok = await confirmAction({
        title: t("automations.confirm.deleteFolderTitle"),
        message: t("automations.confirm.deleteFolderMessage", {
          name: folder.name,
        }),
        confirmLabel: t("automations.confirm.deleteConfirm"),
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await invoke("delete_library_folder_cmd", {
        kind: "macro",
        id: folder.id,
      });
      toast.success(
        t("automations.toast.folderDeleted", { name: folder.name }),
      );
      bump();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  async function renameRow(row: AutomationRow) {
    if (row.locked) return;
    const next = await promptAction({
      title: t("automations.confirm.renameTitle"),
      defaultValue: row.name,
      confirmLabel: t("automations.confirm.renameConfirm"),
      placeholder: t("automations.confirm.renamePlaceholder"),
    });
    if (!next?.trim() || next.trim() === row.name) return;
    const to = next.trim();
    try {
      if (row.kind === "macro") {
        const doc = await invoke<{ name: string }>("rename_saved_macro", {
          from: row.id,
          to,
        });
        onItemRenamed?.(row.kind, row.id, doc.name);
        toast.success(t("automations.toast.renamed", { name: doc.name }));
      } else if (row.kind === "clicker") {
        const preset = await invoke<{ name: string }>("rename_clicker_preset", {
          from: row.id,
          to,
        });
        onItemRenamed?.(row.kind, row.id, preset.name);
        toast.success(t("automations.toast.renamed", { name: preset.name }));
      } else {
        const src = await invoke<{ id: string; name: string; source: string }>(
          "load_script_cmd",
          { id: row.id },
        );
        await invoke("save_script_cmd", { doc: { ...src, name: to } });
        onItemRenamed?.(row.kind, row.id, to);
        toast.success(t("automations.toast.renamed", { name: to }));
      }
      bump();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  async function duplicateRow(row: AutomationRow) {
    try {
      if (row.kind === "macro") {
        const copy = await invoke<{ name: string }>("duplicate_saved_macro", {
          name: row.id,
        });
        bump();
        toast.success(
          t("automations.toast.duplicatedOne", { name: copy.name }),
        );
        onOpen({ ...row, id: copy.name, name: copy.name });
      } else if (row.kind === "clicker") {
        const copy = await invoke<{ name: string }>(
          "duplicate_clicker_preset",
          { name: row.id },
        );
        bump();
        toast.success(
          t("automations.toast.duplicatedOne", { name: copy.name }),
        );
        onOpen({ ...row, id: copy.name, name: copy.name });
      } else {
        const src = await invoke<{
          id: string;
          name: string;
          source: string;
          language?: string;
        }>("load_script_cmd", { id: row.id });
        const copy = {
          ...src,
          id: newScriptId(),
          name: `${src.name} copy`,
        };
        await invoke("save_script_cmd", { doc: copy });
        bump();
        toast.success(
          t("automations.toast.duplicatedOne", { name: copy.name }),
        );
        onOpen({ ...row, id: copy.id, name: copy.name });
      }
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  async function toggleFavorite(row: AutomationRow) {
    try {
      await invoke("set_quick_favorite", {
        kind: row.kind,
        id: row.id,
        favorite: !row.favorite,
      });
      bump();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.favoriteFail")));
    }
  }

  async function setLocked(row: AutomationRow, locked: boolean) {
    try {
      await invoke("set_library_item_locked_cmd", {
        kind: row.kind,
        id: row.id,
        locked,
      });
      bump();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  async function trashRow(row: AutomationRow) {
    if (row.locked) {
      toast.error(t("automations.toast.unlockBeforeTrash"));
      return;
    }
    if (confirmTrash) {
      const ok = await confirmAction({
        title: t("automations.confirm.deleteTitle"),
        message: t("automations.confirm.deleteOne", { name: row.name }),
        confirmLabel: t("automations.confirm.deleteConfirm"),
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await invoke("trash_library_item_cmd", { kind: row.kind, id: row.id });
      toast.success(t("automations.toast.trashed"));
      bump();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  async function moveRow(
    row: AutomationRow,
    folder: AutomationFolderOption | null,
  ) {
    try {
      await invoke("move_library_item_cmd", {
        kind: row.kind,
        id: row.id,
        folderId: folder?.id ?? null,
        beforeId: null,
      });
      toast.success(t("automations.toast.moved"));
      bump();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }
  moveRowRef.current = moveRow;

  async function launchRow(row: AutomationRow) {
    try {
      if (row.kind === "macro") {
        await invoke("launch_saved_macro", { name: row.id });
      } else if (row.kind === "clicker") {
        await invoke("launch_clicker_preset", { name: row.id });
      } else {
        if (row.isModule) {
          toast.error(t("automations.toast.scriptModuleBlocked"));
          return;
        }
        await invoke("run_script_session_cmd", { id: row.id });
        toast.success(
          t("automations.toast.scriptLaunched", { name: row.name }),
        );
      }
      onRefresh?.();
    } catch (e) {
      toast.error(
        errMessage(
          e,
          row.kind === "script"
            ? t("automations.toast.scriptLaunchFail")
            : t("automations.toast.moveFail"),
        ),
      );
    }
  }

  async function revealRow(row: AutomationRow) {
    try {
      await invoke("reveal_library_entry", { kind: row.kind, name: row.id });
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.revealFail")));
    }
  }

  async function convertRow(row: AutomationRow, toKind: AutomationRow["kind"]) {
    try {
      const outcome = await runLibraryConvert({
        fromKind: row.kind,
        id: row.id,
        toKind,
        name: row.name,
        t,
      });
      if (!outcome) return;
      bump();
      if (outcome.openAfter) {
        onOpen({
          ...row,
          kind: toKind,
          id: outcome.result.newId,
          name: outcome.result.newName,
        });
      }
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }


  function openItemMenu(e: MouseEvent, row: AutomationRow) {
    e.preventDefault();
    e.stopPropagation();
    const items = buildAutomationRowMenuItems(row, t, {
      onOpen: () => onOpen(row),
      onLaunch: () => void launchRow(row),
      onRename: row.trashed ? undefined : () => void renameRow(row),
      onDuplicate: row.trashed ? undefined : () => void duplicateRow(row),
      onToggleFavorite: row.trashed
        ? undefined
        : () => void toggleFavorite(row),
      onLock: row.trashed ? undefined : () => void setLocked(row, true),
      onUnlock: row.trashed ? undefined : () => void setLocked(row, false),
      onReveal: () => void revealRow(row),
      moveFolders: folders,
      onMoveToFolder: row.trashed
        ? undefined
        : (folder) => void moveRow(row, folder),
      onConvertTo: row.trashed
        ? undefined
        : (toKind) => void convertRow(row, toKind),
      onDelete: () => void trashRow(row),
      icons: automationRowMenuIcons(),
    });
    setCtxItems(items);
    ctxMenu.openFromEvent(e);
  }

  function openFolderMenu(e: MouseEvent, folder: AutomationFolderOption) {
    e.preventDefault();
    e.stopPropagation();
    setCtxItems(
      buildFolderMenuItems(folder, t, {
        renameFolder,
        createFolder,
        createKindInFolder,
        deleteFolder,
      }),
    );
    ctxMenu.openFromEvent(e);
  }

  function openEmptyMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCtxItems(createMenuItems);
    ctxMenu.openFromEvent(e);
  }

  function selectKind(next: AutomationKindFilter) {
    setKindFilter(next);
    setScope("all");
  }

  function selectScope(next: Exclude<LibScope, "all">) {
    setScope(next);
    setKindFilter("all");
  }

  function moveFocus(delta: number) {
    if (navEntries.length === 0) return;
    const idx = focusKey
      ? navEntries.findIndex((e) => e.key === focusKey)
      : -1;
    const next =
      navEntries[
        Math.max(0, Math.min(navEntries.length - 1, (idx < 0 ? 0 : idx) + delta))
      ];
    if (!next) return;
    setFocusKey(next.key);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-nav-key="${CSS.escape(next.key)}"]`)
        ?.focus({ preventScroll: false });
    });
  }

  function onTreeKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(-1);
      return;
    }
    if (!focusKey) return;
    const entry = navEntries.find((n) => n.key === focusKey);
    if (!entry) return;
    if (e.key === "ArrowRight" && entry.type === "folder") {
      e.preventDefault();
      if (!isNodeOpen(entry.node)) toggleExpanded(entry.node.id);
      return;
    }
    if (e.key === "ArrowLeft" && entry.type === "folder") {
      e.preventDefault();
      if (isNodeOpen(entry.node)) toggleExpanded(entry.node.id);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (entry.type === "folder") toggleExpanded(entry.node.id);
      else onOpen(entry.row);
    }
  }

  const kindStrip: {
    id: AutomationKindFilter;
    label: string;
    icon: ReactNode;
  }[] = [
    {
      id: "all",
      label: t("automations.filter.kindAll"),
      icon: <LayoutGrid size={16} aria-hidden />,
    },
    {
      id: "macro",
      label: t("automations.filter.kindMacro"),
      icon: <Workflow size={16} aria-hidden />,
    },
    {
      id: "clicker",
      label: t("automations.filter.kindClicker"),
      icon: <MousePointer2 size={16} aria-hidden />,
    },
    {
      id: "script",
      label: t("automations.filter.kindScript"),
      icon: <Code2 size={16} aria-hidden />,
    },
  ];

  const scopeStrip: {
    id: Exclude<LibScope, "all">;
    label: string;
    icon: ReactNode;
  }[] = [
    {
      id: "favorites",
      label: t("automations.filter.favorites"),
      icon: <Star size={16} aria-hidden />,
    },
    {
      id: "recent",
      label: t("automations.filter.recent"),
      icon: <Clock size={16} aria-hidden />,
    },
  ];

  function renderItemList(list: AutomationRow[]) {
    if (list.length === 0) {
      return (
        <p className="caster-lib-empty">{t("automations.empty.noResultsLead")}</p>
      );
    }
    return list.map((row) => (
      <BoundLibItem
        key={`${row.kind}:${row.id}`}
        row={row}
        activeKey={activeKey}
        focusKey={focusKey}
        draggingKey={draggingKey}
        onOpen={openRow}
        onContextMenu={openItemMenu}
        onPointerDown={onItemPointerDown}
      />
    ));
  }

  return (
    <div
      className={cx(
        "caster-workspace-library",
        draggingKey && "is-lib-dragging",
      )}
    >
      <div className="caster-lib-chrome">
        <div
          className="caster-lib-kind-strip"
          role="group"
          aria-label={t("automations.filter.aria")}
        >
          {kindStrip.map((k) => {
            const isAll = k.id === "all";
            const active = scope === "all" && kindFilter === k.id;
            return (
              <Tooltip key={k.id} content={k.label} side="bottom">
                <button
                  type="button"
                  className={cx(
                    "caster-lib-chip",
                    isAll && "caster-lib-chip--label",
                    active && "is-active",
                  )}
                  aria-pressed={active}
                  aria-label={k.label}
                  onClick={() => selectKind(k.id)}
                >
                  {isAll ? (
                    <span className="caster-lib-chip-label">All</span>
                  ) : (
                    k.icon
                  )}
                </button>
              </Tooltip>
            );
          })}
          {scopeStrip.map((item) => {
            const active = scope === item.id;
            return (
              <Tooltip key={item.id} content={item.label} side="bottom">
                <button
                  type="button"
                  className={cx("caster-lib-chip", active && "is-active")}
                  aria-pressed={active}
                  aria-label={item.label}
                  onClick={() => selectScope(item.id)}
                >
                  {item.icon}
                </button>
              </Tooltip>
            );
          })}
        </div>

        <div className="caster-lib-folders-band">
          <span className="caster-lib-folders-title">
            {t("automations.folder.manageLabel")}
          </span>
          <div className="caster-lib-folders-actions">
            <DropdownMenu
              label={t("automations.create.label")}
              ariaLabel={t("automations.create.aria")}
              align="end"
              triggerClassName="caster-lib-chip caster-lib-chip--accent"
              items={createMenuItems}
            >
              <Plus size={14} aria-hidden strokeWidth={2.5} />
            </DropdownMenu>
          </div>
        </div>

        <label className="caster-lib-search caster-lib-search--full">
          <Search size={12} aria-hidden className="caster-lib-search-icon" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                setQuery("");
              }
            }}
            placeholder={t("automations.search.placeholder")}
            aria-label={t("automations.search.aria")}
          />
          {query ? (
            <button
              type="button"
              className="caster-lib-chip caster-lib-chip--clear"
              aria-label={t("automations.empty.clearSearch")}
              onClick={() => setQuery("")}
            >
              <X size={12} aria-hidden />
            </button>
          ) : null}
        </label>
      </div>

      <div
        className="caster-lib-tree"
        role="tree"
        tabIndex={0}
        aria-busy={loading || undefined}
        aria-label={t("shell.library.aria")}
        onContextMenu={scope === "all" ? openEmptyMenu : undefined}
        onKeyDown={onTreeKeyDown}
      >
        {scope === "favorites" ? (
          renderItemList(favVisible)
        ) : scope === "recent" ? (
          renderItemList(recentVisible)
        ) : folderTree.length === 0 && unfiledRows.length === 0 ? (
          <p className="caster-lib-empty">{t("automations.empty.noResultsLead")}</p>
        ) : (
          <div className="caster-lib-tree-root">
            {folderTree.map((node) => (
              <LibTreeFolder
                key={node.id}
                node={node}
                title={node.folder.name}
                open={isNodeOpen(node)}
                dropTarget={dropTarget}
                activeKey={activeKey}
                focusKey={focusKey}
                draggingKey={draggingKey}
                isNodeOpen={isNodeOpen}
                onToggle={toggleExpanded}
                onFolderContextMenu={openFolderMenu}
                onOpenItem={openRow}
                onItemContextMenu={openItemMenu}
                onItemPointerDown={onItemPointerDown}
              />
            ))}
            {unfiledRows.length > 0 || draggingKey ? (
              <div
                className={cx(
                  "caster-lib-unfiled",
                  dropTarget === UNFILED_ID && "is-drop-target",
                  draggingKey && unfiledRows.length === 0 && "is-drop-lane",
                )}
                data-folder-drop-id={UNFILED_ID}
              >
                {unfiledRows.length === 0 && draggingKey ? (
                  <div className="caster-lib-unfiled-hint" aria-hidden>
                    {t("automations.row.noFolder")}
                  </div>
                ) : null}
                {unfiledRows.map((row) => (
                  <BoundLibItem
                    key={`${row.kind}:${row.id}`}
                    row={row}
                    activeKey={activeKey}
                    focusKey={focusKey}
                    draggingKey={draggingKey}
                    onOpen={openRow}
                    onContextMenu={openItemMenu}
                    onPointerDown={onItemPointerDown}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <ContextMenu
        open={ctxMenu.open && ctxItems.length > 0}
        x={ctxMenu.x}
        y={ctxMenu.y}
        items={ctxItems}
        onClose={ctxMenu.close}
        onSelect={(id) => {
          findMenuItem(ctxItems, id)?.onSelect?.();
        }}
        ariaLabel={t("shell.library.aria")}
      />

      {dragGhost ? (
        <div
          className="caster-lib-drag-ghost"
          style={{
            transform: `translate(${dragGhost.x + 12}px, ${dragGhost.y + 12}px)`,
          }}
          aria-hidden
        >
          {dragGhost.name}
        </div>
      ) : null}
    </div>
  );
}
