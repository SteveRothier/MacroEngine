import {
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
} from "../ui/v2";
import { confirmAction, promptAction } from "../ui";
import type { AppRoute } from "../app/types";
import { useLocale, useT, type TFunction } from "../i18n";
import type { ScriptDoc } from "../scripts/types";
import { newScriptId } from "../scripts/ScriptEditorView";
import {
  canReorderAccueilRows,
  resolveAccueilReorderDrop,
  type AccueilDropEdge,
} from "./accueilDrop";
import {
  applyAccueilOrder,
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
  mergeAccueilPrefs,
  mergeAutomationPrefs,
  mergeScriptsPrefs,
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
import { useUnifiedAutomations } from "./useUnifiedAutomations";

const EDGE_HYSTERESIS_PX = 6;
const AUTO_SCROLL_EDGE_PX = 48;
const AUTO_SCROLL_MAX_PX = 18;

type RowDropEdge = {
  key: string;
  edge: AccueilDropEdge;
};

type DragGhost = {
  name: string;
  kind: AutomationRow["kind"];
  x: number;
  y: number;
};

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
      <span className={`v2-auto-kind v2-auto-kind--${row.kind}`} tabIndex={0}>
        <Icon size={16} aria-hidden />
      </span>
    </Tooltip>
  );
});

async function deleteRow(r: AutomationRow): Promise<void> {
  if (r.kind === "macro" || r.kind === "clicker") {
    await invoke("trash_library_item_cmd", { kind: r.kind, id: r.id });
  } else {
    await invoke("delete_script_cmd", { id: r.id });
  }
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
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const empty = t("common.empty");
  const accueilPrefs = mergeAccueilPrefs();
  const automationPrefs = mergeAutomationPrefs();
  const scriptsPrefs = mergeScriptsPrefs();
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () =>
      accueilPrefs.rememberCollapsedSections
        ? loadCollapsedSections()
        : new Set(),
  );
  const [liveScriptName, setLiveScriptName] = useState<string | null>(
    runningScriptName,
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
  const [dragRow, setDragRow] = useState<AutomationRow | null>(null);
  const [dropFolderKey, setDropFolderKey] = useState<string | null>(null);
  const [dropEdge, setDropEdge] = useState<RowDropEdge | null>(null);
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);
  /** True once folder-move drag has passed the threshold (sync for click race). */
  const folderDragArmedRef = useRef(false);
  /** Swallow the click that follows a completed drag (pointerup → click). */
  const suppressClickAfterDragRef = useRef(false);
  const folderDragSessionRef = useRef<{
    row: AutomationRow;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const dropEdgeRef = useRef<RowDropEdge | null>(null);
  const dropFolderKeyRef = useRef<string | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const sortedRef = useRef<AutomationRow[]>([]);
  const displayRef = useRef(display);
  displayRef.current = display;
  dropFolderKeyRef.current = dropFolderKey;

  function clearFolderDrag(opts?: { suppressClick?: boolean }) {
    const suppress =
      opts?.suppressClick === true || folderDragArmedRef.current;
    folderDragSessionRef.current = null;
    folderDragArmedRef.current = false;
    dropEdgeRef.current = null;
    setDragRow(null);
    setDropFolderKey(null);
    setDropEdge(null);
    setDragGhost(null);
    if (suppress) {
      suppressClickAfterDragRef.current = true;
      const swallow = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
        suppressClickAfterDragRef.current = false;
        window.removeEventListener("click", swallow, true);
      };
      window.addEventListener("click", swallow, true);
      window.setTimeout(() => {
        window.removeEventListener("click", swallow, true);
        suppressClickAfterDragRef.current = false;
      }, 400);
    }
  }

  function autoScrollNearEdges(clientY: number) {
    const list = listScrollRef.current;
    if (!list) return;
    const rect = list.getBoundingClientRect();
    if (clientY < rect.top + AUTO_SCROLL_EDGE_PX) {
      const t = 1 - (clientY - rect.top) / AUTO_SCROLL_EDGE_PX;
      list.scrollTop -= Math.ceil(
        AUTO_SCROLL_MAX_PX * Math.min(1, Math.max(0, t)),
      );
    } else if (clientY > rect.bottom - AUTO_SCROLL_EDGE_PX) {
      const t = 1 - (rect.bottom - clientY) / AUTO_SCROLL_EDGE_PX;
      list.scrollTop += Math.ceil(
        AUTO_SCROLL_MAX_PX * Math.min(1, Math.max(0, t)),
      );
    }
  }

  function hitTestRowDrop(
    x: number,
    y: number,
    drag: AutomationRow,
    prev: RowDropEdge | null,
  ): RowDropEdge | null {
    if (displayRef.current.sortBy !== "order") return null;
    const el = document.elementFromPoint(x, y);
    if (!el || !(el instanceof Element)) return null;
    if (el.closest(".v2-auto-folder-chip, .v2-auto-folder-drop-chip")) {
      return null;
    }
    const rowEl = el.closest(".v2-auto-row[data-row-key]");
    if (!(rowEl instanceof HTMLElement)) return null;
    const key = rowEl.getAttribute("data-row-key");
    if (!key || key === rowKey(drag)) return null;
    const target = sortedRef.current.find((r) => rowKey(r) === key);
    if (!target || !canReorderAccueilRows(drag, target)) return null;
    const rect = rowEl.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const prevEdge = prev?.key === key ? prev.edge : null;
    let edge: AccueilDropEdge;
    if (prevEdge && Math.abs(y - mid) < EDGE_HYSTERESIS_PX) {
      edge = prevEdge;
    } else {
      edge = y < mid ? "before" : "after";
    }
    return { key, edge };
  }

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
    setLiveScriptName(runningScriptName);
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
      if (busy && e.payload.sessionKind === "script") {
        setLiveScriptName(e.payload.sessionName ?? null);
      } else {
        setLiveScriptName(null);
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
    if (r.kind === "script") return;
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
      await refresh();
      onRefresh?.();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.scriptLaunchFail")));
    }
  }

  const [manualOrder, setManualOrder] = useState<string[]>([]);
  const manualOrderRef = useRef(manualOrder);
  manualOrderRef.current = manualOrder;

  useEffect(() => {
    let cancelled = false;
    void loadAccueilOrder().then((keys) => {
      if (!cancelled) setManualOrder(keys);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => {
    let baseRows = rows;
    if (filter === "all" && !accueilPrefs.showScriptsInAll) {
      baseRows = rows.filter((r) => r.kind !== "script");
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
    accueilPrefs.showScriptsInAll,
    locale,
  ]);
  sortedRef.current = sorted;

  const flatKeys = useMemo(() => sorted.map(rowKey), [sorted]);

  const sections = useMemo(() => {
    type ListSection = {
      id: string;
      label: string | null;
      folder: AutomationFolderOption | null;
      kind: "folder" | "unfiled" | "flat";
      items: AutomationRow[];
    };

    if (filter !== "all") {
      return [
        {
          id: "all",
          label: null,
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
        (r) =>
          r.kind === f.kind &&
          r.folderId != null &&
          folderOptionKey({ kind: r.kind, id: r.folderId }) === key,
      );
      const dup = folders.filter((o) => o.name === f.name).length > 1;
      const name = dup
        ? t("automations.folder.namedWithKind", {
            name: f.name,
            kind:
              f.kind === "macro"
                ? t("automations.folder.kindSuffixMacro")
                : t("automations.folder.kindSuffixClicker"),
          })
        : f.name;
      out.push({
        id: `folder:${key}`,
        label: t("automations.sections.folder", {
          name,
          count: items.length,
        }),
        folder: f,
        kind: "folder",
        items,
      });
    }

    const unfiled = sorted.filter(
      (r) => r.kind === "script" || r.folderId == null,
    );
    out.push({
      id: "unfiled",
      label:
        folders.length > 0
          ? t("automations.sections.unfiled", { count: unfiled.length })
          : null,
      folder: null,
      kind: "unfiled",
      items: unfiled,
    });
    return out;
  }, [sorted, filter, folders, t]);

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
              className="v2-btn v2-btn-ghost"
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
              className="v2-btn v2-btn-ghost"
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
              <button type="button" className="v2-btn" onClick={onCreateClicker}>
                {t("automations.empty.newClicker")}
              </button>
              <button type="button" className="v2-btn" onClick={onCreateScript}>
                {t("automations.empty.newScript")}
              </button>
              <button
                type="button"
                className="v2-btn v2-btn-primary"
                onClick={onCreateMacro}
              >
                {t("automations.empty.newMacro")}
              </button>
            </>
          }
        />
      );
    }
    if (filter === "scripts") {
      return (
        <EmptyState
          title={t("automations.empty.noScriptsTitle")}
          lead={t("automations.empty.noScriptsLead")}
          actions={
            <button
              type="button"
              className="v2-btn v2-btn-primary"
              onClick={onCreateScript}
            >
              {t("automations.empty.createScript")}
            </button>
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
            <button type="button" className="v2-btn" onClick={onCreateClicker}>
              {t("automations.create.clicker")}
            </button>
            <button type="button" className="v2-btn" onClick={onCreateScript}>
              {t("automations.create.script")}
            </button>
            <button
              type="button"
              className="v2-btn v2-btn-primary"
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
    const hasLibrary = selectedRows.some(
      (r) => r.kind === "macro" || r.kind === "clicker",
    );
    const ok = await confirmAction({
      title: hasLibrary
        ? t("automations.confirm.trashTitle")
        : t("automations.confirm.deleteTitle"),
      message: hasLibrary
        ? selectedRows.length === 1
          ? t("automations.confirm.trashMany", { count: selectedRows.length })
          : t("automations.confirm.trashManyOther", {
              count: selectedRows.length,
            })
        : selectedRows.length === 1
          ? t("automations.confirm.deleteMany", { count: selectedRows.length })
          : t("automations.confirm.deleteManyOther", {
              count: selectedRows.length,
            }),
      confirmLabel: hasLibrary
        ? t("automations.confirm.trashConfirm")
        : t("automations.confirm.deleteConfirm"),
      danger: true,
    });
    if (!ok) return;
    try {
      for (const r of selectedRows) {
        await deleteRow(r);
      }
      setSelected(new Set());
      await refresh();
      onRefresh?.();
      toast.success(hasLibrary ? t("automations.toast.trashed") : t("automations.toast.deleted"));
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.deleteFail")));
    }
  }

  async function onFavoriteSelected() {
    const targets = selectedRows.filter((r) => r.kind !== "script");
    if (targets.length === 0) {
      toast.info(t("automations.toast.scriptsNoFavorite"));
      return;
    }
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
    const targets = selectedRows.filter((r) => r.kind !== "script");
    if (targets.length === 0) {
      toast.info(t("automations.toast.scriptsNoLock"));
      return;
    }
    try {
      for (const r of targets) {
        if (r.locked === locked) continue;
        await invoke("set_library_item_locked_cmd", {
          kind: r.kind,
          id: r.id,
          locked,
        });
      }
      await refresh();
      onRefresh?.();
      toast.success(locked ? t("automations.toast.locked") : t("automations.toast.unlocked"));
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.lockFail")));
    }
  }

  async function setRowLocked(r: AutomationRow, locked: boolean) {
    if (r.kind === "script") return;
    try {
      await invoke("set_library_item_locked_cmd", {
        kind: r.kind,
        id: r.id,
        locked,
      });
      await refresh();
      onRefresh?.();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.lockFail")));
    }
  }

  async function moveRowToFolder(
    r: AutomationRow,
    folder: AutomationFolderOption | null,
  ) {
    if (r.kind === "script") return;
    if (folder && folder.kind !== r.kind) {
      toast.info(t("automations.toast.folderIncompatible"));
      return;
    }
    try {
      await invoke("move_library_item_cmd", {
        kind: r.kind,
        id: r.id,
        folderId: folder?.id ?? null,
        beforeId: null,
      });
      await refresh();
      onRefresh?.();
      toast.success(t("automations.toast.moved"));
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  async function reorderRow(from: AutomationRow, beforeKey: string | null) {
    const presentKeys = sortedRef.current.map(rowOrderKey);
    const base = mergeAccueilOrder(manualOrderRef.current, presentKeys);
    const fromKey = rowOrderKey(from);
    const next = reorderAccueilKeys(base, fromKey, beforeKey);
    if (!next) return;
    setManualOrder(next);
    void saveAccueilOrder(next);
    if (display.sortBy !== "order") {
      onDisplayChange({ ...display, sortBy: "order", sortDir: "asc" });
    }
    // Same-kind: also sync library sort_order via nearest same-kind sibling
    if (
      accueilPrefs.syncLibrarySortOnReorder &&
      (from.kind === "macro" || from.kind === "clicker")
    ) {
      const beforeId = nearestSameKindBeforeId(next, fromKey, from.kind);
      try {
        await invoke("move_library_item_cmd", {
          kind: from.kind,
          id: from.id,
          folderId: from.folderId ?? null,
          beforeId,
        });
        await refresh();
        onRefresh?.();
      } catch {
        /* Accueil order already saved; library sync best-effort */
      }
    }
    toast.success(t("automations.toast.orderUpdated"));
  }

  async function onCreateFolder(kind: "macro" | "clicker") {
    const name = await promptAction({
      title:
        kind === "macro"
          ? t("automations.confirm.createFolderMacroTitle")
          : t("automations.confirm.createFolderClickerTitle"),
      defaultValue: "",
      confirmLabel: t("automations.confirm.createFolderConfirm"),
      placeholder: t("automations.confirm.createFolderPlaceholder"),
    });
    if (!name?.trim()) return;
    const trimmed = name.trim();
    try {
      const created = await invoke<{ id: string; name: string }>(
        "create_library_folder_cmd",
        { kind, name: trimmed, parentId: null },
      );
      await refresh();
      onRefresh?.();
      setCollapsedSections((prev) => {
        const next = new Set(prev);
        next.delete(`folder:${folderOptionKey({ kind, id: created.id })}`);
        return next;
      });
      toast.success(t("automations.toast.folderCreated", { name: created.name }));
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
        { kind: folder.kind, id: folder.id, name: trimmed },
      );
      await refresh();
      onRefresh?.();
      toast.success(t("automations.toast.folderRenamed", { name: renamed.name }));
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.folderRenameFail")));
    }
  }

  async function onMoveSelected(folderId: string | null, kind: "macro" | "clicker") {
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
      }
      await refresh();
      onRefresh?.();
      toast.success(t("automations.toast.moved"));
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
    const toTrash = r.kind === "macro" || r.kind === "clicker";
    if (toTrash && !accueilPrefs.confirmTrash) {
      try {
        await deleteRow(r);
        setMenuKey(null);
        await refresh();
        onRefresh?.();
        toast.success(t("automations.toast.trashed"));
      } catch (e) {
        toast.error(errMessage(e, t("automations.toast.deleteFail")));
      }
      return;
    }
    const ok = await confirmAction({
      title: toTrash
        ? t("automations.confirm.trashTitle")
        : t("automations.confirm.deleteTitle"),
      message: toTrash
        ? t("automations.confirm.trashOne", { name: r.name })
        : t("automations.confirm.deleteOne", { name: r.name }),
      confirmLabel: toTrash
        ? t("automations.confirm.trashConfirm")
        : t("automations.confirm.deleteConfirm"),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRow(r);
      setMenuKey(null);
      await refresh();
      onRefresh?.();
      toast.success(toTrash ? t("automations.toast.trashed") : t("automations.toast.deleted"));
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
        kind: folder.kind,
        id: folder.id,
      });
      await refresh();
      onRefresh?.();
      toast.success(t("automations.toast.folderDeleted", { name: folder.name }));
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.folderDeleteFail")));
    }
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
      toast.success(t("automations.toast.renamed", { name: trimmed }));
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
  }, [selected.size, createOpen, focusKey, sorted, flatKeys, dragRow]);

  const moveFolders = useMemo(() => {
    const kinds = new Set(
      selectedRows.filter((r) => r.kind !== "script").map((r) => r.kind),
    );
    return folders.filter((f) => kinds.has(f.kind));
  }, [folders, selectedRows]);

  const ctxMenuItems = useMemo(() => {
    if (!ctxRow) return [];
    const rowFolders =
      ctxRow.kind === "script"
        ? []
        : folders.filter((f) => f.kind === ctxRow.kind);
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
        submenu: [
          {
            id: "folder-macro",
            label: t("automations.menu.empty.folderMacros"),
            icon: <Workflow size={14} />,
            onSelect: () => void onCreateFolder("macro"),
          },
          {
            id: "folder-clicker",
            label: t("automations.menu.empty.folderClickers"),
            icon: <MousePointer2 size={14} />,
            onSelect: () => void onCreateFolder("clicker"),
          },
        ],
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

  const lockTargets = selectedRows.filter((r) => r.kind !== "script");
  const canLock = lockTargets.some((r) => !r.locked);
  const canUnlock = lockTargets.some((r) => r.locked);

  return (
    <div
      className="v2-page v2-automations-page"
      ref={pageRef}
      onContextMenu={(e) => {
        e.preventDefault();
        const target = e.target as HTMLElement;
        if (
          target.closest(".v2-auto-row") ||
          target.closest(".v2-context-menu")
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
        onCreateFolder={(kind) => void onCreateFolder(kind)}
        searchInputRef={searchInputRef}
        createOpen={createOpen}
        onCreateOpenChange={setCreateOpen}
      />

      <div
        className="v2-page-body v2-automations-list-body"
        ref={listScrollRef}
      >
        {loading || sorted.length > 0 ? (
          <div
            className="v2-automations-list"
            role={loading ? undefined : "list"}
            aria-busy={loading || undefined}
            aria-label={
              loading ? t("automations.empty.loadingAria") : undefined
            }
          >
            <div className="v2-auto-colhead">
              <span className="v2-auto-colhead-check" aria-hidden />
              <div className="v2-auto-colhead-identity">
                <span className="v2-auto-colhead-kind" aria-hidden />
                <button
                  type="button"
                  role="columnheader"
                  className={[
                    "v2-auto-colhead-label",
                    "v2-auto-colhead-order",
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
                          ? "v2-auto-colhead-sort-icon is-desc"
                          : "v2-auto-colhead-sort-icon"
                      }
                    />
                  ) : null}
                </button>
                <button
                  type="button"
                  role="columnheader"
                  className={[
                    "v2-auto-colhead-label",
                    "v2-auto-colhead-name",
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
                          ? "v2-auto-colhead-sort-icon is-desc"
                          : "v2-auto-colhead-sort-icon"
                      }
                    />
                  ) : null}
                </button>
              </div>
              <button
                type="button"
                role="columnheader"
                className={[
                  "v2-auto-colhead-label",
                  "v2-auto-colhead-type",
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
                        ? "v2-auto-colhead-sort-icon is-desc"
                        : "v2-auto-colhead-sort-icon"
                    }
                  />
                ) : null}
              </button>
              <div className="v2-auto-row-props v2-auto-colhead-props">
                <span className="v2-auto-colhead-label v2-auto-row-prop v2-auto-row-prop--trigger">
                  {t("automations.columns.trigger")}
                </span>
                <span className="v2-auto-colhead-label v2-auto-row-prop v2-auto-row-prop--secondary">
                  {t("automations.columns.folderMeta")}
                </span>
                <span className="v2-auto-colhead-label v2-auto-row-prop v2-auto-row-prop--run">
                  {t("automations.columns.lastRun")}
                </span>
                <span className="v2-auto-colhead-label v2-auto-row-prop v2-auto-row-prop--status">
                  {t("automations.columns.status")}
                </span>
              </div>
              <span className="v2-auto-colhead-trail" aria-hidden />
            </div>
            {loading ? (
              <div className="v2-auto-skeleton-page">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="v2-auto-skeleton-row">
                    <div className="v2-skeleton v2-auto-skeleton-check" />
                    <div className="v2-auto-skeleton-identity">
                      <div className="v2-skeleton v2-auto-skeleton-kind" />
                      <div className="v2-auto-skeleton-text">
                        <div
                          className="v2-skeleton v2-skeleton-line v2-skeleton-line--lg"
                          style={{ width: `${52 - i * 5}%` }}
                        />
                        <div
                          className="v2-skeleton v2-skeleton-line"
                          style={{ width: `${36 - i * 3}%` }}
                        />
                      </div>
                    </div>
                    <div className="v2-skeleton v2-auto-skeleton-type" />
                    <div className="v2-auto-skeleton-props">
                      <div className="v2-skeleton v2-auto-skeleton-prop v2-auto-skeleton-prop--trigger" />
                      <div className="v2-skeleton v2-auto-skeleton-prop v2-auto-skeleton-prop--secondary" />
                      <div className="v2-skeleton v2-auto-skeleton-prop v2-auto-skeleton-prop--run" />
                      <div className="v2-skeleton v2-auto-skeleton-prop v2-auto-skeleton-prop--status" />
                    </div>
                    <div className="v2-auto-skeleton-trail" aria-hidden />
                  </div>
                ))}
              </div>
            ) : (
              <>
            {sections.map((section) => {
              const collapsed = collapsedSections.has(section.id);
              const sectionDropKey =
                section.kind === "folder" && section.folder
                  ? folderOptionKey(section.folder)
                  : section.kind === "unfiled"
                    ? "root"
                    : null;
              const dropCompatible =
                dragRow != null &&
                dragRow.kind !== "script" &&
                (section.kind === "unfiled" ||
                  (section.folder != null &&
                    section.folder.kind === dragRow.kind));
              return (
                <div key={section.id} className="v2-automations-section">
                  {section.label ? (
                    <div
                      className={[
                        "v2-auto-folder-section",
                        dropCompatible && dropFolderKey === sectionDropKey
                          ? "is-drop-over"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onPointerEnter={() => {
                        if (dropCompatible && sectionDropKey) {
                          setDropFolderKey(sectionDropKey);
                        }
                      }}
                      onPointerLeave={() => {
                        if (sectionDropKey) {
                          setDropFolderKey((k) =>
                            k === sectionDropKey ? null : k,
                          );
                        }
                      }}
                      onPointerUp={() => {
                        if (!dropCompatible || !dragRow) return;
                        if (section.kind === "unfiled") {
                          void moveRowToFolder(dragRow, null);
                        } else if (section.folder) {
                          void moveRowToFolder(dragRow, section.folder);
                        }
                        clearFolderDrag();
                      }}
                    >
                      <button
                        type="button"
                        className="v2-auto-folder-section-toggle"
                        aria-expanded={!collapsed}
                        onClick={() => toggleSection(section.id)}
                      >
                        <ChevronDown
                          size={12}
                          aria-hidden
                          className={[
                            "v2-automations-section-chevron",
                            collapsed ? "is-collapsed" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        />
                        <Folder
                          size={13}
                          aria-hidden
                          className="v2-auto-folder-section-icon"
                        />
                        <span className="v2-auto-folder-section-label">
                          {section.label}
                        </span>
                        {section.folder ? (
                          <span className="v2-auto-folder-section-kind">
                            {section.folder.kind === "macro" ? "M" : "C"}
                          </span>
                        ) : null}
                      </button>
                      {section.folder ? (
                        <DropdownMenu
                          label={t("automations.folder.manageLabel")}
                          ariaLabel={t("automations.folder.sectionMenuAria", {
                            name: section.folder.name,
                          })}
                          align="end"
                          triggerClassName="v2-btn v2-btn-ghost v2-auto-folder-section-menu"
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
                          <MoreHorizontal size={14} aria-hidden />
                        </DropdownMenu>
                      ) : null}
                    </div>
                  ) : null}
                  {collapsed
                    ? null
                    : section.items.map((r) => {
                        const key = rowKey(r);
                        const isSelected = selected.has(key);
                        const pill = statusToPill(r.status, t);
                        const scriptRunning =
                          r.kind === "script" &&
                          liveScriptName != null &&
                          liveScriptName === r.name;
                        const permCount = r.permLabels?.length ?? 0;
                        const propSecondary =
                          r.kind === "script"
                            ? null
                            : r.folderLabel !== empty
                              ? r.folderLabel
                              : (r.meta ?? null);
                        const propLastRun =
                          r.lastRunLabel !== empty ? r.lastRunLabel : null;
                        const subtitle = rowSubtitle(r, t, {
                          running: scriptRunning,
                        });
                        const dropBefore =
                          dropEdge?.key === key && dropEdge.edge === "before";
                        const dropAfter =
                          dropEdge?.key === key && dropEdge.edge === "after";
                        return (
                          <div
                            key={key}
                            role="listitem"
                            data-row-key={key}
                            className={[
                              "v2-auto-row",
                              isSelected ? "is-selected" : "",
                              menuKey === key ? "is-menu-open" : "",
                              scriptRunning ? "is-running" : "",
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
                              if (e.shiftKey || e.metaKey || e.ctrlKey) {
                                e.preventDefault();
                                toggleSelect(key, {
                                  multi: e.metaKey || e.ctrlKey,
                                  range: e.shiftKey,
                                });
                                return;
                              }
                              if (accueilPrefs.openOnSingleClick) {
                                openRow(r);
                              } else {
                                setFocusKey(key);
                                toggleSelect(key, { multi: false, range: false });
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
                            <Tooltip content={t("automations.row.selectTip")}>
                              <label
                                className="v2-auto-row-check"
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
                            </Tooltip>
                            <div
                              className="v2-auto-row-identity"
                              onPointerDown={(e) => {
                                if (e.button !== 0) return;
                                if (folderDragArmedRef.current) return;
                                const pointerId = e.pointerId;
                                folderDragSessionRef.current = {
                                  row: r,
                                  pointerId,
                                  startX: e.clientX,
                                  startY: e.clientY,
                                };

                                const onMove = (ev: PointerEvent) => {
                                  const s = folderDragSessionRef.current;
                                  if (!s || ev.pointerId !== s.pointerId) return;
                                  if (!folderDragArmedRef.current) {
                                    const dx = ev.clientX - s.startX;
                                    const dy = ev.clientY - s.startY;
                                    if (
                                      Math.hypot(dx, dy) <
                                      accueilPrefs.dragThresholdPx
                                    ) {
                                      return;
                                    }
                                    folderDragArmedRef.current = true;
                                    setDragRow(s.row);
                                    setDragGhost({
                                      name: s.row.name,
                                      kind: s.row.kind,
                                      x: ev.clientX,
                                      y: ev.clientY,
                                    });
                                  }
                                  autoScrollNearEdges(ev.clientY);
                                  setDragGhost((g) =>
                                    g
                                      ? {
                                          ...g,
                                          x: ev.clientX,
                                          y: ev.clientY,
                                        }
                                      : g,
                                  );
                                  if (dropFolderKeyRef.current) {
                                    dropEdgeRef.current = null;
                                    setDropEdge(null);
                                    return;
                                  }
                                  const hit = hitTestRowDrop(
                                    ev.clientX,
                                    ev.clientY,
                                    s.row,
                                    dropEdgeRef.current,
                                  );
                                  dropEdgeRef.current = hit;
                                  setDropEdge(hit);
                                };

                                const onUp = (ev: PointerEvent) => {
                                  if (ev.pointerId !== pointerId) return;
                                  window.removeEventListener("pointermove", onMove);
                                  window.removeEventListener("pointerup", onUp);
                                  window.removeEventListener(
                                    "pointercancel",
                                    onUp,
                                  );
                                  const s = folderDragSessionRef.current;
                                  const armed = folderDragArmedRef.current;
                                  const edge = dropEdgeRef.current;
                                  const overFolder = dropFolderKeyRef.current;
                                  if (!armed || !s) {
                                    clearFolderDrag();
                                    return;
                                  }
                                  // Always suppress the synthetic click after an armed drag.
                                  suppressClickAfterDragRef.current = true;
                                  if (overFolder) {
                                    // Folder chip/strip handles the move on its pointerUp.
                                    clearFolderDrag({ suppressClick: true });
                                    return;
                                  }
                                  if (
                                    edge &&
                                    displayRef.current.sortBy === "order"
                                  ) {
                                    const target = sortedRef.current.find(
                                      (row) => rowKey(row) === edge.key,
                                    );
                                    if (target) {
                                      const resolved = resolveAccueilReorderDrop(
                                        s.row,
                                        target,
                                        edge.edge,
                                        sortedRef.current,
                                      );
                                      clearFolderDrag({ suppressClick: true });
                                      if (resolved) {
                                        reorderRow(
                                          s.row,
                                          resolved.beforeKey,
                                        );
                                      }
                                      return;
                                    }
                                  }
                                  clearFolderDrag({ suppressClick: true });
                                };

                                window.addEventListener("pointermove", onMove);
                                window.addEventListener("pointerup", onUp);
                                window.addEventListener("pointercancel", onUp);
                              }}
                            >
                              <KindIcon row={r} />
                              <div className="v2-auto-row-main">
                                <TruncatedTooltip content={r.name}>
                                  <span className="v2-auto-row-name">
                                    {scriptRunning ? (
                                      <span
                                        className="v2-auto-row-run-dot"
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
                                        "v2-auto-row-sub",
                                        scriptRunning ? "is-running" : "",
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
                              className={`v2-auto-type-badge v2-auto-type-badge--${r.kind}`}
                            >
                              {kindLabel(r.kind, t)}
                            </span>
                            <div className="v2-auto-row-props">
                              {scriptRunning ? (
                                <span className="v2-auto-row-prop v2-auto-row-prop--trigger is-running">
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
                                    className="v2-auto-row-prop v2-auto-row-prop--trigger"
                                    tabIndex={0}
                                  >
                                    <span className="v2-auto-row-perm-badge">
                                      {t("automations.row.permAccess", { count: permCount })}
                                    </span>
                                  </span>
                                </Tooltip>
                              ) : (
                                <TruncatedTooltip content={metaTooltip(r, t)}>
                                  <span className="v2-auto-row-prop v2-auto-row-prop--trigger">
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
                                    "v2-auto-row-prop",
                                    "v2-auto-row-prop--secondary",
                                    dragRow &&
                                    dragRow.kind !== "script" &&
                                    r.folderId &&
                                    r.kind === dragRow.kind &&
                                    dropFolderKey ===
                                      folderOptionKey({
                                        kind: r.kind,
                                        id: r.folderId,
                                      })
                                      ? "is-drop-over"
                                      : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  onPointerEnter={() => {
                                    if (
                                      !dragRow ||
                                      dragRow.kind === "script" ||
                                      !r.folderId ||
                                      r.kind !== dragRow.kind
                                    ) {
                                      return;
                                    }
                                    setDropFolderKey(
                                      folderOptionKey({
                                        kind: r.kind,
                                        id: r.folderId,
                                      }),
                                    );
                                  }}
                                  onPointerLeave={() => {
                                    if (!r.folderId) return;
                                    const key = folderOptionKey({
                                      kind: r.kind as "macro" | "clicker",
                                      id: r.folderId,
                                    });
                                    setDropFolderKey((k) =>
                                      k === key ? null : k,
                                    );
                                  }}
                                  onPointerUp={(e) => {
                                    if (
                                      !dragRow ||
                                      dragRow.kind === "script" ||
                                      !r.folderId ||
                                      r.kind !== dragRow.kind
                                    ) {
                                      return;
                                    }
                                    e.stopPropagation();
                                    void moveRowToFolder(dragRow, {
                                      id: r.folderId,
                                      name: r.folderLabel,
                                      kind: r.kind,
                                    });
                                    clearFolderDrag();
                                  }}
                                >
                                  {propSecondary ? (
                                    <>
                                      <Folder size={11} aria-hidden />
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
                                <span className="v2-auto-row-prop v2-auto-row-prop--run">
                                  {propLastRun ?? ""}
                                </span>
                              </Tooltip>
                              <Tooltip content={statusTooltip(r.status, t)}>
                                <span
                                  className={[
                                    "v2-auto-row-prop",
                                    "v2-auto-row-prop--status",
                                    `is-${pill.kind}`,
                                  ].join(" ")}
                                  tabIndex={0}
                                >
                                  <span
                                    className="v2-auto-status-dot"
                                    aria-hidden
                                  />
                                  {pill.label}
                                </span>
                              </Tooltip>
                            </div>
                            <div
                              className="v2-auto-row-trail"
                              onClick={(e) => e.stopPropagation()}
                              onDoubleClick={(e) => e.stopPropagation()}
                            >
                              <Tooltip
                                content={
                                  r.kind === "script"
                                    ? t("automations.row.executeTip")
                                    : t("automations.row.playTip")
                                }
                              >
                                  <button
                                    type="button"
                                    className="v2-auto-row-play-btn"
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
                              {r.kind !== "script" ? (
                                <Tooltip content={favoriteTooltip(r.favorite, t)}>
                                  <button
                                    type="button"
                                    className={[
                                      "v2-automation-fav",
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
                              ) : null}
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
                                moveFolders={
                                  r.kind === "script"
                                    ? []
                                    : folders.filter((f) => f.kind === r.kind)
                                }
                                onMoveToFolder={(folder) =>
                                  void moveRowToFolder(r, folder)
                                }
                              />
                            </div>
                          </div>
                        );
                      })}
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
          className="v2-automations-selection-dock"
          role="toolbar"
          aria-label={t("automations.selection.aria")}
        >
          <span className="v2-automations-selection-count">
            {selected.size === 1
              ? t("automations.selection.countOne", { count: selected.size })
              : t("automations.selection.countMany", { count: selected.size })}
          </span>
          <div className="v2-automations-selection-actions">
            <button
              type="button"
              className="v2-btn v2-btn-ghost"
              onClick={onOpenSelected}
            >
              {t("common.open")}
            </button>
            <button
              type="button"
              className="v2-btn v2-btn-primary"
              onClick={onLaunchSelected}
            >
              {t("automations.selection.launch")}
            </button>
            <button
              type="button"
              className="v2-btn v2-btn-ghost"
              onClick={() => void onFavoriteSelected()}
            >
              {t("automations.selection.favorite")}
            </button>
            {canLock ? (
              <button
                type="button"
                className="v2-btn v2-btn-ghost"
                onClick={() => void onLockSelected(true)}
              >
                <Lock size={14} aria-hidden />
                {t("automations.selection.lock")}
              </button>
            ) : null}
            {canUnlock ? (
              <button
                type="button"
                className="v2-btn v2-btn-ghost"
                onClick={() => void onLockSelected(false)}
              >
                <LockOpen size={14} aria-hidden />
                {t("automations.selection.unlock")}
              </button>
            ) : null}
            {moveFolders.length > 0 ? (
              <DropdownMenu
                label={t("automations.selection.folder")}
                ariaLabel={t("automations.selection.folderAria")}
                align="end"
                triggerClassName="v2-btn v2-btn-ghost"
                items={[
                  ...(selectedRows.some((r) => r.kind === "macro")
                    ? [
                        {
                          id: "root-macro",
                          label: t("automations.selection.noFolderMacros"),
                          icon: <Folder size={14} />,
                          onSelect: () => void onMoveSelected(null, "macro"),
                        },
                      ]
                    : []),
                  ...(selectedRows.some((r) => r.kind === "clicker")
                    ? [
                        {
                          id: "root-clicker",
                          label: t("automations.selection.noFolderClickers"),
                          icon: <Folder size={14} />,
                          onSelect: () => void onMoveSelected(null, "clicker"),
                        },
                      ]
                    : []),
                  ...moveFolders.map((f) => ({
                    id: folderOptionKey(f),
                    label: t("automations.folder.namedWithKind", {
                      name: f.name,
                      kind:
                        f.kind === "macro"
                          ? t("automations.folder.kindSuffixMacro")
                          : t("automations.folder.kindSuffixClicker"),
                    }),
                    icon: <Folder size={14} />,
                    onSelect: () => void onMoveSelected(f.id, f.kind),
                  })),
                ]}
              >
                <Folder size={14} aria-hidden />
                {t("automations.selection.folder")}
                <ChevronDown size={14} aria-hidden />
              </DropdownMenu>
            ) : null}
            <button
              type="button"
              className="v2-btn v2-btn-danger-ghost"
              onClick={() => void onDeleteSelected()}
            >
              {t("automations.selection.trash")}
            </button>
            <button
              type="button"
              className="v2-btn v2-btn-ghost"
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
              className="v2-auto-drag-ghost"
              style={{
                transform: `translate(${dragGhost.x + 12}px, ${dragGhost.y + 12}px)`,
              }}
              aria-hidden
            >
              <span
                className={`v2-auto-type-badge v2-auto-type-badge--${dragGhost.kind}`}
              >
                {kindLabel(dragGhost.kind, t)}
              </span>
              <span className="v2-auto-drag-ghost-name">{dragGhost.name}</span>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
