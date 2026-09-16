import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  Lock,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { Icons } from "../ui";
import {
  ContextMenu,
  useContextMenuState,
} from "../ui/shell";
import type { LibraryItemView, LibraryKind } from "./types";
import { buildLibraryItemMenuItems } from "./libraryItemMenuItems";
import { useLibraryIndex } from "./useLibraryIndex";
import "./library.css";

const DRAG_THRESHOLD_PX = 6;
const EDGE_HYSTERESIS_PX = 6;

type DropPlacement = {
  folderId: string | null;
  beforeId: string | null;
  indicatorId: string | null;
  edge: "before" | "after" | "folder" | null;
};

type Props = {
  /** Macro or clicker tree. Script folder membership is managed on Accueil. */
  kind: LibraryKind;
  title: string;
  subtitle?: string;
  activeId: string | null;
  favoriteIds: string[];
  dirtyId?: string | null;
  disabled?: boolean;
  refreshKey?: number;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRenameRequest?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
};

function displayName(kind: LibraryKind, name: string): string {
  if (kind === "macro" && !name.toLowerCase().endsWith(".mcr")) {
    return `${name}.mcr`;
  }
  return name;
}

function hitTestDropTarget(
  x: number,
  y: number,
  dragId: string | null,
  prev: DropPlacement | null,
): DropPlacement | null {
  const el = document.elementFromPoint(x, y);
  if (!el || !(el instanceof Element)) return null;

  const itemEl = el.closest(".library-item");
  if (itemEl instanceof HTMLElement) {
    const itemId = itemEl.getAttribute("data-library-item-id");
    if (itemId && itemId !== dragId) {
      const folderRaw = itemEl.getAttribute("data-library-item-folder");
      const folderId =
        folderRaw == null || folderRaw === "" ? null : folderRaw;
      const rect = itemEl.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const prevEdge =
        prev?.indicatorId === itemId &&
        (prev.edge === "before" || prev.edge === "after")
          ? prev.edge
          : null;
      let edge: "before" | "after";
      if (prevEdge && Math.abs(y - mid) < EDGE_HYSTERESIS_PX) {
        edge = prevEdge;
      } else {
        edge = y < mid ? "before" : "after";
      }
      if (edge === "before") {
        return {
          folderId,
          beforeId: itemId,
          indicatorId: itemId,
          edge: "before",
        };
      }
      let next: Element | null = itemEl.nextElementSibling;
      while (next && !next.classList.contains("library-item")) {
        next = next.nextElementSibling;
      }
      const beforeId =
        next instanceof HTMLElement
          ? next.getAttribute("data-library-item-id")
          : null;
      return {
        folderId,
        beforeId,
        indicatorId: itemId,
        edge: "after",
      };
    }
  }

  const folder = el.closest("[data-library-drop-folder]");
  if (folder) {
    const id = folder.getAttribute("data-library-drop-folder");
    if (id) {
      return {
        folderId: id,
        beforeId: null,
        indicatorId: null,
        edge: "folder",
      };
    }
  }

  if (el.closest("[data-library-tree]")) {
    return {
      folderId: null,
      beforeId: null,
      indicatorId: null,
      edge: null,
    };
  }
  return null;
}

function isNoOpPlacement(
  dragId: string,
  placement: DropPlacement,
  folderMap: Map<string, string | null>,
  siblingsByFolder: Map<string | null, string[]>,
): boolean {
  const currentFolder = folderMap.get(dragId) ?? null;
  if (currentFolder !== placement.folderId) return false;
  const siblings = siblingsByFolder.get(currentFolder) ?? [];
  const curIdx = siblings.indexOf(dragId);
  if (curIdx < 0) return false;
  const nextId = siblings[curIdx + 1] ?? null;
  return placement.beforeId === nextId;
}

function ItemMenu({
  item,
  folders,
  trashed,
  onMove,
  onDuplicate,
  onRename,
  onToggleLock,
  onTrash,
  onRestore,
  onDelete,
}: {
  item: LibraryItemView;
  folders: { id: string; name: string }[];
  trashed: boolean;
  onMove: (folderId: string | null) => void;
  onDuplicate?: () => void;
  onRename?: () => void;
  onToggleLock: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const items = buildLibraryItemMenuItems(item, {
    folders,
    trashed,
    onMove,
    onDuplicate,
    onRename,
    onToggleLock,
    onTrash,
    onRestore,
    onDelete,
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="library-menu-wrap" ref={ref}>
      <button
        type="button"
        className="icon-ghost library-item-menu-btn"
        title="Actions"
        aria-label={`Actions pour ${item.name}`}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical size={14} aria-hidden />
      </button>
      {open ? (
        <div className="library-menu" role="menu">
          {items.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              className={entry.danger ? "danger-text" : undefined}
              onClick={() => {
                setOpen(false);
                entry.onSelect?.();
              }}
            >
              {entry.label}
            </button>
          ))}
          {item.locked && !trashed ? (
            <p className="hint library-menu-locked-hint">
              Verrouillé — déverrouille pour renommer ou supprimer.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LibraryItemRow({
  kind,
  item,
  folders,
  disabled,
  canDrag,
  isDragging,
  dropEdge,
  onSelect,
  onDuplicate,
  onDelete,
  onRenameRequest,
  onToggleFavorite,
  onMove,
  onToggleLock,
  onTrash,
  onRestore,
  onItemPointerDown,
  suppressClickRef,
}: {
  kind: LibraryKind;
  item: LibraryItemView;
  folders: { id: string; name: string }[];
  disabled?: boolean;
  canDrag: boolean;
  isDragging: boolean;
  dropEdge: "before" | "after" | null;
  onSelect: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRenameRequest?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
  onMove: (folderId: string | null) => void;
  onToggleLock: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onItemPointerDown: (id: string, e: ReactPointerEvent) => void;
  suppressClickRef: MutableRefObject<boolean>;
}) {
  const ctxMenu = useContextMenuState();
  const menuItems = buildLibraryItemMenuItems(item, {
    folders,
    trashed: item.trashed,
    onMove,
    onDuplicate: onDuplicate ? () => onDuplicate(item.id) : undefined,
    onRename: onRenameRequest ? () => onRenameRequest(item.id) : undefined,
    onToggleLock,
    onTrash,
    onRestore,
    onDelete: onDelete ? () => onDelete(item.id) : undefined,
  });

  return (
    <li
      className={[
        "library-item",
        "library-tree-file",
        "has-hover-reveal",
        item.active ? "is-active" : "",
        canDrag ? "is-draggable" : "",
        isDragging ? "is-dragging" : "",
        dropEdge === "before" ? "is-drop-before" : "",
        dropEdge === "after" ? "is-drop-after" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-library-item-id={item.id}
      data-library-item-folder={item.folderId ?? ""}
      onContextMenu={(e) => {
        if (disabled || menuItems.length === 0) return;
        if ((e.target as HTMLElement).closest(".library-menu-wrap")) return;
        ctxMenu.openFromEvent(e);
      }}
    >
      {onToggleFavorite ? (
        <button
          type="button"
          className={[
            "icon-ghost",
            "preset-fav",
            "hover-reveal",
            item.favorite ? "is-on is-pinned" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={disabled}
          title={item.favorite ? "Retirer des favoris" : "Favori"}
          aria-pressed={item.favorite}
          onClick={() => onToggleFavorite(item.id)}
        >
          {item.favorite ? Icons.starFilled : Icons.star}
        </button>
      ) : null}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        className="library-item-main"
        aria-disabled={disabled || undefined}
        aria-current={item.active ? "true" : undefined}
        onPointerDown={(e) => {
          if (!canDrag || disabled || e.button !== 0) return;
          onItemPointerDown(item.id, e);
        }}
        onClick={(e) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (disabled) return;
          if (e.shiftKey && onToggleFavorite) {
            onToggleFavorite(item.id);
            return;
          }
          onSelect(item.id);
        }}
        onDoubleClick={() => {
          if (!disabled) onRenameRequest?.(item.id);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(item.id);
          }
        }}
      >
        <span className="library-file-icon" aria-hidden>
          <FileText size={14} />
        </span>
        <span className="library-item-text">
          <span className="library-item-name">{displayName(kind, item.name)}</span>
          {item.meta ? <span className="library-item-meta">{item.meta}</span> : null}
        </span>
      </div>
      <span className="library-item-badges">
        {item.dirty ? <span className="library-dirty">modifié</span> : null}
        {item.locked ? (
          <span className="library-lock" title="Verrouillé">
            <Lock size={14} aria-hidden />
          </span>
        ) : null}
      </span>
      <div className="library-item-actions hover-reveal">
        <ItemMenu
          item={item}
          folders={folders}
          trashed={item.trashed}
          onMove={onMove}
          onDuplicate={onDuplicate ? () => onDuplicate(item.id) : undefined}
          onRename={onRenameRequest ? () => onRenameRequest(item.id) : undefined}
          onToggleLock={onToggleLock}
          onTrash={onTrash}
          onRestore={onRestore}
          onDelete={onDelete ? () => onDelete(item.id) : undefined}
        />
        {onDelete && item.trashed ? (
          <button
            type="button"
            className="icon-ghost danger-text"
            disabled={disabled}
            title="Supprimer"
            onClick={() => onDelete(item.id)}
          >
            <Trash2 size={14} aria-hidden />
          </button>
        ) : null}
      </div>
      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        items={menuItems}
        onClose={ctxMenu.close}
        onSelect={(id) => {
          menuItems.find((entry) => entry.id === id)?.onSelect?.();
        }}
        ariaLabel={`Actions pour ${item.name}`}
      />
    </li>
  );
}

type PointerSession = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
};

export function LibrarySidebar({
  kind,
  title,
  subtitle,
  activeId,
  favoriteIds,
  dirtyId,
  disabled,
  refreshKey = 0,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
  onRenameRequest,
  onToggleFavorite,
}: Props) {
  const lib = useLibraryIndex(kind, {
    activeId,
    favoriteIds,
    dirtyId,
    refreshKey,
  });
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropPlacement | null>(null);
  const sessionRef = useRef<PointerSession | null>(null);
  const dropTargetRef = useRef<DropPlacement | null>(null);
  const suppressClickRef = useRef(false);
  const seenFolders = useRef<Set<string>>(new Set());
  const itemFolderMapRef = useRef(new Map<string, string | null>());
  const siblingsByFolderRef = useRef(new Map<string | null, string[]>());
  const disabledRef = useRef(disabled);
  const moveItemRef = useRef(lib.moveItem);
  const setExpandedRef = useRef(setExpanded);

  const kindLabel = kind === "macro" ? "macro" : "preset";
  const showTree =
    lib.filterId === "__all" && !lib.query.trim();

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const f of lib.folders) {
        if (!seenFolders.current.has(f.id)) {
          seenFolders.current.add(f.id);
          next.add(f.id);
          changed = true;
        }
      }
      for (const id of [...seenFolders.current]) {
        if (!lib.folders.some((f) => f.id === id)) {
          seenFolders.current.delete(id);
          if (next.delete(id)) changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [lib.folders]);

  const rootItems = useMemo(
    () => lib.items.filter((i) => !i.folderId),
    [lib.items],
  );

  const itemsByFolder = useMemo(() => {
    const map = new Map<string, LibraryItemView[]>();
    for (const item of lib.items) {
      if (!item.folderId) continue;
      const list = map.get(item.folderId) ?? [];
      list.push(item);
      map.set(item.folderId, list);
    }
    return map;
  }, [lib.items]);

  const itemFolderMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const item of lib.items) {
      map.set(item.id, item.folderId);
    }
    return map;
  }, [lib.items]);

  const siblingsByFolder = useMemo(() => {
    const map = new Map<string | null, string[]>();
    map.set(null, rootItems.map((i) => i.id));
    for (const [fid, list] of itemsByFolder) {
      map.set(fid, list.map((i) => i.id));
    }
    return map;
  }, [rootItems, itemsByFolder]);

  itemFolderMapRef.current = itemFolderMap;
  siblingsByFolderRef.current = siblingsByFolder;
  disabledRef.current = disabled;
  moveItemRef.current = lib.moveItem;
  setExpandedRef.current = setExpanded;

  function toggleFolder(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearPointerDrag() {
    sessionRef.current = null;
    dropTargetRef.current = null;
    setDragId(null);
    setDropTarget(null);
    document.body.classList.remove("library-is-dragging");
  }

  function onItemPointerDown(id: string, e: ReactPointerEvent) {
    if (disabledRef.current) return;
    sessionRef.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };

    const onMove = (ev: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || ev.pointerId !== session.pointerId) return;
      const dx = ev.clientX - session.startX;
      const dy = ev.clientY - session.startY;
      if (!session.active) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        session.active = true;
        suppressClickRef.current = true;
        setDragId(session.id);
        document.body.classList.add("library-is-dragging");
      }
      const target = hitTestDropTarget(
        ev.clientX,
        ev.clientY,
        session.id,
        dropTargetRef.current,
      );
      dropTargetRef.current = target;
      setDropTarget(target);
    };

    const onUp = (ev: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || ev.pointerId !== session.pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      const wasActive = session.active;
      const dragItemId = session.id;
      const target = wasActive
        ? hitTestDropTarget(
            ev.clientX,
            ev.clientY,
            dragItemId,
            dropTargetRef.current,
          )
        : null;
      clearPointerDrag();

      if (!wasActive || disabledRef.current || !target) return;
      if (
        isNoOpPlacement(
          dragItemId,
          target,
          itemFolderMapRef.current,
          siblingsByFolderRef.current,
        )
      ) {
        return;
      }

      void moveItemRef
        .current(dragItemId, target.folderId, target.beforeId)
        .then(() => {
          if (target.folderId) {
            setExpandedRef.current((prev) => new Set(prev).add(target.folderId!));
          }
        });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  async function submitFolder() {
    const n = folderName.trim();
    if (!n) return;
    await lib.createFolder(n);
    setFolderName("");
    setNewFolder(false);
  }

  const empty =
    showTree
      ? lib.folders.length === 0 && lib.items.length === 0
      : lib.items.length === 0;

  function renderItem(item: LibraryItemView) {
    const canDrag = Boolean(showTree && !disabled && !item.trashed);
    const dropEdge =
      dropTarget?.indicatorId === item.id &&
      (dropTarget.edge === "before" || dropTarget.edge === "after")
        ? dropTarget.edge
        : null;
    return (
      <LibraryItemRow
        key={item.id}
        kind={kind}
        item={item}
        folders={lib.folders}
        disabled={disabled}
        canDrag={canDrag}
        isDragging={dragId === item.id}
        dropEdge={dropEdge}
        onSelect={onSelect}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onRenameRequest={onRenameRequest}
        onToggleFavorite={onToggleFavorite}
        onMove={(fid) => void lib.moveItem(item.id, fid)}
        onToggleLock={() => void lib.setLocked(item.id, !item.locked)}
        onTrash={() => void lib.trashItem(item.id)}
        onRestore={() => void lib.restoreItem(item.id)}
        onItemPointerDown={onItemPointerDown}
        suppressClickRef={suppressClickRef}
      />
    );
  }

  return (
    <aside className="library-sidebar macro-library" aria-label={`Bibliothèque ${title}`}>
      <div className="library-head">
        <div className="library-head-row">
          <div>
            <h2 className="library-title">{title}</h2>
            {subtitle ? <p className="library-sub">{subtitle}</p> : null}
          </div>
        </div>
        <input
          type="search"
          className="library-search"
          placeholder={`Rechercher ${kind === "macro" ? "macros" : "presets"}…`}
          value={lib.query}
          disabled={disabled}
          aria-label="Rechercher"
          onChange={(e) => lib.setQuery(e.target.value)}
        />
      </div>

      <div className="library-actions-row">
        <button type="button" className="ghost" disabled={disabled} onClick={onCreate}>
          + Nouveau
        </button>
        <button
          type="button"
          className="ghost"
          disabled={disabled}
          title="Nouveau dossier"
          onClick={() => setNewFolder((v) => !v)}
        >
          <FolderPlus size={14} aria-hidden /> Dossier
        </button>
      </div>

      {newFolder ? (
        <div className="library-actions-row">
          <input
            type="text"
            value={folderName}
            placeholder="Nom du dossier"
            disabled={disabled}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitFolder();
              if (e.key === "Escape") setNewFolder(false);
            }}
          />
          <button type="button" className="primary" disabled={disabled} onClick={() => void submitFolder()}>
            OK
          </button>
        </div>
      ) : null}

      {empty ? (
        <p className="library-empty hint">
          {lib.loading
            ? "Chargement…"
            : lib.query
              ? "Aucun résultat."
              : lib.filterId === "__trash"
                ? "Corbeille vide."
                : `Aucun ${kindLabel} — crée-en un.`}
        </p>
      ) : showTree ? (
        <ul className="library-tree" data-library-tree="">
          {lib.folders.map((folder) => {
            const open = expanded.has(folder.id);
            const children = itemsByFolder.get(folder.id) ?? [];
            return (
              <li key={folder.id} className="library-tree-node">
                <div
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  className={[
                    "library-tree-folder",
                    dropTarget?.edge === "folder" && dropTarget.folderId === folder.id
                      ? "is-drop-target"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-library-drop-folder={folder.id}
                  aria-disabled={disabled || undefined}
                  aria-expanded={open}
                  onClick={() => {
                    if (!disabled) toggleFolder(folder.id);
                  }}
                  onKeyDown={(e) => {
                    if (disabled) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleFolder(folder.id);
                    }
                  }}
                >
                  <span className="library-tree-folder-icon" aria-hidden>
                    <Folder size={14} />
                  </span>
                  <span className="library-tree-folder-name">{folder.name}</span>
                  <span className="library-tree-chevron" aria-hidden>
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                </div>
                {open ? (
                  <ul
                    className={[
                      "library-tree-children",
                      dropTarget?.edge === "folder" && dropTarget.folderId === folder.id
                        ? "is-drop-target"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-library-drop-folder={folder.id}
                  >
                    {children.length === 0 ? (
                      <li className="library-tree-empty hint">Vide</li>
                    ) : (
                      children.map((item) => renderItem(item))
                    )}
                  </ul>
                ) : null}
              </li>
            );
          })}
          {rootItems.map((item) => renderItem(item))}
        </ul>
      ) : (
        <ul className="library-items">
          {lib.items.map((item) => renderItem(item))}
        </ul>
      )}
    </aside>
  );
}
