import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Code2,
  ExternalLink,
  Folder,
  FolderInput,
  FolderPlus,
  LayoutGrid,
  MousePointer2,
  PenLine,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { useT } from "../i18n";
import type { SettingsSection } from "../app/types";
import { useUnifiedAutomations } from "../automations/useUnifiedAutomations";
import { buildAutomationRowMenuItems } from "../automations/automationRowMenuItems";
import { automationRowMenuIcons } from "../automations/automationRowMenuIcons";
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
  BoundLibItem,
  KindIcon,
  LibDraftFolderRow,
  LibDraftItemRow,
  LibTreeFolder,
  type LibTreeFolderHandlers,
} from "./LibTreeNodes";
import {
  buildLibTree,
  buildNavigationEntries,
  cx,
  DRAFT_FOLDER_KEY,
  DRAFT_ITEM_KEY,
  filterBrowseRows,
  folderNavKey,
  matchesLibraryQuery,
  rowDomKey,
  UNFILED_ID,
  type LibScope,
  type LibTreeNode,
} from "./libTree";
import { useLibPointerDnd } from "./useLibPointerDnd";
import {
  useLibraryMutations,
  type ScriptCreateOpts,
} from "./useLibraryMutations";
import { libraryEmptyForBrowse, libraryEmptyForScope } from "./libraryEmpty";

export type LibraryCreateRequest = {
  kind: AutomationRow["kind"] | "folder";
  /** Bump to re-trigger the same kind. */
  nonce: number;
};

export type WorkspaceLibraryProps = {
  activeKey: string | null;
  refreshKey?: number;
  dirtyMacroId?: string | null;
  dirtyClickerId?: string | null;
  dirtyScriptId?: string | null;
  recentListMax?: number;
  confirmTrash?: boolean;
  confirmDeleteFolder?: boolean;
  /** External create (stage empty, Ctrl+N, tab bar) → inline draft in the tree. */
  createRequest?: LibraryCreateRequest | null;
  onOpen: (row: AutomationRow) => void;
  onCreateMacro?: () => void;
  onCreateClicker?: () => void;
  onCreateScript?: () => void;
  onRefresh?: () => void;
  onItemRenamed?: (
    kind: AutomationRow["kind"],
    id: string,
    newName: string,
  ) => void;
  onItemDeleted?: (kind: AutomationRow["kind"], id: string) => void;
  onOpenSettings?: (section?: SettingsSection) => void;
};

function buildFolderMenuItems(
  folder: AutomationFolderOption,
  t: (key: string) => string,
  actions: {
    renameFolder: (folder: AutomationFolderOption) => void;
    createFolder: (parentId: string | null) => void;
    createItem: (
      kind: AutomationRow["kind"],
      folderId: string | null,
    ) => void;
    deleteFolder: (folder: AutomationFolderOption) => void;
  },
): MenuItemDef[] {
  return [
    {
      id: "rename-folder",
      label: t("automations.menu.empty.renameFolder"),
      icon: <PenLine size={14} aria-hidden />,
      onSelect: () => void actions.renameFolder(folder),
    },
    {
      id: "new-subfolder",
      label: t("automations.menu.empty.newFolder"),
      icon: <FolderPlus size={14} aria-hidden />,
      onSelect: () => void actions.createFolder(folder.id),
    },
    { id: "sep-create-in", label: "", separator: true },
    {
      id: "new-macro-in",
      label: t("automations.create.macro"),
      icon: <Workflow size={14} aria-hidden />,
      onSelect: () => void actions.createItem("macro", folder.id),
    },
    {
      id: "new-clicker-in",
      label: t("automations.create.clicker"),
      icon: <MousePointer2 size={14} aria-hidden />,
      onSelect: () => void actions.createItem("clicker", folder.id),
    },
    {
      id: "new-script-in",
      label: t("automations.create.script"),
      icon: <Code2 size={14} aria-hidden />,
      onSelect: () => void actions.createItem("script", folder.id),
    },
    { id: "sep-f", label: "", separator: true },
    {
      id: "delete-folder",
      label: t("automations.confirm.deleteFolderTitle"),
      icon: <Trash2 size={14} aria-hidden />,
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
  createRequest = null,
  onOpen,
  onRefresh,
  onItemRenamed,
  onItemDeleted,
  onOpenSettings,
}: WorkspaceLibraryProps) {
  const t = useT();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [scope, setScope] = useState<LibScope>("all");
  const [kindFilter, setKindFilter] = useState<AutomationKindFilter>("all");

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "f") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Folders start collapsed; ids present here are expanded. */
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  /** Multi-selection (items only), values are `rowDomKey`. */
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const selectionAnchorRef = useRef<string | null>(null);
  const prevFocusKeyRef = useRef<string | null>(null);
  const curFocusKeyRef = useRef<string | null>(null);
  const clearSelection = useCallback(() => {
    setSelectedKeys((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);
  useEffect(() => {
    if (curFocusKeyRef.current !== focusKey) {
      prevFocusKeyRef.current = curFocusKeyRef.current;
      curFocusKeyRef.current = focusKey;
    }
  }, [focusKey]);
  const [ctxItems, setCtxItems] = useState<MenuItemDef[]>([]);
  const ctxMenu = useContextMenuState();
  const foldersRef = useRef<AutomationFolderOption[]>([]);
  const rowsRef = useRef<AutomationRow[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftFolder, setDraftFolder] = useState<{
    parentId: string | null;
  } | null>(null);
  const [draftRemountKey, setDraftRemountKey] = useState(0);
  const [draftItem, setDraftItem] = useState<{
    kind: AutomationRow["kind"];
    folderId: string | null;
    scriptOpts?: ScriptCreateOpts;
  } | null>(null);
  const [draftItemRemountKey, setDraftItemRemountKey] = useState(0);
  const moveRowRef = useRef<
    (
      row: AutomationRow,
      folder: AutomationFolderOption | null,
      beforeId?: string | null,
      beforeKind?: AutomationRow["kind"] | null,
    ) => Promise<void>
  >(async () => {});
  const moveFolderRef = useRef<
    (
      folder: AutomationFolderOption,
      parentId: string | null,
      beforeFolderId: string | null,
    ) => Promise<void>
  >(async () => {});

  const {
    allRows,
    folders,
    loading,
    refresh,
    captureSnapshot,
    applyLocalMove,
    replaceAutomationsSnapshot,
  } = useUnifiedAutomations({
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
  rowsRef.current = allRows;

  const bump = useCallback(() => {
    void refresh({ silent: true });
    onRefresh?.();
  }, [onRefresh, refresh]);

  const {
    dropTarget,
    dropIndicator,
    draggingKey,
    dragGhost,
    setDragCursorNode,
    onItemPointerDown,
    onFolderPointerDown,
    openRow: openRowFromDnd,
    shouldSuppressClick,
  } = useLibPointerDnd({
      foldersRef,
      rowsRef,
      onMoveItem: (row, folder, beforeId, beforeKind) =>
        moveRowRef.current(row, folder, beforeId, beforeKind),
      onMoveFolder: (folder, parentId, beforeFolderId) =>
        moveFolderRef.current(folder, parentId, beforeFolderId),
      onOpen,
    });

  const openRow = useCallback(
    (row: AutomationRow) => {
      setFocusKey(rowDomKey(row));
      openRowFromDnd(row);
    },
    [openRowFromDnd],
  );

  useEffect(() => {
    if (draggingKey) {
      clearSelection();
      setEditingKey(null);
      setDraftFolder(null);
      setDraftItem(null);
    }
  }, [clearSelection, draggingKey]);

  const toggleExpanded = useCallback((id: string) => {
    if (shouldSuppressClick()) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [shouldSuppressClick]);

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


  const { folders: folderTree, unfiled: unfiledRows } = useMemo(
    () =>
      buildLibTree(
        folders,
        allRows.filter(
          (r) => kindFilter === "all" || r.kind === kindFilter,
        ),
        matchQuery,
        Boolean(q),
      ),
    [folders, kindFilter, matchQuery, q, allRows],
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
  const navEntries = useMemo(
    () =>
      buildNavigationEntries({
        scope,
        favVisible,
        folderTree,
        unfiledRows,
        isNodeOpen,
      }),
    [favVisible, folderTree, isNodeOpen, scope, unfiledRows],
  );

  const {
    commitCreateFolder,
    commitCreateItem,
    promptScriptCreateOpts,
    startFolderRename,
    applyFolderRename,
    renameFolder,
    deleteFolder,
    startRowRename,
    applyRowRename,
    renameRow,
    duplicateRow,
    toggleFavorite,
    setLocked,
    deleteRow,
    deleteRows,
    moveRow,
    moveFolder,
    launchRow,
    revealRow,
    convertRow,
  } = useLibraryMutations({
    t,
    toast,
    bump,
    onOpen,
    onRefresh,
    onItemRenamed,
    onItemDeleted,
    confirmTrash,
    confirmDeleteFolder,
    captureSnapshot,
    applyLocalMove,
    replaceAutomationsSnapshot,
    setEditingKey,
  });
  moveRowRef.current = moveRow;
  moveFolderRef.current = moveFolder;

  /** Visible items (navEntries), in display order. */
  const visibleItemRows = useMemo(
    () => navEntries.flatMap((e) => (e.type === "item" ? [e.row] : [])),
    [navEntries],
  );

  /** Drop selected keys that are no longer visible (filter / collapse / delete). */
  useEffect(() => {
    setSelectedKeys((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(visibleItemRows.map(rowDomKey));
      let changed = false;
      const next = new Set<string>();
      for (const k of prev) {
        if (visible.has(k)) next.add(k);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visibleItemRows]);

  const selectedRows = useMemo(
    () => visibleItemRows.filter((r) => selectedKeys.has(rowDomKey(r))),
    [selectedKeys, visibleItemRows],
  );

  const activateRow = useCallback(
    (row: AutomationRow, e: MouseEvent) => {
      if (shouldSuppressClick()) return;
      const key = rowDomKey(row);
      if (e.ctrlKey || e.metaKey) {
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
        selectionAnchorRef.current = key;
        return;
      }
      if (e.shiftKey) {
        const itemKeys = visibleItemRows.map(rowDomKey);
        // Focus already moved to the clicked row on pointer down → use the previous one.
        const anchorCandidates = [
          selectionAnchorRef.current,
          focusKey !== key ? focusKey : prevFocusKeyRef.current,
          activeKey,
        ];
        const anchor =
          anchorCandidates.find((k) => k && itemKeys.includes(k)) ?? key;
        const a = itemKeys.indexOf(anchor);
        const b = itemKeys.indexOf(key);
        if (a < 0 || b < 0) return;
        const [from, to] = a <= b ? [a, b] : [b, a];
        setSelectedKeys(new Set(itemKeys.slice(from, to + 1)));
        selectionAnchorRef.current = anchor;
        return;
      }
      clearSelection();
      selectionAnchorRef.current = key;
      openRow(row);
    },
    [
      activeKey,
      clearSelection,
      focusKey,
      openRow,
      shouldSuppressClick,
      visibleItemRows,
    ],
  );

  const openSelected = useCallback(() => {
    const MAX_OPEN = 12;
    for (const row of selectedRows.slice(0, MAX_OPEN)) onOpen(row);
  }, [onOpen, selectedRows]);

  const moveSelected = useCallback(
    async (folder: AutomationFolderOption | null) => {
      const rows = selectedRows.filter(
        (r) => !r.locked && (r.folderId ?? null) !== (folder?.id ?? null),
      );
      clearSelection();
      for (const row of rows) {
        await moveRowRef.current(row, folder);
      }
    },
    [clearSelection, selectedRows],
  );

  const deleteSelected = useCallback(async () => {
    const ok = await deleteRows(selectedRows);
    if (ok) clearSelection();
  }, [clearSelection, deleteRows, selectedRows]);

  const clearDraftFolder = useCallback(() => {
    setDraftFolder(null);
    setEditingKey((key) => (key === DRAFT_FOLDER_KEY ? null : key));
  }, []);

  const clearDraftItem = useCallback(() => {
    setDraftItem(null);
    setEditingKey((key) => (key === DRAFT_ITEM_KEY ? null : key));
  }, []);

  const startCreateFolder = useCallback((parentId: string | null) => {
    clearSelection();
    setDraftItem(null);
    if (parentId) {
      setExpanded((prev) => {
        if (prev.has(parentId)) return prev;
        const next = new Set(prev);
        next.add(parentId);
        return next;
      });
    }
    setDraftFolder({ parentId });
    setDraftRemountKey((n) => n + 1);
    setEditingKey(DRAFT_FOLDER_KEY);
    setFocusKey(DRAFT_FOLDER_KEY);
  }, [clearSelection]);

  const startCreateItem = useCallback(
    async (kind: AutomationRow["kind"], folderId: string | null) => {
      let scriptOpts: ScriptCreateOpts | undefined;
      if (kind === "script") {
        const opts = await promptScriptCreateOpts();
        if (!opts) return;
        scriptOpts = opts;
      }
      clearSelection();
      setDraftFolder(null);
      if (folderId) {
        setExpanded((prev) => {
          if (prev.has(folderId)) return prev;
          const next = new Set(prev);
          next.add(folderId);
          return next;
        });
      }
      setDraftItem({ kind, folderId, scriptOpts });
      setDraftItemRemountKey((n) => n + 1);
      setEditingKey(DRAFT_ITEM_KEY);
      setFocusKey(DRAFT_ITEM_KEY);
    },
    [clearSelection, promptScriptCreateOpts],
  );

  const onCommitDraftFolder = useCallback(
    async (raw: string) => {
      if (!draftFolder) return;
      const name = raw.trim();
      if (!name) {
        clearDraftFolder();
        return;
      }
      const focus = await commitCreateFolder(draftFolder.parentId, name);
      if (focus) {
        clearDraftFolder();
        setFocusKey(focus);
        return;
      }
      setEditingKey(DRAFT_FOLDER_KEY);
      setDraftRemountKey((n) => n + 1);
    },
    [clearDraftFolder, commitCreateFolder, draftFolder],
  );

  const onCommitDraftItem = useCallback(
    async (raw: string) => {
      if (!draftItem) return;
      const name = raw.trim();
      if (!name) {
        clearDraftItem();
        return;
      }
      const focus = await commitCreateItem(
        draftItem.kind,
        name,
        draftItem.folderId,
        draftItem.scriptOpts,
      );
      if (focus) {
        clearDraftItem();
        setFocusKey(focus);
        return;
      }
      setEditingKey(DRAFT_ITEM_KEY);
      setDraftItemRemountKey((n) => n + 1);
    },
    [clearDraftItem, commitCreateItem, draftItem],
  );

  const createRequestNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!createRequest) return;
    if (createRequestNonceRef.current === createRequest.nonce) return;
    createRequestNonceRef.current = createRequest.nonce;
    if (createRequest.kind === "folder") {
      startCreateFolder(null);
      return;
    }
    void startCreateItem(createRequest.kind, null);
  }, [createRequest, startCreateFolder, startCreateItem]);

  const focusedFolder = useMemo(() => {
    if (!focusKey?.startsWith("folder:")) return null;
    const id = focusKey.slice("folder:".length);
    if (id === "__draft__") return null;
    return folders.find((f) => f.id === id) ?? null;
  }, [focusKey, folders]);

  const draftAriaLabel = t("automations.confirm.createFolderTitle");
  const draftFolderInitialName = t("automations.folder.create");
  const draftItemAriaLabel =
    draftItem?.kind === "clicker"
      ? t("automations.create.clicker")
      : draftItem?.kind === "script"
        ? t("automations.create.script")
        : t("automations.create.macro");
  const draftItemInitialName =
    draftItem?.kind === "clicker"
      ? t("shell.newClicker")
      : draftItem?.kind === "script"
        ? t("shell.newScriptName")
        : t("shell.newMacro");

  const createMenuItems: MenuItemDef[] = [
    {
      id: "folder",
      label: focusedFolder
        ? t("automations.folder.createChild")
        : t("automations.folder.create"),
      icon: <FolderPlus size={14} aria-hidden />,
      onSelect: () => startCreateFolder(focusedFolder?.id ?? null),
    },
    { id: "sep-create", label: "", separator: true },
    {
      id: "macro",
      label: t("automations.create.macro"),
      icon: <Workflow size={14} aria-hidden />,
      onSelect: () =>
        void startCreateItem("macro", focusedFolder?.id ?? null),
    },
    {
      id: "clicker",
      label: t("automations.create.clicker"),
      icon: <MousePointer2 size={14} aria-hidden />,
      onSelect: () =>
        void startCreateItem("clicker", focusedFolder?.id ?? null),
    },
    {
      id: "script",
      label: t("automations.create.script"),
      icon: <Code2 size={14} aria-hidden />,
      onSelect: () =>
        void startCreateItem("script", focusedFolder?.id ?? null),
    },
  ];


  function openItemMenu(e: MouseEvent, row: AutomationRow) {
    e.preventDefault();
    e.stopPropagation();
    const items = buildAutomationRowMenuItems(row, t, {
      onOpen: () => onOpen(row),
      onLaunch: () => void launchRow(row),
      onRename: () => void renameRow(row),
      onDuplicate: () => void duplicateRow(row),
      onToggleFavorite: () => void toggleFavorite(row),
      onLock: () => void setLocked(row, true),
      onUnlock: () => void setLocked(row, false),
      onReveal: () => void revealRow(row),
      moveFolders: folders,
      onMoveToFolder: (folder) => void moveRow(row, folder),
      onConvertTo: (toKind) => void convertRow(row, toKind),
      onDelete: () => void deleteRow(row),
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
        createFolder: startCreateFolder,
        createItem: (kind, folderId) => void startCreateItem(kind, folderId),
        deleteFolder,
      }),
    );
    ctxMenu.openFromEvent(e);
  }

  const selectionMoveItems: MenuItemDef[] = [
    {
      id: "move-root",
      label: t("automations.menu.row.noFolder"),
      icon: <Folder size={14} aria-hidden />,
      onSelect: () => void moveSelected(null),
    },
    ...folders.map((f) => ({
      id: `move-${f.id}`,
      label: f.name,
      icon: <Folder size={14} aria-hidden />,
      onSelect: () => void moveSelected(f),
    })),
  ];

  const treeHandlers: LibTreeFolderHandlers = {
    onToggle: toggleExpanded,
    onFolderContextMenu: openFolderMenu,
    onFolderPointerDown,
    onStartFolderRename: startFolderRename,
    onCommitFolderRename: applyFolderRename,
    onCancelRename: () => setEditingKey(null),
    onFocusFolder: (f) => setFocusKey(folderNavKey(f.id)),
    onOpenItem: openRow,
    onActivateItem: activateRow,
    onItemContextMenu: openItemMenu,
    onItemPointerDown,
    onStartItemRename: startRowRename,
    onCommitItemRename: applyRowRename,
    onFocusItem: (r) => setFocusKey(rowDomKey(r)),
  };

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
    setScope((cur) => (cur === next ? "all" : next));
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
    selectionAnchorRef.current = null;
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-nav-key="${CSS.escape(next.key)}"]`)
        ?.focus({ preventScroll: false });
    });
  }

  function resolveNavKey(): string | null {
    if (focusKey) return focusKey;
    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLElement) {
      const fromDom = activeEl.closest("[data-nav-key]")?.getAttribute("data-nav-key");
      if (fromDom) return fromDom;
    }
    return activeKey;
  }

  function onTreeKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (editingKey) return;
    if (e.key === "Escape" && selectedKeys.size > 0) {
      e.preventDefault();
      clearSelection();
      return;
    }
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
    const navKey = resolveNavKey();
    if (!navKey) return;
    const entry = navEntries.find((n) => n.key === navKey);
    if (!entry) return;
    if (navKey !== focusKey) setFocusKey(navKey);
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
      return;
    }
    if (e.key === "F2") {
      e.preventDefault();
      if (entry.type === "folder") startFolderRename(entry.node.folder);
      else if (!entry.row.locked) startRowRename(entry.row);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (entry.type === "folder") void deleteFolder(entry.node.folder);
      else if (!entry.row.locked) void deleteRow(entry.row);
    }
  }

  type FilterChip =
    | { id: "kind"; kind: AutomationKindFilter; label: string; icon: ReactNode }
    | { id: "scope"; scope: Exclude<LibScope, "all">; label: string; icon: ReactNode };

  const filterChips: FilterChip[] = [
    {
      id: "kind",
      kind: "all",
      label: t("automations.filter.kindAll"),
      icon: <LayoutGrid size={16} aria-hidden />,
    },
    {
      id: "kind",
      kind: "macro",
      label: t("automations.filter.kindMacro"),
      icon: <Workflow size={16} aria-hidden />,
    },
    {
      id: "kind",
      kind: "clicker",
      label: t("automations.filter.kindClicker"),
      icon: <MousePointer2 size={16} aria-hidden />,
    },
    {
      id: "kind",
      kind: "script",
      label: t("automations.filter.kindScript"),
      icon: <Code2 size={16} aria-hidden />,
    },
    {
      id: "scope",
      scope: "favorites",
      label: t("automations.filter.favorites"),
      icon: <Star size={16} aria-hidden />,
    },
  ];

  const emptyForScopeList = () =>
    libraryEmptyForScope({
      t,
      query,
      scope,
      onClearSearch: () => setQuery(""),
      onSeeAll: () => selectKind("all"),
    });

  const emptyForBrowse = () =>
    libraryEmptyForBrowse({
      t,
      query,
      kindFilter,
      allRowsLength: allRows.length,
      onClearSearch: () => setQuery(""),
      onClearKind: () => selectKind("all"),
    });

  function renderItemList(list: AutomationRow[]) {
    if (list.length === 0) {
      return emptyForScopeList();
    }
    return list.map((row) => (
      <BoundLibItem
        key={`${row.kind}:${row.id}`}
        row={row}
        activeKey={activeKey}
        focusKey={focusKey}
        draggingKey={draggingKey}
        dropIndicator={dropIndicator}
        editingKey={editingKey}
        selectedKeys={selectedKeys}
        onOpen={openRow}
        onActivate={activateRow}
        onContextMenu={openItemMenu}
        onPointerDown={onItemPointerDown}
        onStartRename={startRowRename}
        onCommitRename={applyRowRename}
        onCancelRename={() => setEditingKey(null)}
        onFocusRow={(r) => setFocusKey(rowDomKey(r))}
      />
    ));
  }

  return (
    <div
      className={cx(
        "caster-workspace-library",
        draggingKey && "is-lib-dragging",
      )}
      onContextMenu={openEmptyMenu}
    >
      <header className="caster-lib-brand">
        <span className="caster-lib-brand-mark" aria-hidden>
          C
        </span>
        <span className="caster-lib-brand-name">Caster</span>
      </header>

      <div className="caster-lib-chrome">
        <label className="caster-lib-search caster-lib-search--full">
          <Search size={12} aria-hidden className="caster-lib-search-icon" />
          <input
            ref={searchInputRef}
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
          ) : (
            <kbd className="caster-lib-search-hint" aria-hidden>
              Ctrl+F
            </kbd>
          )}
        </label>

        <div
          className="caster-lib-kind-strip"
          role="group"
          aria-label={t("automations.filter.kindAria")}
        >
          {filterChips.map((chip) => {
            const active =
              chip.id === "kind"
                ? scope === "all" && kindFilter === chip.kind
                : scope === chip.scope;
            const key =
              chip.id === "kind" ? `kind:${chip.kind}` : `scope:${chip.scope}`;
            return (
              <Tooltip key={key} content={chip.label} side="bottom">
                <button
                  type="button"
                  className={cx("caster-lib-chip", active && "is-active")}
                  aria-pressed={active}
                  aria-label={chip.label}
                  onClick={() => {
                    if (chip.id === "kind") selectKind(chip.kind);
                    else selectScope(chip.scope);
                  }}
                >
                  {chip.icon}
                </button>
              </Tooltip>
            );
          })}
        </div>

        {scope === "all" ? (
          <div className="caster-lib-folders-band caster-lib-folders-band--slim">
            <span className="caster-lib-folders-title">
              {t("automations.folder.manageLabel")}
            </span>
            <DropdownMenu
              label={t("automations.create.label")}
              ariaLabel={t("automations.create.aria")}
              align="end"
              triggerClassName="caster-lib-chip caster-lib-chip--ghost"
              items={createMenuItems}
            >
              <Plus size={15} aria-hidden strokeWidth={1.75} />
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      <div
        className="caster-lib-tree"
        role="tree"
        tabIndex={0}
        aria-busy={loading || undefined}
        aria-label={t("shell.library.aria")}
        onKeyDown={onTreeKeyDown}
      >
        <div className="caster-lib-tree-root">
          {scope === "favorites" ? (
            renderItemList(favVisible)
          ) : folderTree.length === 0 &&
            unfiledRows.length === 0 &&
            !draftFolder &&
            !draftItem ? (
            emptyForBrowse()
          ) : (
            <>
              {folderTree.map((node) => (
                <LibTreeFolder
                  key={node.id}
                  node={node}
                  title={node.folder.name}
                  open={isNodeOpen(node)}
                  dropTarget={dropTarget}
                  dropIndicator={dropIndicator}
                  activeKey={activeKey}
                  focusKey={focusKey}
                  draggingKey={draggingKey}
                  editingKey={editingKey}
                  selectedKeys={selectedKeys}
                  isNodeOpen={isNodeOpen}
                  handlers={treeHandlers}
                  draftFolder={draftFolder}
                  draftNavKey={DRAFT_FOLDER_KEY}
                  draftAriaLabel={draftAriaLabel}
                  draftFolderInitialName={draftFolderInitialName}
                  draftRemountKey={draftRemountKey}
                  onCommitDraft={(name) => void onCommitDraftFolder(name)}
                  onCancelDraft={clearDraftFolder}
                  draftItem={draftItem}
                  draftItemNavKey={DRAFT_ITEM_KEY}
                  draftItemAriaLabel={draftItemAriaLabel}
                  draftItemInitialName={draftItemInitialName}
                  draftItemRemountKey={draftItemRemountKey}
                  onCommitDraftItem={(name) => void onCommitDraftItem(name)}
                  onCancelDraftItem={clearDraftItem}
                />
              ))}
              {draftFolder?.parentId === null ? (
                <LibDraftFolderRow
                  navKey={DRAFT_FOLDER_KEY}
                  focused={focusKey === DRAFT_FOLDER_KEY}
                  ariaLabel={draftAriaLabel}
                  initialName={draftFolderInitialName}
                  remountKey={draftRemountKey}
                  onCommit={(name) => void onCommitDraftFolder(name)}
                  onCancel={clearDraftFolder}
                />
              ) : null}
              {unfiledRows.length > 0 ||
              draggingKey ||
              draftItem?.folderId === null ? (
                <div
                  className={cx(
                    "caster-lib-unfiled",
                    dropTarget === UNFILED_ID && "is-drop-target",
                    draggingKey && unfiledRows.length === 0 && "is-drop-lane",
                  )}
                  data-folder-drop-id={UNFILED_ID}
                >
                  {unfiledRows.length === 0 &&
                  draggingKey &&
                  draftItem?.folderId !== null ? (
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
                      dropIndicator={dropIndicator}
                      editingKey={editingKey}
                      selectedKeys={selectedKeys}
                      onOpen={openRow}
                      onActivate={activateRow}
                      onContextMenu={openItemMenu}
                      onPointerDown={onItemPointerDown}
                      onStartRename={startRowRename}
                      onCommitRename={applyRowRename}
                      onCancelRename={() => setEditingKey(null)}
                      onFocusRow={(r) => setFocusKey(rowDomKey(r))}
                    />
                  ))}
                  {draftItem?.folderId === null ? (
                    <LibDraftItemRow
                      kind={draftItem.kind}
                      navKey={DRAFT_ITEM_KEY}
                      focused={focusKey === DRAFT_ITEM_KEY}
                      ariaLabel={draftItemAriaLabel}
                      initialName={draftItemInitialName}
                      remountKey={draftItemRemountKey}
                      onCommit={(name) => void onCommitDraftItem(name)}
                      onCancel={clearDraftItem}
                    />
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
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

      {dragGhost
        ? createPortal(
            <div
              ref={setDragCursorNode}
              className="caster-lib-drag-cursor"
              aria-hidden
            >
              {dragGhost.type === "folder" ? (
                <Folder size={14} aria-hidden />
              ) : (
                <KindIcon kind={dragGhost.kind} />
              )}
            </div>,
            document.body,
          )
        : null}

      {selectedKeys.size >= 1 ? (
        <div
          className="caster-lib-selection-dock"
          role="toolbar"
          aria-label={t("automations.selection.aria")}
          onContextMenu={(e) => e.stopPropagation()}
        >
          <span className="caster-lib-selection-count">
            {t(
              selectedKeys.size === 1
                ? "automations.selection.countOne"
                : "automations.selection.countMany",
              { count: selectedKeys.size },
            )}
          </span>
          <div className="caster-lib-selection-actions">
            <Tooltip
              content={
                selectedRows.length > 1
                  ? t("automations.selection.openAll", {
                      count: Math.min(selectedRows.length, 12),
                    })
                  : t("automations.selection.open")
              }
              side="top"
            >
              <button
                type="button"
                className="caster-lib-chip caster-lib-selection-btn"
                aria-label={t("automations.selection.open")}
                onClick={openSelected}
              >
                <ExternalLink size={14} aria-hidden />
              </button>
            </Tooltip>
            <DropdownMenu
              label={t("automations.selection.move")}
              ariaLabel={t("automations.selection.folderAria")}
              align="end"
              triggerClassName="caster-lib-chip caster-lib-selection-btn"
              items={selectionMoveItems}
            >
              <FolderInput size={14} aria-hidden />
            </DropdownMenu>
            <Tooltip content={t("automations.confirm.deleteTitle")} side="top">
              <button
                type="button"
                className="caster-lib-chip caster-lib-selection-btn is-danger"
                aria-label={t("automations.confirm.deleteTitle")}
                onClick={() => void deleteSelected()}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </Tooltip>
            <Tooltip content={t("automations.selection.clear")} side="top">
              <button
                type="button"
                className="caster-lib-chip caster-lib-selection-btn"
                aria-label={t("automations.selection.clear")}
                onClick={clearSelection}
              >
                <X size={14} aria-hidden />
              </button>
            </Tooltip>
          </div>
        </div>
      ) : null}

      <footer className="caster-lib-footer">
        <div className="caster-lib-footer-user">
          <span className="caster-lib-footer-avatar" aria-hidden>
            {t("shell.account.name").charAt(0).toUpperCase()}
          </span>
          <span className="caster-lib-footer-user-text">
            <span className="caster-lib-footer-user-name">
              {t("shell.account.name")}
            </span>
            <span className="caster-lib-footer-user-meta">
              {t("shell.brandTagline")}
            </span>
          </span>
          {onOpenSettings ? (
            <Tooltip content={t("shell.navSettings")} side="top">
              <button
                type="button"
                className="caster-lib-footer-settings"
                aria-label={t("shell.navSettings")}
                onClick={() => onOpenSettings("application")}
                onContextMenu={(e) => e.stopPropagation()}
              >
                <Settings size={15} aria-hidden strokeWidth={1.75} />
              </button>
            </Tooltip>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
