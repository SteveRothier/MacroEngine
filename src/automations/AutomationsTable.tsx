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
  MousePointer2,
  PenLine,
  Play,
  RefreshCw,
  Star,
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
  folderKey: string | null;
  onFolderKeyChange: (key: string | null) => void;
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

function kindLabel(kind: AutomationRow["kind"]): string {
  if (kind === "macro") return "Macro";
  if (kind === "script") return "Script";
  return "Clicker";
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
  const tip = kindTooltip(row);
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
  folderKey,
  onFolderKeyChange,
  display,
  onDisplayChange,
  onFilterChange,
  onRefresh,
  onResourceRenamed,
  runningScriptName = null,
  onFocusKeyChange,
  onLaunchFocusJournal,
}: Props) {
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
    folderKey,
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
      toast.error(errMessage(e, "Impossible de modifier le favori"));
    }
  }

  async function launchRow(r: AutomationRow) {
    if (automationPrefs.confirmLaunchFromHome) {
      const ok = await confirmAction({
        title: "Lancer",
        message: `Lancer « ${r.name} » ?`,
        confirmLabel: "Lancer",
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
      toast.success(`Script lancé · ${r.name}`);
      onLaunchFocusJournal?.();
      await refresh();
      onRefresh?.();
    } catch (e) {
      toast.error(errMessage(e, "Échec du lancement script"));
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
      else cmp = a.name.localeCompare(b.name, "fr");
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
  ]);
  sortedRef.current = sorted;

  const flatKeys = useMemo(() => sorted.map(rowKey), [sorted]);

  const sections = useMemo(() => {
    if (filter !== "all" || display.sortBy === "order") {
      return [
        {
          id: "all",
          label: null as string | null,
          icon: null as "star" | "list" | null,
          items: sorted,
        },
      ];
    }
    const favs = sorted.filter((r) => r.favorite);
    const rest = sorted.filter((r) => !r.favorite);
    const out: {
      id: string;
      label: string | null;
      icon: "star" | "list" | null;
      items: AutomationRow[];
    }[] = [];
    if (favs.length > 0) {
      out.push({
        id: "favorites",
        label: `Favoris (${favs.length})`,
        icon: "star",
        items: favs,
      });
    }
    if (rest.length > 0 || favs.length === 0) {
      out.push({
        id: "all",
        label:
          favs.length > 0
            ? `Toutes les automatisations (${rest.length || sorted.length})`
            : null,
        icon: favs.length > 0 ? "list" : null,
        items: rest.length > 0 ? rest : sorted,
      });
    }
    return out;
  }, [sorted, filter, display.sortBy]);

  const selectedRows = useMemo(() => {
    return sorted.filter((r) => selected.has(rowKey(r)));
  }, [sorted, selected]);

  const emptyState = useMemo(() => {
    if (query.trim() || folderKey) {
      return (
        <EmptyState
          title="Aucun résultat"
          lead="Aucun élément ne correspond à ce filtre."
          actions={
            <>
              {query.trim() ? (
                <button
                  type="button"
                  className="v2-btn v2-btn-ghost"
                  onClick={() => onQueryChange("")}
                >
                  Effacer la recherche
                </button>
              ) : null}
              {folderKey ? (
                <button
                  type="button"
                  className="v2-btn v2-btn-ghost"
                  onClick={() => onFolderKeyChange(null)}
                >
                  Tous les dossiers
                </button>
              ) : null}
            </>
          }
        />
      );
    }
    if (filter === "favorites") {
      return (
        <EmptyState
          title="Aucun favori"
          lead="Ajoutez une automation aux favoris via l’étoile pour la retrouver ici."
          actions={
            <button
              type="button"
              className="v2-btn v2-btn-ghost"
              onClick={() => onFilterChange?.("all")}
            >
              Voir toutes les automations
            </button>
          }
        />
      );
    }
    if (filter === "recent") {
      return (
        <EmptyState
          title="Aucune exécution récente"
          lead="Lancez une macro, un clicker ou un script pour la voir apparaître ici."
          actions={
            <>
              <button type="button" className="v2-btn" onClick={onCreateClicker}>
                Nouveau clicker
              </button>
              <button type="button" className="v2-btn" onClick={onCreateScript}>
                Nouveau script
              </button>
              <button
                type="button"
                className="v2-btn v2-btn-primary"
                onClick={onCreateMacro}
              >
                Nouvelle macro
              </button>
            </>
          }
        />
      );
    }
    if (filter === "scripts") {
      return (
        <EmptyState
          title="Aucun script"
          lead="Créez un script JavaScript réutilisable pour vos macros."
          actions={
            <button
              type="button"
              className="v2-btn v2-btn-primary"
              onClick={onCreateScript}
            >
              Créer un script
            </button>
          }
        />
      );
    }
    return (
      <EmptyState
        title="Aucune automation"
        lead="Créez une macro, un preset clicker ou un script pour commencer."
        actions={
          <>
            <button type="button" className="v2-btn" onClick={onCreateClicker}>
              Clicker
            </button>
            <button type="button" className="v2-btn" onClick={onCreateScript}>
              Script
            </button>
            <button
              type="button"
              className="v2-btn v2-btn-primary"
              onClick={onCreateMacro}
            >
              Macro
            </button>
          </>
        }
      />
    );
  }, [
    filter,
    folderKey,
    onCreateClicker,
    onCreateMacro,
    onCreateScript,
    onFilterChange,
    onFolderKeyChange,
    onQueryChange,
    query,
  ]);

  async function onDeleteSelected() {
    if (selectedRows.length === 0) return;
    const hasLibrary = selectedRows.some(
      (r) => r.kind === "macro" || r.kind === "clicker",
    );
    const ok = await confirmAction({
      title: hasLibrary ? "Mettre à la corbeille" : "Supprimer",
      message: hasLibrary
        ? `Mettre ${selectedRows.length} automation${selectedRows.length > 1 ? "s" : ""} à la corbeille ?`
        : `Supprimer ${selectedRows.length} automation${selectedRows.length > 1 ? "s" : ""} ?`,
      confirmLabel: hasLibrary ? "Corbeille" : "Supprimer",
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
      toast.success(hasLibrary ? "Mis à la corbeille" : "Suppression effectuée");
    } catch (e) {
      toast.error(errMessage(e, "Échec de la suppression"));
    }
  }

  async function onFavoriteSelected() {
    const targets = selectedRows.filter((r) => r.kind !== "script");
    if (targets.length === 0) {
      toast.info("Les scripts n’ont pas de favori");
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
      toast.error(errMessage(e, "Impossible de modifier les favoris"));
    }
  }

  async function onLockSelected(locked: boolean) {
    const targets = selectedRows.filter((r) => r.kind !== "script");
    if (targets.length === 0) {
      toast.info("Les scripts ne peuvent pas être verrouillés");
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
      toast.success(locked ? "Verrouillage effectué" : "Déverrouillage effectué");
    } catch (e) {
      toast.error(errMessage(e, "Impossible de modifier le verrouillage"));
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
      toast.error(errMessage(e, "Impossible de modifier le verrouillage"));
    }
  }

  async function moveRowToFolder(
    r: AutomationRow,
    folder: AutomationFolderOption | null,
  ) {
    if (r.kind === "script") return;
    if (folder && folder.kind !== r.kind) {
      toast.info("Dossier incompatible avec ce type");
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
      toast.success("Déplacement effectué");
    } catch (e) {
      toast.error(errMessage(e, "Impossible de déplacer"));
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
    toast.success("Ordre mis à jour");
  }

  async function onCreateFolder(kind: "macro" | "clicker") {
    const name = await promptAction({
      title:
        kind === "macro" ? "Nouveau dossier (macros)" : "Nouveau dossier (clickers)",
      defaultValue: "",
      confirmLabel: "Créer",
      placeholder: "Nom du dossier",
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
      onFolderKeyChange(folderOptionKey({ kind, id: created.id }));
      toast.success(`Dossier créé · ${created.name}`);
    } catch (e) {
      toast.error(errMessage(e, "Impossible de créer le dossier"));
    }
  }

  async function onRenameFolder() {
    if (!folderKey) {
      toast.info("Filtrez d’abord un dossier à renommer");
      return;
    }
    const folder = folders.find((f) => folderOptionKey(f) === folderKey);
    if (!folder) return;
    const nextName = await promptAction({
      title: "Renommer le dossier",
      defaultValue: folder.name,
      confirmLabel: "Renommer",
      placeholder: "Nouveau nom",
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
      onFolderKeyChange(folderOptionKey({ kind: folder.kind, id: renamed.id }));
      toast.success(`Dossier renommé · ${renamed.name}`);
    } catch (e) {
      toast.error(errMessage(e, "Impossible de renommer le dossier"));
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
      toast.success("Déplacement effectué");
    } catch (e) {
      toast.error(errMessage(e, "Impossible de déplacer"));
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
        toast.success("Mis à la corbeille");
      } catch (e) {
        toast.error(errMessage(e, "Échec de la suppression"));
      }
      return;
    }
    const ok = await confirmAction({
      title: toTrash ? "Mettre à la corbeille" : "Supprimer",
      message: toTrash
        ? `Mettre « ${r.name} » à la corbeille ?`
        : `Supprimer « ${r.name} » ?`,
      confirmLabel: toTrash ? "Corbeille" : "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRow(r);
      setMenuKey(null);
      await refresh();
      onRefresh?.();
      toast.success(toTrash ? "Mis à la corbeille" : "Suppression effectuée");
    } catch (e) {
      toast.error(errMessage(e, "Échec de la suppression"));
    }
  }

  async function onDeleteFolder() {
    if (!folderKey) {
      toast.info("Filtrez d’abord un dossier à supprimer");
      return;
    }
    const folder = folders.find((f) => folderOptionKey(f) === folderKey);
    if (!folder) return;
    if (accueilPrefs.confirmDeleteFolder) {
      const ok = await confirmAction({
        title: "Supprimer le dossier",
        message: `Supprimer le dossier « ${folder.name} » ? Les automations qu’il contient resteront disponibles (hors dossier).`,
        confirmLabel: "Supprimer",
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await invoke("delete_library_folder_cmd", {
        kind: folder.kind,
        id: folder.id,
      });
      onFolderKeyChange(null);
      await refresh();
      onRefresh?.();
      toast.success(`Dossier supprimé · ${folder.name}`);
    } catch (e) {
      toast.error(errMessage(e, "Impossible de supprimer le dossier"));
    }
  }

  async function onRenameOne(r: AutomationRow) {
    if (r.locked) {
      toast.info("Déverrouillez avant de renommer");
      return;
    }
    const nextName = await promptAction({
      title: "Renommer",
      defaultValue: r.name,
      confirmLabel: "Renommer",
      placeholder: "Nouveau nom",
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
      toast.success(`Renommé · ${trimmed}`);
    } catch (e) {
      toast.error(errMessage(e, "Renommage impossible"));
    }
  }

  async function onDuplicateOne(r: AutomationRow) {
    if (r.locked) {
      toast.info("Déverrouillez avant de dupliquer");
      return;
    }
    try {
      if (r.kind === "macro") {
        const doc = await invoke<{ name: string }>("duplicate_saved_macro", {
          name: r.id,
        });
        await refresh();
        onRefresh?.();
        toast.success(`Macro dupliquée · ${doc.name}`);
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
        toast.success(`Preset dupliqué · ${preset.name}`);
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
          name: `${src.name} (copie)`,
        };
        await invoke("save_script_cmd", { doc: copy });
        await refresh();
        onRefresh?.();
        toast.success(`Script dupliqué · ${copy.name}`);
        onNavigate({
          name: "automation",
          id: copy.id,
          kind: "script",
          label: copy.name,
        });
      }
      setMenuKey(null);
    } catch (e) {
      toast.error(errMessage(e, "Duplication impossible"));
    }
  }

  async function onRevealOne(r: AutomationRow) {
    if (r.kind === "script") {
      toast.info("Les scripts sont dans le dossier config / scripts");
      return;
    }
    try {
      await invoke("reveal_library_entry", { kind: r.kind, name: r.id });
    } catch (e) {
      toast.error(errMessage(e, "Impossible d’ouvrir l’explorateur"));
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

  const dragFolders = useMemo(() => {
    if (!dragRow || dragRow.kind === "script") return [];
    return folders.filter((f) => f.kind === dragRow.kind);
  }, [dragRow, folders]);

  const ctxMenuItems = useMemo(() => {
    if (!ctxRow) return [];
    const rowFolders =
      ctxRow.kind === "script"
        ? []
        : folders.filter((f) => f.kind === ctxRow.kind);
    return buildAutomationRowMenuItems(ctxRow, {
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
  }, [ctxRow, folders]);

  const emptyMenuItems = useMemo(
    () => [
      {
        id: "create-macro",
        label: "Nouvelle macro",
        icon: <Workflow size={14} />,
        onSelect: () => onCreateMacro(),
      },
      {
        id: "create-clicker",
        label: "Nouveau clicker",
        icon: <MousePointer2 size={14} />,
        onSelect: () => onCreateClicker(),
      },
      {
        id: "create-script",
        label: "Nouveau script",
        icon: <Code2 size={14} />,
        onSelect: () => onCreateScript(),
      },
      {
        id: "create-folder",
        label: "Nouveau dossier",
        icon: <FolderPlus size={14} />,
        submenu: [
          {
            id: "folder-macro",
            label: "Macros",
            icon: <Workflow size={14} />,
            onSelect: () => void onCreateFolder("macro"),
          },
          {
            id: "folder-clicker",
            label: "Clickers",
            icon: <MousePointer2 size={14} />,
            onSelect: () => void onCreateFolder("clicker"),
          },
        ],
      },
      ...(folderKey
        ? [
            {
              id: "rename-folder",
              label: "Renommer le dossier",
              icon: <PenLine size={14} />,
              onSelect: () => void onRenameFolder(),
            },
          ]
        : []),
      { id: "sep-empty", label: "", separator: true },
      {
        id: "refresh",
        label: "Actualiser",
        icon: <RefreshCw size={14} />,
        onSelect: () => {
          void refresh();
          onRefresh?.();
        },
      },
      {
        id: "toggle-favorites",
        label:
          filter === "favorites" ? "Afficher tout" : "Afficher les favoris",
        icon: <Star size={14} />,
        onSelect: () =>
          onFilterChange?.(filter === "favorites" ? "all" : "favorites"),
      },
    ],
    [
      filter,
      folderKey,
      onCreateClicker,
      onCreateMacro,
      onCreateScript,
      onFilterChange,
      onRefresh,
      refresh,
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
        const t = e.target as HTMLElement;
        if (t.closest(".v2-auto-row") || t.closest(".v2-context-menu")) return;
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
        folderKey={folderKey}
        onFolderKeyChange={onFolderKeyChange}
        folders={folders}
        counts={counts}
        onCreateMacro={onCreateMacro}
        onCreateClicker={onCreateClicker}
        onCreateScript={onCreateScript}
        onCreateFolder={(kind) => void onCreateFolder(kind)}
        onRenameFolder={() => void onRenameFolder()}
        onDeleteFolder={() => void onDeleteFolder()}
        dragRow={dragRow}
        dropFolderKey={dropFolderKey}
        onDropFolderKeyChange={setDropFolderKey}
        onDropOntoFolder={(folder) => {
          if (!dragRow) return;
          void moveRowToFolder(dragRow, folder);
          clearFolderDrag();
        }}
        searchInputRef={searchInputRef}
        createOpen={createOpen}
        onCreateOpenChange={setCreateOpen}
      />

      <div
        className="v2-page-body v2-automations-list-body"
        ref={listScrollRef}
      >
        {loading ? (
          <div
            className="v2-skeleton-page"
            aria-busy="true"
            aria-label="Chargement des automations"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="v2-skeleton-row">
                <div className="v2-skeleton v2-skeleton-avatar" />
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    className="v2-skeleton v2-skeleton-line v2-skeleton-line--lg"
                    style={{ width: `${58 - i * 6}%` }}
                  />
                  <div
                    className="v2-skeleton v2-skeleton-line"
                    style={{ width: `${42 - i * 4}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          emptyState
        ) : (
          <div className="v2-automations-list" role="list">
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
                  title="Ordre manuel (glisser-déposer)"
                  onClick={() => setSortBy("order")}
                >
                  #
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
                  Nom
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
                Type
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
                  Déclencheur
                </span>
                <span className="v2-auto-colhead-label v2-auto-row-prop v2-auto-row-prop--secondary">
                  Dossier / Meta
                </span>
                <span className="v2-auto-colhead-label v2-auto-row-prop v2-auto-row-prop--run">
                  Dernière exécution
                </span>
                <span className="v2-auto-colhead-label v2-auto-row-prop v2-auto-row-prop--status">
                  État
                </span>
              </div>
              <span className="v2-auto-colhead-trail" aria-hidden />
            </div>
            {sections.map((section) => {
              const collapsed = collapsedSections.has(section.id);
              return (
                <div key={section.id} className="v2-automations-section">
                  {section.label ? (
                    <button
                      type="button"
                      className="v2-automations-section-label"
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
                      {section.icon === "star" ? (
                        <Star
                          size={11}
                          aria-hidden
                          className="v2-automations-section-icon"
                        />
                      ) : section.icon === "list" ? (
                        <Workflow
                          size={11}
                          aria-hidden
                          className="v2-automations-section-icon"
                        />
                      ) : null}
                      {section.label}
                    </button>
                  ) : null}
                  {collapsed
                    ? null
                    : section.items.map((r) => {
                        const key = rowKey(r);
                        const isSelected = selected.has(key);
                        const pill = statusToPill(r.status);
                        const scriptRunning =
                          r.kind === "script" &&
                          liveScriptName != null &&
                          liveScriptName === r.name;
                        const permCount = r.permLabels?.length ?? 0;
                        const propSecondary =
                          r.kind === "script"
                            ? null
                            : r.folderLabel !== "—"
                              ? r.folderLabel
                              : (r.meta ?? null);
                        const propLastRun =
                          r.lastRunLabel !== "—" ? r.lastRunLabel : null;
                        const subtitle = rowSubtitle(r, {
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
                            <Tooltip content="Sélectionner pour actions groupées">
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
                                  aria-label={`Sélectionner ${r.name}`}
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
                              {kindLabel(r.kind)}
                            </span>
                            <div className="v2-auto-row-props">
                              {scriptRunning ? (
                                <span className="v2-auto-row-prop v2-auto-row-prop--trigger is-running">
                                  <Play size={11} aria-hidden />
                                  En cours
                                </span>
                              ) : r.kind === "script" &&
                                scriptsPrefs.showPermBadgesOnHome &&
                                permCount > 0 ? (
                                <Tooltip
                                  content={`Ce script utilise : ${(r.permLabels ?? []).join(", ")}`}
                                >
                                  <span
                                    className="v2-auto-row-prop v2-auto-row-prop--trigger"
                                    tabIndex={0}
                                  >
                                    <span className="v2-auto-row-perm-badge">
                                      {permCount} accès
                                    </span>
                                  </span>
                                </Tooltip>
                              ) : (
                                <TruncatedTooltip content={metaTooltip(r)}>
                                  <span className="v2-auto-row-prop v2-auto-row-prop--trigger">
                                    <Play size={11} aria-hidden />
                                    {r.triggerLabel}
                                  </span>
                                </TruncatedTooltip>
                              )}
                              <TruncatedTooltip
                                content={propSecondary ?? metaTooltip(r)}
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
                                      ? `Dernière exécution · ${propLastRun}`
                                      : "Jamais exécuté"
                                }
                              >
                                <span className="v2-auto-row-prop v2-auto-row-prop--run">
                                  {propLastRun ?? ""}
                                </span>
                              </Tooltip>
                              <Tooltip content={statusTooltip(r.status)}>
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
                                  r.kind === "script" ? "Exécuter" : "Lancer"
                                }
                              >
                                  <button
                                    type="button"
                                    className="v2-auto-row-play-btn"
                                    aria-label={
                                      r.kind === "script"
                                        ? `Exécuter ${r.name}`
                                        : `Lancer ${r.name}`
                                    }
                                    onClick={() => void launchRow(r)}
                                  >
                                    <Play size={14} aria-hidden />
                                  </button>
                                </Tooltip>
                              {r.kind !== "script" ? (
                                <Tooltip content={favoriteTooltip(r.favorite)}>
                                  <button
                                    type="button"
                                    className={[
                                      "v2-automation-fav",
                                      r.favorite ? "is-on" : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                    aria-pressed={r.favorite}
                                    aria-label={favoriteTooltip(r.favorite)}
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
          </div>
        )}
      </div>

      {selected.size > 0 ? (
        <div
          className="v2-automations-selection-dock"
          role="toolbar"
          aria-label="Actions de sélection"
        >
          <span className="v2-automations-selection-count">
            {selected.size} élément{selected.size > 1 ? "s" : ""} sélectionné
            {selected.size > 1 ? "s" : ""}
          </span>
          <div className="v2-automations-selection-actions">
            <button
              type="button"
              className="v2-btn v2-btn-ghost"
              onClick={onOpenSelected}
            >
              Ouvrir
            </button>
            <button
              type="button"
              className="v2-btn v2-btn-primary"
              onClick={onLaunchSelected}
            >
              Lancer
            </button>
            <button
              type="button"
              className="v2-btn v2-btn-ghost"
              onClick={() => void onFavoriteSelected()}
            >
              Favori
            </button>
            {canLock ? (
              <button
                type="button"
                className="v2-btn v2-btn-ghost"
                onClick={() => void onLockSelected(true)}
              >
                <Lock size={14} aria-hidden />
                Verrouiller
              </button>
            ) : null}
            {canUnlock ? (
              <button
                type="button"
                className="v2-btn v2-btn-ghost"
                onClick={() => void onLockSelected(false)}
              >
                <LockOpen size={14} aria-hidden />
                Déverrouiller
              </button>
            ) : null}
            {moveFolders.length > 0 ? (
              <DropdownMenu
                label="Dossier"
                ariaLabel="Déplacer vers un dossier"
                align="end"
                triggerClassName="v2-btn v2-btn-ghost"
                items={[
                  ...(selectedRows.some((r) => r.kind === "macro")
                    ? [
                        {
                          id: "root-macro",
                          label: "Sans dossier (macros)",
                          icon: <Folder size={14} />,
                          onSelect: () => void onMoveSelected(null, "macro"),
                        },
                      ]
                    : []),
                  ...(selectedRows.some((r) => r.kind === "clicker")
                    ? [
                        {
                          id: "root-clicker",
                          label: "Sans dossier (clickers)",
                          icon: <Folder size={14} />,
                          onSelect: () => void onMoveSelected(null, "clicker"),
                        },
                      ]
                    : []),
                  ...moveFolders.map((f) => ({
                    id: folderOptionKey(f),
                    label: `${f.name} (${f.kind === "macro" ? "macro" : "clicker"})`,
                    icon: <Folder size={14} />,
                    onSelect: () => void onMoveSelected(f.id, f.kind),
                  })),
                ]}
              >
                <Folder size={14} aria-hidden />
                Dossier
                <ChevronDown size={14} aria-hidden />
              </DropdownMenu>
            ) : null}
            <button
              type="button"
              className="v2-btn v2-btn-danger-ghost"
              onClick={() => void onDeleteSelected()}
            >
              Corbeille
            </button>
            <button
              type="button"
              className="v2-btn v2-btn-ghost"
              onClick={() => setSelected(new Set())}
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      {dragRow && dragRow.kind !== "script" ? (
        <div
          className="v2-auto-folder-drop-strip"
          role="toolbar"
          aria-label={`Déplacer « ${dragRow.name} » vers un dossier`}
        >
          <span className="v2-auto-folder-drop-hint">
            Déposer « {dragRow.name} » :
          </span>
          <button
            type="button"
            className={[
              "v2-auto-folder-drop-chip",
              dropFolderKey === "root" ? "is-over" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onPointerEnter={() => setDropFolderKey("root")}
            onPointerLeave={() =>
              setDropFolderKey((k) => (k === "root" ? null : k))
            }
            onPointerUp={() => {
              void moveRowToFolder(dragRow, null);
              clearFolderDrag();
            }}
          >
            <Folder size={14} aria-hidden />
            Sans dossier
          </button>
          {dragFolders.map((f) => {
            const fKey = folderOptionKey(f);
            return (
              <button
                key={fKey}
                type="button"
                className={[
                  "v2-auto-folder-drop-chip",
                  dropFolderKey === fKey ? "is-over" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onPointerEnter={() => setDropFolderKey(fKey)}
                onPointerLeave={() =>
                  setDropFolderKey((k) => (k === fKey ? null : k))
                }
                onPointerUp={() => {
                  void moveRowToFolder(dragRow, f);
                  clearFolderDrag();
                }}
              >
                <Folder size={14} aria-hidden />
                {f.name}
              </button>
            );
          })}
          <button
            type="button"
            className="v2-btn v2-btn-ghost"
            onClick={() => clearFolderDrag()}
          >
            Annuler
          </button>
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
          ariaLabel={`Actions pour ${ctxRow.name}`}
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
        ariaLabel="Actions Accueil"
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
                {kindLabel(dragGhost.kind)}
              </span>
              <span className="v2-auto-drag-ghost-name">{dragGhost.name}</span>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
