import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ChevronDown,
  Code2,
  Folder,
  FolderPlus,
  Lock,
  LockOpen,
  MoreHorizontal,
  MousePointer2,
  PenLine,
  Play,
  RefreshCw,
  Star,
  Trash2,
  Workflow,
} from "lucide-react";
import {
  ContextMenu,
  DropdownMenu,
  EmptyState,
  findMenuItem,
  Tooltip,
  TruncatedTooltip,
  useContextMenuState,
  useToast,
} from "../ui/shell";
import { confirmAction, promptAction } from "../ui";
import type { AppRoute } from "../app/types";
import { useLocale, useT, type TFunction } from "../i18n";
import type { ScriptDoc } from "../scripts/types";
import { newScriptId } from "../scripts/ScriptEditorView";
import {
  humanizeScriptError,
} from "../scripts/humanizeScriptError";
import {
  applyAccueilOrder,
  beforeKeyForEndOfFolder,
  loadAccueilOrder,
  mergeAccueilOrder,
  nearestSameKindBeforeId,
  reorderAccueilKeys,
  rowOrderKey,
  saveAccueilOrder,
} from "./accueilOrder";
import { AutomationRowMenu } from "./AutomationRowMenu";
import { AutomationsToolbar } from "./AutomationsToolbar";
import { buildAutomationRowMenuItems } from "./automationRowMenuItems";
import { automationRowMenuIcons } from "./automationRowMenuIcons";
import {
  commonConvertTargets,
  convertBatchSummaryMessage,
  convertSuccessMessage,
  runLibraryConvert,
  runLibraryConvertBatch,
} from "./convertLibraryItem";
import {
  mergeAccueilPrefs,
  mergeAutomationPrefs,
  mergeScriptsPrefs,
  type AccueilPrefs,
  type ScriptsPrefs,
} from "../settings/settingsTypes";
import {
  favoriteTooltip,
  kindTooltip,
  metaTooltip,
  rowSubtitle,
  statusTooltip,
} from "./rowLabels";
import {
  COLLAPSED_SECTIONS_KEY,
  folderOptionKey,
  statusToPill,
  type AutomationFilter,
  type AutomationFolderOption,
  type AutomationRow,
  type DisplayOptions,
} from "./types";
import {
  useAccueilDnd,
  type AccueilDropIntent,
} from "./useAccueilDnd";
import { useAccueilUndo } from "./useAccueilUndo";
import { useUnifiedAutomations } from "./useUnifiedAutomations";

type Props = {
  onNavigate: (route: AppRoute) => void;
  onCreateMacro: () => void;
  onCreateClicker: () => void;
  onCreateScript: () => void;
  onLaunchMacro?: (name: string) => void;
  onLaunchClicker?: (name: string) => void;
  dirtyMacroId?: string | null;
  dirtyClickerId?: string | null;
  dirtyScriptId?: string | null;
  refreshKey?: number;
  query: string;
  onQueryChange: (q: string) => void;
  filter: AutomationFilter;
  display: DisplayOptions;
  onDisplayChange: (d: DisplayOptions) => void;
  onFilterChange?: (f: AutomationFilter) => void;
  onRefresh?: () => void;
  /** Sync open document tabs when Accueil renames a resource. */
  onResourceRenamed?: (
    kind: AutomationRow["kind"],
    fromId: string,
    toId: string,
    label: string,
  ) => void;
  /** Active script session name (from engine status). */
  runningScriptName?: string | null;
  /** Notify parent of focused Accueil row (`kind:id`). */
  onFocusKeyChange?: (key: string | null) => void;
  onLaunchFocusJournal?: () => void;
  scriptsPrefs?: ScriptsPrefs;
  accueilPrefs?: AccueilPrefs;
  onOpenSettings?: () => void;
};

function rowKey(r: AutomationRow): string {
  return rowOrderKey(r);
}

function kindLabel(kind: AutomationRow["kind"], t: TFunction): string {
  if (kind === "macro") return t("automations.row.kindMacro");
  if (kind === "script") return t("automations.row.kindScript");
  return t("automations.row.kindClicker");
}

function loadCollapsedSections(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

const KindIcon = memo(function KindIcon({ row }: { row: AutomationRow }) {
  const t = useT();
  const tip = kindTooltip(row, t);
  const Icon =
    row.kind === "macro"
      ? Workflow
      : row.kind === "script"
        ? Code2
        : MousePointer2;
  return (
    <Tooltip content={tip}>
      <span className={`caster-auto-kind caster-auto-kind--${row.kind}`} tabIndex={0}>
        <Icon size={16} aria-hidden />
      </span>
    </Tooltip>
  );
});

async function deleteRow(r: AutomationRow): Promise<void> {
  await invoke("trash_library_item_cmd", { kind: r.kind, id: r.id });
}

function errMessage(e: unknown, fallback: string): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message?: unknown }).message);
  }
  return fallback;
}

export function AutomationsTable({
  onNavigate,
  onCreateMacro,
  onCreateClicker,
  onCreateScript,
  onLaunchMacro,
  onLaunchClicker,
  dirtyMacroId,
  dirtyClickerId,
  dirtyScriptId,
  refreshKey,
  query,
  onQueryChange,
  filter,
  display,
  onDisplayChange,
  onFilterChange,
  onRefresh,
  onResourceRenamed,
  runningScriptName = null,
  onFocusKeyChange,
  onLaunchFocusJournal,
  scriptsPrefs: scriptsPrefsProp,
  accueilPrefs: accueilPrefsProp,
  onOpenSettings: _onOpenSettings,
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const empty = t("common.empty");
  const accueilPrefs = mergeAccueilPrefs(accueilPrefsProp);
  const automationPrefs = mergeAutomationPrefs();
  const scriptsPrefs = mergeScriptsPrefs(scriptsPrefsProp);
  const toast = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const { rows, folders, counts, loading, refresh } = useUnifiedAutomations({
    dirtyMacroId,
    dirtyClickerId,
    dirtyScriptId,
    refreshKey,
    query,
    filter,
  });
  const afterUndoRef = useRef(async () => {
    await refresh({ silent: true });
    onRefresh?.();
  });
  afterUndoRef.current = async () => {
    await refresh({ silent: true });
    onRefresh?.();
  };
  const accueilUndo = useAccueilUndo({
    onAfterUndo: () => afterUndoRef.current(),
  });
  const undoToast = useCallback(
    (message: string) => {
      toast.success(message, {
        action: {
          label: t("automations.toast.undo"),
          onClick: () => {
            void accueilUndo.undo().catch(() => {
              toast.error(t("automations.toast.undoFail"));
            });
          },
        },
      });
    },
    [accueilUndo, t, toast],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () =>
      accueilPrefs.rememberCollapsedSections
        ? loadCollapsedSections()
        : new Set(),
  );
  const [liveSession, setLiveSession] = useState<{
    kind: string;
    name: string;
  } | null>(
    runningScriptName
      ? { kind: "script", name: runningScriptName }
      : null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const [focusKey, setFocusKeyState] = useState<string | null>(null);
  const setFocusKey = (key: string | null) => {
    setFocusKeyState(key);
    onFocusKeyChange?.(key);
  };
  const ctxMenu = useContextMenuState();
  const [ctxRow, setCtxRow] = useState<AutomationRow | null>(null);
  const emptyCtx = useContextMenuState();
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const sortedRef = useRef<AutomationRow[]>([]);
  const foldersRef = useRef(folders);
  const displayRef = useRef(display);
  const sortByRef = useRef(display.sortBy);
  displayRef.current = display;
  sortByRef.current = display.sortBy;
  foldersRef.current = folders;

  const [manualOrder, setManualOrder] = useState<string[]>([]);
  const manualOrderRef = useRef(manualOrder);
  manualOrderRef.current = manualOrder;

  /** Optimistic folder membership until silent refresh reconciles. */
  const [folderOverrides, setFolderOverrides] = useState<
    Map<string, { folderId: string | null; folderLabel: string }>
  >(() => new Map());

  useEffect(() => {
    let cancelled = false;
    void loadAccueilOrder().then((keys) => {
      if (!cancelled) setManualOrder(keys);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureOrderSort = useCallback(() => {
    if (displayRef.current.sortBy !== "order") {
      onDisplayChange({
        ...displayRef.current,
        sortBy: "order",
        sortDir: "asc",
      });
    }
  }, [onDisplayChange]);

  const applyOptimisticOrder = useCallback(
    (fromKey: string, beforeKey: string | null) => {
      const presentKeys = sortedRef.current.map(rowOrderKey);
      const base = mergeAccueilOrder(manualOrderRef.current, presentKeys);
      const next = reorderAccueilKeys(base, fromKey, beforeKey);
      if (!next) return null;
      manualOrderRef.current = next;
      setManualOrder(next);
      void saveAccueilOrder(next);
      ensureOrderSort();
      return next;
    },
    [ensureOrderSort],
  );

  const applyOptimisticFolder = useCallback(
    (r: AutomationRow, folder: AutomationFolderOption | null) => {
      const key = rowOrderKey(r);
      const folderId = folder?.id ?? null;
      const folderLabel = folder?.name ?? t("common.empty");
      setFolderOverrides((prev) => {
        const next = new Map(prev);
        next.set(key, { folderId, folderLabel });
        return next;
      });

      const fromKey = key;
      const presentKeys = sortedRef.current.map(rowOrderKey);
      const base = mergeAccueilOrder(manualOrderRef.current, presentKeys);
      const projected = sortedRef.current.map((row) =>
        rowOrderKey(row) === fromKey ? { ...row, folderId } : row,
      );
      const beforeKey = folder
        ? beforeKeyForEndOfFolder(
            base,
            projected,
            fromKey,
            folder.id,
            foldersRef.current.map((f) => f.id),
          )
        : null;
      applyOptimisticOrder(fromKey, beforeKey);
    },
    [applyOptimisticOrder, t],
  );

  const commitAccueilDrop = useCallback(
    async (intent: AccueilDropIntent) => {
      const { row } = intent;
      try {
        if (intent.type === "move-folder") {
          const folder =
            foldersRef.current.find((f) => f.id === intent.folderId) ?? null;
          if (!folder) return;
          applyOptimisticFolder(row, folder);
          await invoke("move_library_item_cmd", {
            kind: row.kind,
            id: row.id,
            folderId: folder.id,
            beforeId: null,
          });
          await refresh({ silent: true });
          setFolderOverrides(new Map());
          onRefresh?.();
          accueilUndo.push({
            type: "move-item",
            kind: row.kind,
            id: row.id,
            fromFolderId: row.folderId ?? null,
            toFolderId: folder.id,
            label: row.name,
          });
          undoToast(t("automations.toast.moved"));
          return;
        }

        if (intent.type === "unfile") {
          applyOptimisticFolder(row, null);
          await invoke("move_library_item_cmd", {
            kind: row.kind,
            id: row.id,
            folderId: null,
            beforeId: null,
          });
          await refresh({ silent: true });
          setFolderOverrides(new Map());
          onRefresh?.();
          accueilUndo.push({
            type: "move-item",
            kind: row.kind,
            id: row.id,
            fromFolderId: row.folderId ?? null,
            toFolderId: null,
            label: row.name,
          });
          undoToast(t("automations.toast.moved"));
          return;
        }

        // reorder
        if (intent.unfile) {
          applyOptimisticFolder(row, null);
          await invoke("move_library_item_cmd", {
            kind: row.kind,
            id: row.id,
            folderId: null,
            beforeId: null,
          });
        } else if (intent.folderId) {
          const folder =
            foldersRef.current.find((f) => f.id === intent.folderId) ?? null;
          if (folder) {
            applyOptimisticFolder(row, folder);
            await invoke("move_library_item_cmd", {
              kind: row.kind,
              id: row.id,
              folderId: folder.id,
              beforeId: null,
            });
          }
        }

        const fromKey = rowOrderKey(row);
        const next = applyOptimisticOrder(fromKey, intent.beforeKey);
        if (next && accueilPrefs.syncLibrarySortOnReorder) {
          const beforeId = nearestSameKindBeforeId(next, fromKey, row.kind);
          const folderId = intent.unfile
            ? null
            : (intent.folderId ?? row.folderId ?? null);
          try {
            await invoke("move_library_item_cmd", {
              kind: row.kind,
              id: row.id,
              folderId,
              beforeId,
            });
          } catch {
            /* Accueil order already saved; library sync best-effort */
          }
        }

        await refresh({ silent: true });
        setFolderOverrides(new Map());
        onRefresh?.();
        if (intent.unfile || intent.folderId) {
          accueilUndo.push({
            type: "move-item",
            kind: row.kind,
            id: row.id,
            fromFolderId: row.folderId ?? null,
            toFolderId: intent.unfile
              ? null
              : (intent.folderId ?? row.folderId ?? null),
            label: row.name,
          });
          undoToast(t("automations.toast.moved"));
        } else {
          toast.success(t("automations.toast.orderUpdated"));
        }
      } catch (e) {
        setFolderOverrides(new Map());
        await refresh({ silent: true });
        toast.error(errMessage(e, t("automations.toast.moveFail")));
      }
    },
    [
      accueilPrefs.syncLibrarySortOnReorder,
      accueilUndo,
      applyOptimisticFolder,
      applyOptimisticOrder,
      onRefresh,
      refresh,
      t,
      toast,
      undoToast,
    ],
  );

  const {
    dragRow,
    dropFolderKey,
    dropEdge,
    dragGhost,
    armedRef: folderDragArmedRef,
    suppressClickRef: suppressClickAfterDragRef,
    onRowPointerDown,
    clearDrag: clearFolderDrag,
  } = useAccueilDnd({
    listScrollRef,
    sortedRef,
    sortByRef,
    dragThresholdPx: accueilPrefs.dragThresholdPx,
    onCommit: (intent) => {
      void commitAccueilDrop(intent);
    },
  });

  useEffect(() => {
    if (!accueilPrefs.rememberCollapsedSections) return;
    try {
      localStorage.setItem(
        COLLAPSED_SECTIONS_KEY,
        JSON.stringify([...collapsedSections]),
      );
    } catch {
      /* ignore quota */
    }
  }, [collapsedSections, accueilPrefs.rememberCollapsedSections]);

  useEffect(() => {
    setLiveSession(
      runningScriptName
        ? { kind: "script", name: runningScriptName }
        : null,
    );
  }, [runningScriptName]);

  useEffect(() => {
    let un: (() => void) | undefined;
    let prevBusy = false;
    void listen<{
      state?: string;
      sessionKind?: string | null;
      sessionName?: string | null;
    }>("engine://status", (e) => {
      const busy =
        e.payload.state === "running" || e.payload.state === "paused";
      const kind = e.payload.sessionKind ?? null;
      const name = e.payload.sessionName ?? null;
      if (busy && kind && name) {
        setLiveSession({ kind, name });
      } else if (!busy) {
        setLiveSession(null);
      }
      if (prevBusy && !busy) {
        void refresh();
        onRefresh?.();
      }
      prevBusy = busy;
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, [onRefresh, refresh]);

  async function onToggleFavorite(r: AutomationRow, ev?: MouseEvent) {
    ev?.stopPropagation();
    const favorite = !r.favorite;
    try {
      await invoke("set_quick_favorite", {
        kind: r.kind,
        id: r.id,
        favorite,
      });
      await refresh();
      onRefresh?.();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.favoriteFail")));
    }
  }

  async function launchRow(r: AutomationRow) {
    if (r.kind === "script" && r.isModule) {
      toast.error(t("automations.toast.scriptModuleBlocked"));
      return;
    }
    if (automationPrefs.confirmLaunchFromHome) {
      const ok = await confirmAction({
        title: t("automations.confirm.launchTitle"),
        message: t("automations.confirm.launchMessage", { name: r.name }),
        confirmLabel: t("automations.confirm.launchConfirm"),
      });
      if (!ok) return;
    }
    if (r.kind === "macro") {
      onLaunchMacro?.(r.id);
      onLaunchFocusJournal?.();
      return;
    }
    if (r.kind === "clicker") {
      onLaunchClicker?.(r.id);
      onLaunchFocusJournal?.();
      return;
    }
    try {
      await invoke("run_script_session_cmd", { id: r.id });
      toast.success(t("automations.toast.scriptLaunched", { name: r.name }));
      onLaunchFocusJournal?.();
      // last-run finalized on engine://status busy→idle
    } catch (e) {
      const raw = typeof e === "string" ? e : String(e);
      const msg = humanizeScriptError(raw, t);
      toast.error(msg);
    }
  }

  const sorted = useMemo(() => {
    let baseRows = rows;
    if (filter === "all" && !accueilPrefs.showScriptsInAll) {
      baseRows = baseRows.filter((r) => r.kind !== "script");
    }
    if (!accueilPrefs.showModulesInAll) {
      baseRows = baseRows.filter((r) => !(r.kind === "script" && r.isModule));
    }
    if (accueilPrefs.hideScriptLanguages.length > 0) {
      baseRows = baseRows.filter(
        (r) =>
          r.kind !== "script" ||
          !r.scriptLanguage ||
          !accueilPrefs.hideScriptLanguages.includes(r.scriptLanguage),
      );
    }
    if (folderOverrides.size > 0) {
      baseRows = baseRows.map((r) => {
        const ov = folderOverrides.get(rowOrderKey(r));
        if (!ov) return r;
        return {
          ...r,
          folderId: ov.folderId,
          folderLabel: ov.folderLabel,
        };
      });
    }
    if (filter === "recent") return baseRows;
    const list = [...baseRows];
    const dir = display.sortDir === "desc" ? -1 : 1;
    const kindRank = (k: AutomationRow["kind"]) =>
      k === "macro" ? 0 : k === "clicker" ? 1 : 2;

    if (display.sortBy === "order") {
      const presentKeys = list.map(rowOrderKey);
      const merged = mergeAccueilOrder(manualOrder, presentKeys);
      const ordered = applyAccueilOrder(list, merged);
      if (dir < 0) ordered.reverse();
      return ordered;
    }

    list.sort((a, b) => {
      if (filter === "all" || filter === "favorites") {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      }
      let cmp = 0;
      if (display.sortBy === "type") cmp = a.kind.localeCompare(b.kind);
      else if (display.sortBy === "status")
        cmp = a.status.localeCompare(b.status);
      else cmp = a.name.localeCompare(b.name, locale);
      if (cmp === 0) {
        const kr = kindRank(a.kind) - kindRank(b.kind);
        if (kr !== 0) return kr;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      }
      return cmp * dir;
    });
    return list;
  }, [
    rows,
    display.sortBy,
    display.sortDir,
    filter,
    manualOrder,
    folderOverrides,
    accueilPrefs.showScriptsInAll,
    accueilPrefs.showModulesInAll,
    accueilPrefs.hideScriptLanguages,
    locale,
  ]);
  sortedRef.current = sorted;

  const flatKeys = useMemo(() => sorted.map(rowKey), [sorted]);

  const sections = useMemo(() => {
    type ListSection = {
      id: string;
      name: string | null;
      folder: AutomationFolderOption | null;
      kind: "folder" | "flat";
      items: AutomationRow[];
    };

    if (filter !== "all") {
      return [
        {
          id: "all",
          name: null,
          folder: null,
          kind: "flat" as const,
          items: sorted,
        },
      ];
    }

    const out: ListSection[] = [];
    for (const f of folders) {
      const key = folderOptionKey(f);
      const items = sorted.filter(
        (r) => r.folderId != null && r.folderId === f.id,
      );
      out.push({
        id: `folder:${key}`,
        name: f.name,
        folder: f,
        kind: "folder",
        items,
      });
    }

    const unfiled = sorted.filter((r) => r.folderId == null);
    out.push({
      id: "unfiled",
      name: null,
      folder: null,
      kind: "flat",
      items: unfiled,
    });
    return out;
  }, [sorted, filter, folders]);

  const selectedRows = useMemo(() => {
    return sorted.filter((r) => selected.has(rowKey(r)));
  }, [sorted, selected]);

  const emptyState = useMemo(() => {
    if (query.trim()) {
      return (
        <EmptyState
          title={t("automations.empty.noResultsTitle")}
          lead={t("automations.empty.noResultsLead")}
          actions={
            <button
              type="button"
              className="caster-btn caster-btn-ghost"
              onClick={() => onQueryChange("")}
            >
              {t("automations.empty.clearSearch")}
            </button>
          }
        />
      );
    }
    if (filter === "favorites") {
      return (
        <EmptyState
          title={t("automations.empty.noFavoritesTitle")}
          lead={t("automations.empty.noFavoritesLead")}
          actions={
            <button
              type="button"
              className="caster-btn caster-btn-ghost"
              onClick={() => onFilterChange?.("all")}
            >
              {t("automations.empty.seeAll")}
            </button>
          }
        />
      );
    }
    if (filter === "recent") {
      return (
        <EmptyState
          title={t("automations.empty.noRecentTitle")}
          lead={t("automations.empty.noRecentLead")}
          actions={
            <>
              <button type="button" className="caster-btn" onClick={onCreateClicker}>
                {t("automations.empty.newClicker")}
              </button>
              <button type="button" className="caster-btn" onClick={onCreateScript}>
                {t("automations.empty.newScript")}
              </button>
              <button
                type="button"
                className="caster-btn caster-btn-primary"
                onClick={onCreateMacro}
              >
                {t("automations.empty.newMacro")}
              </button>
            </>
          }
        />
      );
    }
    return (
      <EmptyState
        title={t("automations.empty.noAutomationsTitle")}
        lead={t("automations.empty.noAutomationsLead")}
        actions={
          <>
            <button type="button" className="caster-btn" onClick={onCreateClicker}>
              {t("automations.create.clicker")}
            </button>
            <button type="button" className="caster-btn" onClick={onCreateScript}>
              {t("automations.create.script")}
            </button>
            <button
              type="button"
              className="caster-btn caster-btn-primary"
              onClick={onCreateMacro}
            >
              {t("automations.create.macro")}
            </button>
          </>
        }
      />
    );
  }, [
    filter,
    onCreateClicker,
    onCreateMacro,
    onCreateScript,
    onFilterChange,
    onQueryChange,
    query,
    t,
  ]);

  async function onDeleteSelected() {
    if (selectedRows.length === 0) return;
    const ok = await confirmAction({
      title: t("automations.confirm.trashTitle"),
      message:
        selectedRows.length === 1
          ? t("automations.confirm.trashMany", { count: selectedRows.length })
          : t("automations.confirm.trashManyOther", {
              count: selectedRows.length,
            }),
      confirmLabel: t("automations.confirm.trashConfirm"),
      danger: true,
    });
    if (!ok) return;
    try {
      for (const r of selectedRows) {
        await deleteRow(r);
        accueilUndo.push({
          type: "trash-item",
          kind: r.kind,
          id: r.id,
          label: r.name,
        });
      }
      setSelected(new Set());
      await refresh();
      onRefresh?.();
      undoToast(t("automations.toast.trashed"));
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.deleteFail")));
    }
  }

  async function onFavoriteSelected() {
    const targets = selectedRows;
    if (targets.length === 0) return;
    const makeFav = targets.some((r) => !r.favorite);
    try {
      for (const r of targets) {
        if (r.favorite === makeFav) continue;
        await invoke("set_quick_favorite", {
          kind: r.kind,
          id: r.id,
          favorite: makeFav,
        });
      }
      await refresh();
      onRefresh?.();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.favoritesFail")));
    }
  }

  async function onLockSelected(locked: boolean) {
    const targets = selectedRows;
    if (targets.length === 0) return;
    try {
      for (const r of targets) {
        if (r.locked === locked) continue;
        await invoke("set_library_item_locked_cmd", {
          kind: r.kind,
          id: r.id,
          locked,
        });
      }
      await refresh({ silent: true });
      onRefresh?.();
      toast.success(locked ? t("automations.toast.locked") : t("automations.toast.unlocked"));
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.lockFail")));
    }
  }

  async function setRowLocked(r: AutomationRow, locked: boolean) {
    try {
      await invoke("set_library_item_locked_cmd", {
        kind: r.kind,
        id: r.id,
        locked,
      });
      await refresh({ silent: true });
      onRefresh?.();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.lockFail")));
    }
  }

  async function moveRowToFolder(
    r: AutomationRow,
    folder: AutomationFolderOption | null,
  ) {
    if (folder) {
      await commitAccueilDrop({
        type: "move-folder",
        row: r,
        folderId: folder.id,
      });
    } else {
      await commitAccueilDrop({ type: "unfile", row: r });
    }
  }

  async function onCreateFolder() {
    const name = await promptAction({
      title: t("automations.confirm.createFolderTitle"),
      defaultValue: "",
      confirmLabel: t("automations.confirm.createFolderConfirm"),
      placeholder: t("automations.confirm.createFolderPlaceholder"),
    });
    if (!name?.trim()) return;
    const trimmed = name.trim();
    try {
      const created = await invoke<{ id: string; name: string }>(
        "create_library_folder_cmd",
        { kind: "macro", name: trimmed, parentId: null },
      );
      await refresh();
      onRefresh?.();
      setCollapsedSections((prev) => {
        const next = new Set(prev);
        next.delete(`folder:${folderOptionKey(created)}`);
        return next;
      });
      accueilUndo.push({
        type: "create-folder",
        id: created.id,
        name: created.name,
      });
      undoToast(t("automations.toast.folderCreated", { name: created.name }));
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.folderCreateFail")));
    }
  }

  async function onRenameFolder(target: AutomationFolderOption) {
    const folder = target;
    const nextName = await promptAction({
      title: t("automations.confirm.renameFolderTitle"),
      defaultValue: folder.name,
      confirmLabel: t("automations.confirm.renameFolderConfirm"),
      placeholder: t("automations.confirm.renameFolderPlaceholder"),
    });
    if (!nextName) return;
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === folder.name) return;
    try {
      const renamed = await invoke<{ id: string; name: string }>(
        "rename_library_folder_cmd",
        { kind: "macro", id: folder.id, name: trimmed },
      );
      await refresh();
      onRefresh?.();
      accueilUndo.push({
        type: "rename-folder",
        id: folder.id,
        fromName: folder.name,
        toName: renamed.name,
      });
      undoToast(t("automations.toast.folderRenamed", { name: renamed.name }));
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.folderRenameFail")));
    }
  }

  async function onMoveSelected(
    folderId: string | null,
    kind: "macro" | "clicker" | "script",
  ) {
    const targets = selectedRows.filter((r) => r.kind === kind);
    if (targets.length === 0) return;
    try {
      for (const r of targets) {
        await invoke("move_library_item_cmd", {
          kind: r.kind,
          id: r.id,
          folderId,
          beforeId: null,
        });
        accueilUndo.push({
          type: "move-item",
          kind: r.kind,
          id: r.id,
          fromFolderId: r.folderId ?? null,
          toFolderId: folderId,
          label: r.name,
        });
      }
      await refresh({ silent: true });
      onRefresh?.();
      undoToast(t("automations.toast.moved"));
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  function onLaunchSelected() {
    const first = selectedRows[0];
    if (!first) return;
    void launchRow(first);
  }

  function onOpenSelected() {
    const first = selectedRows[0];
    if (!first) return;
    onNavigate({
      name: "automation",
      id: first.id,
      kind: first.kind,
      label: first.name,
    });
  }

  function applyRangeSelect(fromKey: string, toKey: string) {
    const from = flatKeys.indexOf(fromKey);
    const to = flatKeys.indexOf(toKey);
    if (from < 0 || to < 0) return;
    const [a, b] = from < to ? [from, to] : [to, from];
    setSelected(new Set(flatKeys.slice(a, b + 1)));
  }

  function toggleSelect(
    id: string,
    opts?: { multi?: boolean; range?: boolean },
  ) {
    if (opts?.range && selectionAnchor) {
      applyRangeSelect(selectionAnchor, id);
      setFocusKey(id);
      return;
    }
    setSelected((prev) => {
      const next = opts?.multi ? new Set(prev) : new Set<string>();
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectionAnchor(id);
    setFocusKey(id);
  }

  async function onDeleteOne(r: AutomationRow) {
    if (!accueilPrefs.confirmTrash) {
      try {
        await deleteRow(r);
        setMenuKey(null);
        await refresh();
        onRefresh?.();
        accueilUndo.push({
          type: "trash-item",
          kind: r.kind,
          id: r.id,
          label: r.name,
        });
        undoToast(t("automations.toast.trashed"));
      } catch (e) {
        toast.error(errMessage(e, t("automations.toast.deleteFail")));
      }
      return;
    }
    const ok = await confirmAction({
      title: t("automations.confirm.trashTitle"),
      message: t("automations.confirm.trashOne", { name: r.name }),
      confirmLabel: t("automations.confirm.trashConfirm"),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRow(r);
      setMenuKey(null);
      await refresh();
      onRefresh?.();
      accueilUndo.push({
        type: "trash-item",
        kind: r.kind,
        id: r.id,
        label: r.name,
      });
      undoToast(t("automations.toast.trashed"));
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.deleteFail")));
    }
  }

  async function onDeleteFolder(target: AutomationFolderOption) {
    const folder = target;
    if (accueilPrefs.confirmDeleteFolder) {
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
      await refresh();
      onRefresh?.();
      accueilUndo.push({ type: "delete-folder", name: folder.name });
      undoToast(t("automations.toast.folderDeleted", { name: folder.name }));
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.folderDeleteFail")));
    }
  }

  function scheduleConvertOne(
    r: AutomationRow,
    toKind: AutomationRow["kind"],
  ) {
    // Let the row menu finish closing before opening confirm — avoids list flash.
    queueMicrotask(() => {
      void (async () => {
        try {
          const outcome = await runLibraryConvert({
            fromKind: r.kind,
            id: r.id,
            toKind,
            name: r.name,
            t,
          });
          setMenuKey(null);
          if (!outcome) return;
          const { result, openAfter } = outcome;
          accueilUndo.push({
            type: "convert-item",
            kind: result.toKind as AutomationRow["kind"],
            id: result.newId,
            label: result.newName,
          });
          if (openAfter) {
            undoToast(
              t("automations.convert.success", {
                name: result.newName,
                kind: t(`automations.convert.kind.${result.toKind}`),
              }),
            );
            onNavigate({
              name: "automation",
              id: result.newId,
              kind: result.toKind as AutomationRow["kind"],
              label: result.newName,
            });
            return;
          }
          undoToast(convertSuccessMessage(result, t));
        } catch (e) {
          setMenuKey(null);
          toast.error(errMessage(e, t("automations.convert.fail")));
        }
      })();
    });
  }

  function scheduleConvertBatch(toKind: AutomationRow["kind"]) {
    const items = selectedRows
      .filter((r) => !r.locked)
      .map((r) => ({ fromKind: r.kind, id: r.id, name: r.name }));
    if (items.length === 0) return;
    queueMicrotask(() => {
      void (async () => {
        try {
          const outcome = await runLibraryConvertBatch({
            items,
            toKind,
            t,
          });
          if (!outcome) return;
          if (outcome.ok.length === 0 && outcome.failed.length > 0) {
            toast.error(convertBatchSummaryMessage(outcome, t));
            return;
          }
          if (outcome.ok.length > 0) {
            accueilUndo.push({
              type: "convert-batch",
              items: outcome.ok.map((r) => ({
                kind: r.toKind as AutomationRow["kind"],
                id: r.newId,
              })),
            });
          }
          undoToast(convertBatchSummaryMessage(outcome, t));
          if (outcome.openAfter && outcome.ok.length > 0) {
            for (const result of outcome.ok) {
              onNavigate({
                name: "automation",
                id: result.newId,
                kind: result.toKind as AutomationRow["kind"],
                label: result.newName,
              });
            }
          }
          setSelected(new Set());
        } catch (e) {
          toast.error(errMessage(e, t("automations.convert.fail")));
        }
      })();
    });
  }

  async function onRenameOne(r: AutomationRow) {
    if (r.locked) {
      toast.info(t("automations.toast.unlockBeforeRename"));
      return;
    }
    const nextName = await promptAction({
      title: t("automations.confirm.renameTitle"),
      defaultValue: r.name,
      confirmLabel: t("automations.confirm.renameConfirm"),
      placeholder: t("automations.confirm.renamePlaceholder"),
    });
    if (!nextName) return;
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === r.name) return;
    try {
      if (r.kind === "macro") {
        const doc = await invoke<{ name: string }>("rename_saved_macro", {
          from: r.id,
          to: trimmed,
        });
        onResourceRenamed?.("macro", r.id, doc.name, doc.name);
      } else if (r.kind === "clicker") {
        const preset = await invoke<{ name: string }>("rename_clicker_preset", {
          from: r.id,
          to: trimmed,
        });
        onResourceRenamed?.("clicker", r.id, preset.name, preset.name);
      } else {
        const src = await invoke<ScriptDoc>("load_script_cmd", { id: r.id });
        await invoke("save_script_cmd", { doc: { ...src, name: trimmed } });
        onResourceRenamed?.("script", r.id, r.id, trimmed);
      }
      setMenuKey(null);
      await refresh();
      onRefresh?.();
      accueilUndo.push({
        type: "rename-item",
        kind: r.kind,
        id: r.kind === "script" ? r.id : trimmed,
        fromName: r.name,
        toName: trimmed,
      });
      undoToast(t("automations.toast.renamed", { name: trimmed }));
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.renameFail")));
    }
  }

  async function onDuplicateOne(r: AutomationRow) {
    if (r.locked) {
      toast.info(t("automations.toast.unlockBeforeDuplicate"));
      return;
    }
    try {
      if (r.kind === "macro") {
        const doc = await invoke<{ name: string }>("duplicate_saved_macro", {
          name: r.id,
        });
        await refresh();
        onRefresh?.();
        toast.success(t("automations.toast.macroDuplicated", { name: doc.name }));
        onNavigate({
          name: "automation",
          id: doc.name,
          kind: "macro",
          label: doc.name,
        });
      } else if (r.kind === "clicker") {
        const preset = await invoke<{ name: string }>("duplicate_clicker_preset", {
          name: r.id,
        });
        await refresh();
        onRefresh?.();
        toast.success(t("automations.toast.presetDuplicated", { name: preset.name }));
        onNavigate({
          name: "automation",
          id: preset.name,
          kind: "clicker",
          label: preset.name,
        });
      } else {
        const src = await invoke<ScriptDoc>("load_script_cmd", { id: r.id });
        const copy: ScriptDoc = {
          ...src,
          id: newScriptId(),
          name: t("automations.toast.scriptCopySuffix", { name: src.name }),
        };
        await invoke("save_script_cmd", { doc: copy });
        await refresh();
        onRefresh?.();
        toast.success(t("automations.toast.scriptDuplicated", { name: copy.name }));
        onNavigate({
          name: "automation",
          id: copy.id,
          kind: "script",
          label: copy.name,
        });
      }
      setMenuKey(null);
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.duplicateFail")));
    }
  }

  async function onRevealOne(r: AutomationRow) {
    if (r.kind === "script") {
      toast.info(t("automations.toast.scriptsInConfigFolder"));
      return;
    }
    try {
      await invoke("reveal_library_entry", { kind: r.kind, name: r.id });
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.revealFail")));
    }
  }

  function toggleSection(id: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setSortBy(sortBy: DisplayOptions["sortBy"]) {
    if (display.sortBy === sortBy) {
      onDisplayChange({
        ...display,
        sortDir: display.sortDir === "asc" ? "desc" : "asc",
      });
    } else {
      onDisplayChange({ ...display, sortBy, sortDir: "asc" });
    }
  }

  function ariaSortFor(
    col: DisplayOptions["sortBy"],
  ): "ascending" | "descending" | "none" {
    if (display.sortBy !== col) return "none";
    return display.sortDir === "desc" ? "descending" : "ascending";
  }

  function openRow(r: AutomationRow) {
    onNavigate({
      name: "automation",
      id: r.id,
      kind: r.kind,
      label: r.name,
    });
  }

  function onRowKeyDown(e: ReactKeyboardEvent, r: AutomationRow) {
    const key = rowKey(r);
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openRow(r);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const idx = flatKeys.indexOf(key);
      const nextIdx = e.key === "ArrowDown" ? idx + 1 : idx - 1;
      const nextKey = flatKeys[nextIdx];
      if (!nextKey) return;
      setFocusKey(nextKey);
      const el = pageRef.current?.querySelector(
        `[data-row-key="${CSS.escape(nextKey)}"]`,
      ) as HTMLElement | null;
      el?.focus();
      if (e.shiftKey) {
        const anchor = selectionAnchor ?? key;
        applyRangeSelect(anchor, nextKey);
      }
    }
  }

  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return t.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!pageRef.current) return;
      const typing = isTypingTarget(e.target);

      if (e.key === "Escape") {
        if (dragRow || folderDragArmedRef.current) {
          e.preventDefault();
          clearFolderDrag();
          return;
        }
        if (selected.size > 0) {
          e.preventDefault();
          setSelected(new Set());
        }
        if (createOpen) setCreateOpen(false);
        return;
      }

      if (typing) return;

      if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) {
          void accueilUndo.redo().catch(() => {
            toast.error(t("automations.toast.redoFail"));
          });
        } else {
          void accueilUndo.undo().catch(() => {
            toast.error(t("automations.toast.undoFail"));
          });
        }
        return;
      }

      if ((e.key === "y" || e.key === "Y") && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault();
        void accueilUndo.redo().catch(() => {
          toast.error(t("automations.toast.redoFail"));
        });
        return;
      }

      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (
        (e.key === "n" || e.key === "N") &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        setCreateOpen(true);
        return;
      }

      if ((e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSelected(new Set(flatKeys));
        if (flatKeys[0]) setSelectionAnchor(flatKeys[0]);
        return;
      }

      if (e.key === "Enter" && focusKey) {
        const row = sorted.find((r) => rowKey(r) === focusKey);
        if (row) {
          e.preventDefault();
          openRow(row);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectAllVisible/sorted via closure refresh
  }, [selected.size, createOpen, focusKey, sorted, flatKeys, dragRow, accueilUndo, t, toast]);

  const moveFolders = useMemo(() => {
    const movable = selectedRows.filter(
      (r) =>
        r.kind === "macro" || r.kind === "clicker" || r.kind === "script",
    );
    if (movable.length === 0) return [];
    const commonFolderId = (() => {
      const first = movable[0]?.folderId ?? null;
      return movable.every((r) => (r.folderId ?? null) === first)
        ? first
        : undefined;
    })();
    return folders.filter((f) => f.id !== commonFolderId);
  }, [folders, selectedRows]);

  const selectionHasFiled = useMemo(
    () => ({
      macro: selectedRows.some((r) => r.kind === "macro" && r.folderId != null),
      clicker: selectedRows.some(
        (r) => r.kind === "clicker" && r.folderId != null,
      ),
      script: selectedRows.some(
        (r) => r.kind === "script" && r.folderId != null,
      ),
    }),
    [selectedRows],
  );

  const batchConvertTargets = useMemo(
    () => commonConvertTargets(selectedRows),
    [selectedRows],
  );

  const ctxMenuItems = useMemo(() => {
    if (!ctxRow) return [];
    const rowFolders = folders;
    return buildAutomationRowMenuItems(ctxRow, t, {
      onOpen: () => openRow(ctxRow),
      onLaunch: () => void launchRow(ctxRow),
      onRename: () => void onRenameOne(ctxRow),
      onDuplicate: () => void onDuplicateOne(ctxRow),
      onToggleFavorite: () => void onToggleFavorite(ctxRow),
      onLock: () => void setRowLocked(ctxRow, true),
      onUnlock: () => void setRowLocked(ctxRow, false),
      onReveal: () => void onRevealOne(ctxRow),
      moveFolders: rowFolders,
      onMoveToFolder: (folder) => void moveRowToFolder(ctxRow, folder),
      onConvertTo: (to) => scheduleConvertOne(ctxRow, to),
      onDelete: () => void onDeleteOne(ctxRow),
      icons: automationRowMenuIcons(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers close over latest row
  }, [ctxRow, folders, t]);

  const emptyMenuItems = useMemo(
    () => [
      {
        id: "create-macro",
        label: t("automations.menu.empty.newMacro"),
        icon: <Workflow size={14} />,
        onSelect: () => onCreateMacro(),
      },
      {
        id: "create-clicker",
        label: t("automations.menu.empty.newClicker"),
        icon: <MousePointer2 size={14} />,
        onSelect: () => onCreateClicker(),
      },
      {
        id: "create-script",
        label: t("automations.menu.empty.newScript"),
        icon: <Code2 size={14} />,
        onSelect: () => onCreateScript(),
      },
      {
        id: "create-folder",
        label: t("automations.menu.empty.newFolder"),
        icon: <FolderPlus size={14} />,
        onSelect: () => void onCreateFolder(),
      },
      { id: "sep-empty", label: "", separator: true },
      {
        id: "refresh",
        label: t("automations.menu.empty.refresh"),
        icon: <RefreshCw size={14} />,
        onSelect: () => {
          void refresh();
          onRefresh?.();
        },
      },
      {
        id: "toggle-favorites",
        label:
          filter === "favorites"
            ? t("automations.menu.empty.showAll")
            : t("automations.menu.empty.showFavorites"),
        icon: <Star size={14} />,
        onSelect: () =>
          onFilterChange?.(filter === "favorites" ? "all" : "favorites"),
      },
    ],
    [
      filter,
      onCreateClicker,
      onCreateMacro,
      onCreateScript,
      onFilterChange,
      onRefresh,
      refresh,
      t,
    ],
  );

  const lockTargets = selectedRows;
  const canLock = lockTargets.some((r) => !r.locked);
  const canUnlock = lockTargets.some((r) => r.locked);

  return (
    <div
      className="caster-page caster-automations-page"
      ref={pageRef}
      onContextMenu={(e) => {
        e.preventDefault();
        const target = e.target as HTMLElement;
        if (
          target.closest(".caster-auto-row") ||
          target.closest(".caster-context-menu")
        )
          return;
        emptyCtx.openFromEvent(e);
        ctxMenu.close();
        setCtxRow(null);
      }}
    >
      <AutomationsToolbar
        query={query}
        onQueryChange={onQueryChange}
        filter={filter}
        onFilterChange={(f) => onFilterChange?.(f)}
        counts={counts}
        onCreateMacro={onCreateMacro}
        onCreateClicker={onCreateClicker}
        onCreateScript={onCreateScript}
        onCreateFolder={() => void onCreateFolder()}
        searchInputRef={searchInputRef}
        createOpen={createOpen}
        onCreateOpenChange={setCreateOpen}
        canUndo={accueilUndo.canUndo}
        canRedo={accueilUndo.canRedo}
        onUndo={() => {
          void accueilUndo.undo().catch(() => {
            toast.error(t("automations.toast.undoFail"));
          });
        }}
        onRedo={() => {
          void accueilUndo.redo().catch(() => {
            toast.error(t("automations.toast.redoFail"));
          });
        }}
      />

      <div
        className="caster-page-body caster-automations-list-body"
        ref={listScrollRef}
      >
        {loading || sorted.length > 0 ? (
          <div
            className="caster-automations-list"
            role={loading ? undefined : "list"}
            aria-busy={loading || undefined}
            aria-label={
              loading ? t("automations.empty.loadingAria") : undefined
            }
          >
            <div className="caster-auto-colhead">
              <span className="caster-auto-colhead-check" aria-hidden />
              <div className="caster-auto-colhead-identity">
                <span className="caster-auto-colhead-kind" aria-hidden />
                <button
                  type="button"
                  role="columnheader"
                  className={[
                    "caster-auto-colhead-label",
                    "caster-auto-colhead-order",
                    display.sortBy === "order" ? "is-active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-sort={ariaSortFor("order")}
                  title={t("automations.columns.orderTitle")}
                  onClick={() => setSortBy("order")}
                >
                  {t("automations.columns.order")}
                  {display.sortBy === "order" ? (
                    <ChevronDown
                      size={12}
                      aria-hidden
                      className={
                        display.sortDir === "desc"
                          ? "caster-auto-colhead-sort-icon is-desc"
                          : "caster-auto-colhead-sort-icon"
                      }
                    />
                  ) : null}
                </button>
                <button
                  type="button"
                  role="columnheader"
                  className={[
                    "caster-auto-colhead-label",
                    "caster-auto-colhead-name",
                    display.sortBy === "name" ? "is-active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-sort={ariaSortFor("name")}
                  onClick={() => setSortBy("name")}
                >
                  {t("automations.columns.name")}
                  {display.sortBy === "name" ? (
                    <ChevronDown
                      size={12}
                      aria-hidden
                      className={
                        display.sortDir === "desc"
                          ? "caster-auto-colhead-sort-icon is-desc"
                          : "caster-auto-colhead-sort-icon"
                      }
                    />
                  ) : null}
                </button>
              </div>
              <button
                type="button"
                role="columnheader"
                className={[
                  "caster-auto-colhead-label",
                  "caster-auto-colhead-type",
                  display.sortBy === "type" ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-sort={ariaSortFor("type")}
                onClick={() => setSortBy("type")}
              >
                {t("automations.columns.type")}
                {display.sortBy === "type" ? (
                  <ChevronDown
                    size={12}
                    aria-hidden
                    className={
                      display.sortDir === "desc"
                        ? "caster-auto-colhead-sort-icon is-desc"
                        : "caster-auto-colhead-sort-icon"
                    }
                  />
                ) : null}
              </button>
              <div className="caster-auto-row-props caster-auto-colhead-props">
                <span className="caster-auto-colhead-label caster-auto-row-prop caster-auto-row-prop--trigger">
                  {t("automations.columns.trigger")}
                </span>
                <span className="caster-auto-colhead-label caster-auto-row-prop caster-auto-row-prop--secondary">
                  {t("automations.columns.folderMeta")}
                </span>
                <span className="caster-auto-colhead-label caster-auto-row-prop caster-auto-row-prop--run">
                  {t("automations.columns.lastRun")}
                </span>
                <span className="caster-auto-colhead-label caster-auto-row-prop caster-auto-row-prop--status">
                  {t("automations.columns.status")}
                </span>
              </div>
              <span className="caster-auto-colhead-trail" aria-hidden />
            </div>
            {loading ? (
              <div className="caster-auto-skeleton-page">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="caster-auto-skeleton-row">
                    <div className="caster-skeleton caster-auto-skeleton-check" />
                    <div className="caster-auto-skeleton-identity">
                      <div className="caster-skeleton caster-auto-skeleton-kind" />
                      <div className="caster-auto-skeleton-text">
                        <div
                          className="caster-skeleton caster-skeleton-line caster-skeleton-line--lg"
                          style={{ width: `${52 - i * 5}%` }}
                        />
                        <div
                          className="caster-skeleton caster-skeleton-line"
                          style={{ width: `${36 - i * 3}%` }}
                        />
                      </div>
                    </div>
                    <div className="caster-skeleton caster-auto-skeleton-type" />
                    <div className="caster-auto-skeleton-props">
                      <div className="caster-skeleton caster-auto-skeleton-prop caster-auto-skeleton-prop--trigger" />
                      <div className="caster-skeleton caster-auto-skeleton-prop caster-auto-skeleton-prop--secondary" />
                      <div className="caster-skeleton caster-auto-skeleton-prop caster-auto-skeleton-prop--run" />
                      <div className="caster-skeleton caster-auto-skeleton-prop caster-auto-skeleton-prop--status" />
                    </div>
                    <div className="caster-auto-skeleton-trail" aria-hidden />
                  </div>
                ))}
              </div>
            ) : (
              <>
            {sections.map((section) => {
              const collapsed = collapsedSections.has(section.id);
              const folderKey =
                section.kind === "folder" && section.folder
                  ? folderOptionKey(section.folder)
                  : null;
              const droppingOnFolder =
                folderKey != null && dropFolderKey === folderKey;
              // Folder header/end drop → blue line at end of block (not full wash).
              const headerIsDropOver = droppingOnFolder;
              const folderEndLine =
                droppingOnFolder && !collapsed && section.items.length > 0;
              const folderHeaderLine =
                droppingOnFolder && (collapsed || section.items.length === 0);
              const lastFolderItemKey =
                folderEndLine && section.items.length > 0
                  ? rowKey(section.items[section.items.length - 1]!)
                  : null;
              const unfiledDropActive =
                section.id === "unfiled" &&
                dragRow != null &&
                dragRow.folderId != null;
              return (
                <div
                  key={section.id}
                  className="caster-automations-section"
                  {...(folderKey
                    ? { "data-folder-drop-id": folderKey }
                    : {})}
                >
                  {section.kind === "folder" && section.folder && section.name ? (
                    <div
                      className={[
                        "caster-auto-folder-section",
                        headerIsDropOver ? "is-drop-target" : "",
                        folderHeaderLine ? "drop-after" : "",
                        menuKey === section.id ? "is-menu-open" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      data-folder-drop-id={folderKey ?? undefined}
                    >
                      <button
                        type="button"
                        className="caster-auto-folder-section-toggle"
                        aria-expanded={!collapsed}
                        onClick={() => toggleSection(section.id)}
                      >
                        <ChevronDown
                          size={14}
                          aria-hidden
                          className={[
                            "caster-automations-section-chevron",
                            collapsed ? "is-collapsed" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        />
                        <span className="caster-auto-kind caster-auto-kind--folder">
                          <Folder size={16} aria-hidden />
                        </span>
                        <div className="caster-auto-row-main">
                          <span className="caster-auto-row-name">{section.name}</span>
                          <span className="caster-auto-row-sub">
                            {t(
                              section.items.length === 1
                                ? "automations.folder.itemCountOne"
                                : "automations.folder.itemCount",
                              { count: section.items.length },
                            )}
                          </span>
                        </div>
                      </button>
                      <div
                        className="caster-auto-row-trail"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Tooltip content={t("automations.menu.row.moreTip")}>
                          <span className="caster-auto-row-menu-wrap">
                            <DropdownMenu
                              label={t("automations.menu.row.moreLabel")}
                              ariaLabel={t(
                                "automations.folder.sectionMenuAria",
                                { name: section.folder.name },
                              )}
                              open={menuKey === section.id}
                              onOpenChange={(open) =>
                                setMenuKey(open ? section.id : null)
                              }
                              align="end"
                              triggerClassName="caster-auto-row-menu-btn"
                              items={[
                                {
                                  id: "rename",
                                  label: t("automations.folder.rename"),
                                  icon: <PenLine size={14} />,
                                  onSelect: () =>
                                    void onRenameFolder(section.folder!),
                                },
                                {
                                  id: "delete",
                                  label: t("automations.folder.delete"),
                                  icon: <Trash2 size={14} />,
                                  danger: true,
                                  onSelect: () =>
                                    void onDeleteFolder(section.folder!),
                                },
                              ]}
                            >
                              <MoreHorizontal size={16} aria-hidden />
                            </DropdownMenu>
                          </span>
                        </Tooltip>
                      </div>
                    </div>
                  ) : null}
                  {section.kind === "folder" && collapsed
                    ? null
                    : section.items.map((r) => {
                        const key = rowKey(r);
                        const isSelected = selected.has(key);
                        const pill = statusToPill(r.status, t);
                        const rowRunning =
                          liveSession != null &&
                          liveSession.kind === r.kind &&
                          liveSession.name === r.name;
                        const permCount = r.permLabels?.length ?? 0;
                        const propSecondary =
                          r.kind === "script"
                            ? (r.meta ?? null)
                            : r.folderLabel !== empty
                              ? r.folderLabel
                              : (r.meta ?? null);
                        const propLastRun =
                          r.lastRunLabel !== empty ? r.lastRunLabel : null;
                        const subtitle = rowSubtitle(r, t, {
                          running: rowRunning,
                        });
                          const dropBefore =
                          dropEdge?.key === key && dropEdge.edge === "before";
                          const dropAfter =
                          (dropEdge?.key === key && dropEdge.edge === "after") ||
                          lastFolderItemKey === key;
                        return (
                          <div
                            key={key}
                            role="listitem"
                            data-row-key={key}
                            className={[
                              "caster-auto-row",
                              isSelected ? "is-selected" : "",
                              menuKey === key ? "is-menu-open" : "",
                              rowRunning ? "is-running" : "",
                              focusKey === key ? "is-focused" : "",
                              dragRow && rowKey(dragRow) === key
                                ? "is-drag-source"
                                : "",
                              dropBefore ? "drop-before" : "",
                              dropAfter ? "drop-after" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onClick={(e) => {
                              if (suppressClickAfterDragRef.current) {
                                suppressClickAfterDragRef.current = false;
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              if (dragRow || folderDragArmedRef.current) return;
                              setFocusKey(key);
                              if (accueilPrefs.openOnSingleClick) {
                                openRow(r);
                              }
                            }}
                            onDoubleClick={(e) => {
                              if (suppressClickAfterDragRef.current) return;
                              e.preventDefault();
                              openRow(r);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              emptyCtx.close();
                              ctxMenu.openFromEvent(e);
                              setCtxRow(r);
                            }}
                            onFocus={() => setFocusKey(key)}
                            onKeyDown={(e) => onRowKeyDown(e, r)}
                            tabIndex={0}
                          >
                            <label
                              className="caster-auto-row-check"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  toggleSelect(key, {
                                    multi: true,
                                    range: e.shiftKey,
                                  });
                                }}
                                onChange={() => {
                                  /* controlled via onClick */
                                }}
                                aria-label={t("automations.row.selectAria", { name: r.name })}
                              />
                            </label>
                            <div
                              className="caster-auto-row-identity"
                              onPointerDown={(e) => onRowPointerDown(r, e)}
                            >
                              <KindIcon row={r} />
                              <div className="caster-auto-row-main">
                                <TruncatedTooltip content={r.name}>
                                  <span className="caster-auto-row-name">
                                    {rowRunning ? (
                                      <span
                                        className="caster-auto-row-run-dot"
                                        aria-hidden
                                      />
                                    ) : null}
                                    {r.name}
                                  </span>
                                </TruncatedTooltip>
                                {subtitle ? (
                                  <TruncatedTooltip content={subtitle}>
                                    <span
                                      className={[
                                        "caster-auto-row-sub",
                                        rowRunning ? "is-running" : "",
                                      ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    >
                                      {subtitle}
                                    </span>
                                  </TruncatedTooltip>
                                ) : null}
                              </div>
                            </div>
                            <span
                              className={`caster-auto-type-badge caster-auto-type-badge--${r.kind}`}
                            >
                              {kindLabel(r.kind, t)}
                            </span>
                            <div className="caster-auto-row-props">
                              {rowRunning ? (
                                <span className="caster-auto-row-prop caster-auto-row-prop--trigger is-running">
                                  <Play size={11} aria-hidden />
                                  {t("common.running")}
                                </span>
                              ) : r.kind === "script" &&
                                scriptsPrefs.showPermBadgesOnHome &&
                                permCount > 0 ? (
                                <Tooltip
                                  content={t("automations.row.permTooltip", {
                                    list: (r.permLabels ?? []).join(", "),
                                  })}
                                >
                                  <span
                                    className="caster-auto-row-prop caster-auto-row-prop--trigger"
                                    tabIndex={0}
                                  >
                                    <span className="caster-auto-row-perm-badge">
                                      {t("automations.row.permAccess", { count: permCount })}
                                    </span>
                                  </span>
                                </Tooltip>
                              ) : (
                                <TruncatedTooltip content={metaTooltip(r, t)}>
                                  <span className="caster-auto-row-prop caster-auto-row-prop--trigger">
                                    <Play size={11} aria-hidden />
                                    {r.triggerLabel}
                                  </span>
                                </TruncatedTooltip>
                              )}
                              <TruncatedTooltip
                                content={propSecondary ?? metaTooltip(r, t)}
                              >
                                <span
                                  className={[
                                    "caster-auto-row-prop",
                                    "caster-auto-row-prop--secondary",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                >
                                  {propSecondary ? (
                                    <>
                                      {r.kind === "script" ? (
                                        <Code2 size={11} aria-hidden />
                                      ) : (
                                        <Folder size={11} aria-hidden />
                                      )}
                                      {propSecondary}
                                    </>
                                  ) : null}
                                </span>
                              </TruncatedTooltip>
                              <Tooltip
                                content={
                                  r.lastRunTooltip && propLastRun
                                    ? r.lastRunTooltip
                                    : propLastRun
                                      ? t("automations.row.lastRunTooltip", {
                                          label: propLastRun,
                                        })
                                      : t("automations.row.neverRun")
                                }
                              >
                                <span className="caster-auto-row-prop caster-auto-row-prop--run">
                                  {propLastRun ?? empty}
                                </span>
                              </Tooltip>
                              <Tooltip content={statusTooltip(r.status, t)}>
                                <span
                                  className={[
                                    "caster-auto-row-prop",
                                    "caster-auto-row-prop--status",
                                    `is-${pill.kind}`,
                                  ].join(" ")}
                                  tabIndex={0}
                                >
                                  <span
                                    className="caster-auto-status-dot"
                                    aria-hidden
                                  />
                                  {pill.label}
                                </span>
                              </Tooltip>
                            </div>
                            <div
                              className="caster-auto-row-trail"
                              onClick={(e) => e.stopPropagation()}
                              onDoubleClick={(e) => e.stopPropagation()}
                            >
                              <Tooltip
                                content={
                                  r.kind === "script" && r.isModule
                                    ? t("automations.toast.scriptModuleBlocked")
                                    : r.kind === "script"
                                      ? t("automations.row.executeTip")
                                      : t("automations.row.playTip")
                                }
                              >
                                  <button
                                    type="button"
                                    className="caster-auto-row-play-btn"
                                    disabled={r.kind === "script" && !!r.isModule}
                                    aria-label={
                                      r.kind === "script"
                                        ? t("automations.row.executeAria", {
                                            name: r.name,
                                          })
                                        : t("automations.row.playAria", {
                                            name: r.name,
                                          })
                                    }
                                    onClick={() => void launchRow(r)}
                                  >
                                    <Play size={14} aria-hidden />
                                  </button>
                                </Tooltip>
                              <Tooltip content={favoriteTooltip(r.favorite, t)}>
                                <button
                                  type="button"
                                  className={[
                                    "caster-automation-fav",
                                    r.favorite ? "is-on" : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  aria-pressed={r.favorite}
                                  aria-label={favoriteTooltip(r.favorite, t)}
                                  onClick={(ev) => void onToggleFavorite(r, ev)}
                                >
                                  <Star
                                    size={14}
                                    aria-hidden
                                    fill={r.favorite ? "currentColor" : "none"}
                                  />
                                </button>
                              </Tooltip>
                              <AutomationRowMenu
                                row={r}
                                open={menuKey === key}
                                onOpenChange={(open) =>
                                  setMenuKey(open ? key : null)
                                }
                                onOpen={() => openRow(r)}
                                onLaunch={() => void launchRow(r)}
                                onRename={() => void onRenameOne(r)}
                                onDuplicate={() => void onDuplicateOne(r)}
                                onDelete={() => void onDeleteOne(r)}
                                onToggleFavorite={() => void onToggleFavorite(r)}
                                onLock={() => void setRowLocked(r, true)}
                                onUnlock={() => void setRowLocked(r, false)}
                                onReveal={() => void onRevealOne(r)}
                                moveFolders={folders}
                                onMoveToFolder={(folder) =>
                                  void moveRowToFolder(r, folder)
                                }
                                onConvertTo={(to) => scheduleConvertOne(r, to)}
                              />
                            </div>
                          </div>
                        );
                      })}
                  {section.kind === "folder" && !collapsed ? (
                    <div
                      className="caster-auto-folder-section-end"
                      data-folder-drop-id={folderKey ?? undefined}
                      aria-hidden
                    />
                  ) : null}
                  {section.id === "unfiled" &&
                  unfiledDropActive &&
                  section.items.length === 0 ? (
                    <div
                      className={[
                        "caster-auto-unfiled-dropzone",
                        dropFolderKey === "root" ? "is-drop-over" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      data-folder-drop="root"
                    />
                  ) : null}
                </div>
              );
            })}
              </>
            )}
          </div>
        ) : (
          emptyState
        )}
      </div>

      {selected.size > 0 ? (
        <div
          className="caster-automations-selection-dock"
          role="toolbar"
          aria-label={t("automations.selection.aria")}
        >
          <span className="caster-automations-selection-count">
            {selected.size === 1
              ? t("automations.selection.countOne", { count: selected.size })
              : t("automations.selection.countMany", { count: selected.size })}
          </span>
          <div className="caster-automations-selection-actions">
            <button
              type="button"
              className="caster-btn caster-btn-ghost"
              onClick={onOpenSelected}
            >
              {t("common.open")}
            </button>
            <button
              type="button"
              className="caster-btn caster-btn-primary"
              onClick={onLaunchSelected}
            >
              {t("automations.selection.launch")}
            </button>
            <button
              type="button"
              className="caster-btn caster-btn-ghost"
              onClick={() => void onFavoriteSelected()}
            >
              {t("automations.selection.favorite")}
            </button>
            {canLock ? (
              <button
                type="button"
                className="caster-btn caster-btn-ghost"
                onClick={() => void onLockSelected(true)}
              >
                <Lock size={14} aria-hidden />
                {t("automations.selection.lock")}
              </button>
            ) : null}
            {canUnlock ? (
              <button
                type="button"
                className="caster-btn caster-btn-ghost"
                onClick={() => void onLockSelected(false)}
              >
                <LockOpen size={14} aria-hidden />
                {t("automations.selection.unlock")}
              </button>
            ) : null}
            {moveFolders.length > 0 ||
            selectionHasFiled.macro ||
            selectionHasFiled.clicker ||
            selectionHasFiled.script ? (
              <DropdownMenu
                label={t("automations.selection.folder")}
                ariaLabel={t("automations.selection.folderAria")}
                align="end"
                triggerClassName="caster-btn caster-btn-ghost"
                items={[
                  ...(selectionHasFiled.macro
                    ? [
                        {
                          id: "root-macro",
                          label: t("automations.selection.noFolderMacros"),
                          icon: <Folder size={14} />,
                          onSelect: () => void onMoveSelected(null, "macro"),
                        },
                      ]
                    : []),
                  ...(selectionHasFiled.clicker
                    ? [
                        {
                          id: "root-clicker",
                          label: t("automations.selection.noFolderClickers"),
                          icon: <Folder size={14} />,
                          onSelect: () => void onMoveSelected(null, "clicker"),
                        },
                      ]
                    : []),
                  ...(selectionHasFiled.script
                    ? [
                        {
                          id: "root-script",
                          label: t("automations.selection.noFolderScripts"),
                          icon: <Folder size={14} />,
                          onSelect: () => void onMoveSelected(null, "script"),
                        },
                      ]
                    : []),
                  ...moveFolders.map((f) => ({
                    id: folderOptionKey(f),
                    label: f.name,
                    icon: <Folder size={14} />,
                    onSelect: () => {
                      const kinds = new Set<"macro" | "clicker" | "script">();
                      for (const r of selectedRows) {
                        if (
                          r.kind === "macro" ||
                          r.kind === "clicker" ||
                          r.kind === "script"
                        ) {
                          kinds.add(r.kind);
                        }
                      }
                      for (const kind of kinds) {
                        void onMoveSelected(f.id, kind);
                      }
                    },
                  })),
                ]}
              >
                <Folder size={14} aria-hidden />
                {t("automations.selection.folder")}
                <ChevronDown size={14} aria-hidden />
              </DropdownMenu>
            ) : null}
            {batchConvertTargets.length > 0 ? (
              <DropdownMenu
                label={t("automations.convert.batch")}
                ariaLabel={t("automations.convert.batch")}
                align="end"
                triggerClassName="caster-btn caster-btn-ghost"
                items={batchConvertTargets.map((to) => ({
                  id: `batch-convert-${to}`,
                  label: t(`automations.convert.kind.${to}`),
                  icon: <RefreshCw size={14} />,
                  onSelect: () => scheduleConvertBatch(to),
                }))}
              >
                <RefreshCw size={14} aria-hidden />
                {t("automations.convert.batch")}
                <ChevronDown size={14} aria-hidden />
              </DropdownMenu>
            ) : null}
            <button
              type="button"
              className="caster-btn caster-btn-danger-ghost"
              onClick={() => void onDeleteSelected()}
            >
              {t("automations.selection.trash")}
            </button>
            <button
              type="button"
              className="caster-btn caster-btn-ghost"
              onClick={() => setSelected(new Set())}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {ctxMenu.open && ctxRow ? (
        <ContextMenu
          open={ctxMenu.open}
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenuItems}
          onClose={() => {
            ctxMenu.close();
            setCtxRow(null);
          }}
          onSelect={(id) => {
            findMenuItem(ctxMenuItems, id)?.onSelect?.();
          }}
          ariaLabel={t("automations.row.ctxAria", { name: ctxRow.name })}
        />
      ) : null}

      <ContextMenu
        open={emptyCtx.open}
        x={emptyCtx.x}
        y={emptyCtx.y}
        items={emptyMenuItems}
        onClose={emptyCtx.close}
        onSelect={(id) => {
          findMenuItem(emptyMenuItems, id)?.onSelect?.();
        }}
        ariaLabel={t("automations.menu.empty.aria")}
      />

      {dragGhost
        ? createPortal(
            <div
              className="caster-auto-drag-ghost"
              style={{
                transform: `translate(${dragGhost.x + 12}px, ${dragGhost.y + 12}px)`,
              }}
              aria-hidden
            >
              <span
                className={`caster-auto-type-badge caster-auto-type-badge--${dragGhost.kind}`}
              >
                {kindLabel(dragGhost.kind, t)}
              </span>
              <span className="caster-auto-drag-ghost-name">{dragGhost.name}</span>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
