import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  CircleDot,
  Clock,
  Copy,
  GitBranch,
  LayoutTemplate,
  ListPlus,
  MousePointer2,
  MousePointerClick,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import { confirmAction } from "../ui";
import {
  ContextMenu,
  findMenuItem,
  useContextMenuState,
  usePrefersReducedMotion,
  type ActionPickerEntry,
  type MenuItemDef,
} from "../ui/v2";
import { ActionParamCells } from "./ActionParamCells";
import {
  flattenTree,
  getAtPath,
  pathKey,
  pathsEqual,
  type ActionPath,
  type FlatRow,
  type MacroAction,
} from "./types";
import {
  actionDetailFr,
  actionTitleInList,
  actionTone,
  branchLabelFr,
  dragGestureEndIndex,
} from "./actionLabels";
import { actionOffsetMs, formatActionOffset } from "./sequenceUtils";

type Props = {
  actions: MacroAction[];
  selectedPath: ActionPath | null;
  activePath: ActionPath | null;
  disabled?: boolean;
  readOnly?: boolean;
  onSelect: (path: ActionPath) => void;
  onReorder: (fromPath: ActionPath, toPath: ActionPath) => void;
  onRemove: (path: ActionPath) => void;
  onDuplicate?: (path: ActionPath) => void;
  onMove?: (path: ActionPath, dir: -1 | 1) => void;
  onInsertAfter?: (path: ActionPath, kind: MacroAction["type"]) => void;
  onAddKind?: (kind: MacroAction["type"]) => void;
  onOpenAddMenu?: () => void;
  onChangeAction?: (path: ActionPath, action: MacroAction) => void;
  onEmptyAdd?: () => void;
  onStartRecord?: () => void;
  onApplyPreset?: (name: string) => void;
  onClearSelection?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  branchAddMenuItems?: (branch: "then" | "else") => ActionPickerEntry[];
  onOpenScript?: (scriptId: string, label?: string) => void;
};

const DRAG_THRESHOLD_PX = 6;
const EDGE_HYSTERESIS_PX = 6;
const FLIP_MS = 200;

type DropEdge = {
  index: number;
  edge: "before" | "after";
};

type DragSession = {
  from: number;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
};

type DragGhost = {
  title: string;
  indexLabel: string;
  tone: string;
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

function isBranchHead(row: FlatRow): boolean {
  return row.branchLabel != null && row.path[row.path.length - 1] === 0;
}

function padIndex(n: number): string {
  return String(n).padStart(2, "0");
}

function parentPath(path: ActionPath): ActionPath {
  return path.slice(0, -1);
}

function siblingList(actions: MacroAction[], path: ActionPath): MacroAction[] {
  if (path.length <= 1) return actions;
  const branchPrefix = path.slice(0, -1);
  const branch = branchPrefix[branchPrefix.length - 1];
  const ifPath = branchPrefix.slice(0, -1);
  const parent = getAtPath(actions, ifPath);
  if (parent?.type === "control.if" && (branch === 0 || branch === 1)) {
    return branch === 0 ? (parent.then ?? []) : (parent.else ?? []);
  }
  return actions;
}

function dropToReorderPaths(
  rows: FlatRow[],
  fromIndex: number,
  drop: DropEdge,
): { fromPath: ActionPath; toPath: ActionPath } | null {
  const fromPath = rows[fromIndex]?.path;
  const dropPath = rows[drop.index]?.path;
  if (!fromPath || !dropPath) return null;
  if (!pathsEqual(parentPath(fromPath), parentPath(dropPath))) return null;

  const fromIdx = fromPath[fromPath.length - 1]!;
  let insertIdx = dropPath[dropPath.length - 1]!;
  if (drop.edge === "after") insertIdx += 1;
  let toIdx = insertIdx;
  if (fromIdx < insertIdx) toIdx = insertIdx - 1;
  if (toIdx === fromIdx) return null;
  return { fromPath, toPath: [...parentPath(fromPath), toIdx] };
}

function hitTestListDrop(
  x: number,
  y: number,
  fromIndex: number,
  rows: FlatRow[],
  prev: DropEdge | null,
): DropEdge | null {
  const el = document.elementFromPoint(x, y);
  if (!el || !(el instanceof Element)) return null;
  const row = el.closest(".action-list-item[data-list-index]");
  if (!(row instanceof HTMLElement)) return null;
  const raw = row.getAttribute("data-list-index");
  if (raw == null) return null;
  const index = Number(raw);
  if (!Number.isFinite(index) || index < 0 || index >= rows.length) return null;
  if (index === fromIndex) return null;

  const fromPath = rows[fromIndex]?.path;
  const hitPath = rows[index]?.path;
  if (!fromPath || !hitPath) return null;
  if (!pathsEqual(parentPath(fromPath), parentPath(hitPath))) return null;

  const rect = row.getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  const prevEdge =
    prev?.index === index ? prev.edge : null;
  let edge: "before" | "after";
  if (prevEdge && Math.abs(y - mid) < EDGE_HYSTERESIS_PX) {
    edge = prevEdge;
  } else {
    edge = y < mid ? "before" : "after";
  }
  return { index, edge };
}

export function ActionList({
  actions,
  selectedPath,
  activePath,
  disabled,
  readOnly,
  onSelect,
  onReorder,
  onRemove,
  onDuplicate,
  onMove,
  onInsertAfter,
  onAddKind,
  onOpenAddMenu,
  onChangeAction,
  onEmptyAdd,
  onStartRecord,
  onApplyPreset,
  onClearSelection,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  branchAddMenuItems,
  onOpenScript,
}: Props) {
  const rows: FlatRow[] = flattenTree(actions);
  const locked = disabled || readOnly;
  const reducedMotion = usePrefersReducedMotion();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropEdge, setDropEdge] = useState<DropEdge | null>(null);
  const [ghost, setGhost] = useState<DragGhost | null>(null);
  const rowCtx = useContextMenuState();
  const emptyCtx = useContextMenuState();
  const [ctxPath, setCtxPath] = useState<ActionPath | null>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const dropEdgeRef = useRef<DropEdge | null>(null);
  const rowsRef = useRef(rows);
  const listRef = useRef<HTMLUListElement>(null);
  const suppressClickRef = useRef(false);
  const onReorderRef = useRef(onReorder);
  const onRemoveRef = useRef(onRemove);
  const pendingFlipRef = useRef<Map<string, DOMRect> | null>(null);
  rowsRef.current = rows;
  onReorderRef.current = onReorder;
  onRemoveRef.current = onRemove;

  const ctxRowItems: MenuItemDef[] = useMemo(() => {
    if (!ctxPath) return [];
    const siblings = siblingList(actions, ctxPath);
    const idx = ctxPath[ctxPath.length - 1] ?? 0;
    const canUp = idx > 0;
    const canDown = idx < siblings.length - 1;
    const addSub: MenuItemDef[] = [
      {
        id: "insert-click",
        label: "Clic",
        icon: <MousePointer2 size={14} />,
        disabled: !onInsertAfter,
        onSelect: () => onInsertAfter?.(ctxPath, "mouse.click"),
      },
      {
        id: "insert-delay",
        label: "Délai",
        icon: <Clock size={14} />,
        disabled: !onInsertAfter,
        onSelect: () => onInsertAfter?.(ctxPath, "delay"),
      },
      {
        id: "insert-if",
        label: "Condition",
        icon: <GitBranch size={14} />,
        disabled: !onInsertAfter,
        onSelect: () => onInsertAfter?.(ctxPath, "control.if"),
      },
    ];
    if (onOpenAddMenu) {
      addSub.push(
        { id: "sep-more", label: "", separator: true },
        {
          id: "add-picker",
          label: "Plus d’actions…",
          icon: <ListPlus size={14} />,
          onSelect: () => onOpenAddMenu(),
        },
      );
    }
    return [
      {
        id: "duplicate",
        label: "Dupliquer",
        icon: <Copy size={14} />,
        disabled: !onDuplicate,
        onSelect: () => onDuplicate?.(ctxPath),
      },
      {
        id: "move-up",
        label: "Monter",
        icon: <ArrowUp size={14} />,
        disabled: !onMove || !canUp,
        onSelect: () => onMove?.(ctxPath, -1),
      },
      {
        id: "move-down",
        label: "Descendre",
        icon: <ArrowDown size={14} />,
        disabled: !onMove || !canDown,
        onSelect: () => onMove?.(ctxPath, 1),
      },
      {
        id: "ajout",
        label: "Ajout",
        icon: <Plus size={14} />,
        submenu: addSub,
      },
      {
        id: "undo",
        label: "Retour en arrière",
        icon: <Undo2 size={14} />,
        disabled: !onUndo || !canUndo,
        onSelect: () => onUndo?.(),
      },
      {
        id: "redo",
        label: "Retour en avant",
        icon: <Redo2 size={14} />,
        disabled: !onRedo || !canRedo,
        onSelect: () => onRedo?.(),
      },
      { id: "sep-sel", label: "", separator: true },
      {
        id: "select",
        label: "Sélectionner",
        icon: <MousePointerClick size={14} />,
        onSelect: () => onSelect(ctxPath),
      },
      {
        id: "clear-selection",
        label: "Désélectionner",
        icon: <CircleDot size={14} />,
        disabled: !onClearSelection || !selectedPath,
        onSelect: () => onClearSelection?.(),
      },
      {
        id: "delete",
        label: "Supprimer",
        icon: <Trash2 size={14} />,
        danger: true,
        onSelect: () => onRemove(ctxPath),
      },
    ];
  }, [
    actions,
    canRedo,
    canUndo,
    ctxPath,
    onClearSelection,
    onDuplicate,
    onInsertAfter,
    onMove,
    onOpenAddMenu,
    onRedo,
    onRemove,
    onSelect,
    onUndo,
    selectedPath,
  ]);

  const emptyMenuItems: MenuItemDef[] = useMemo(() => {
    const addSub: MenuItemDef[] = [
      {
        id: "add-click",
        label: "Clic",
        icon: <MousePointer2 size={14} />,
        onSelect: () => onAddKind?.("mouse.click"),
      },
      {
        id: "add-delay",
        label: "Délai",
        icon: <Clock size={14} />,
        onSelect: () => onAddKind?.("delay"),
      },
      {
        id: "add-if",
        label: "Condition",
        icon: <GitBranch size={14} />,
        onSelect: () => onAddKind?.("control.if"),
      },
      { id: "sep-more", label: "", separator: true },
      {
        id: "add-picker",
        label: "Plus d’actions…",
        icon: <ListPlus size={14} />,
        onSelect: () => onOpenAddMenu?.(),
      },
    ];

    const items: MenuItemDef[] = [
      {
        id: "ajout",
        label: "Ajout",
        icon: <Plus size={14} />,
        submenu: addSub,
      },
    ];

    if (onStartRecord) {
      items.push({
        id: "record",
        label: "Enregistrer",
        icon: <CircleDot size={14} />,
        onSelect: () => onStartRecord(),
      });
    }

    if (onApplyPreset) {
      items.push({
        id: "presets",
        label: "Modèles",
        icon: <LayoutTemplate size={14} />,
        submenu: [
          {
            id: "preset-click-delay",
            label: "Click-delay",
            icon: <MousePointer2 size={14} />,
            onSelect: () => onApplyPreset("click-delay"),
          },
          {
            id: "preset-process-echo",
            label: "Process-echo",
            icon: <LayoutTemplate size={14} />,
            onSelect: () => onApplyPreset("process-echo"),
          },
        ],
      });
    }

    items.push(
      {
        id: "undo",
        label: "Retour en arrière",
        icon: <Undo2 size={14} />,
        disabled: !onUndo || !canUndo,
        onSelect: () => onUndo?.(),
      },
      {
        id: "redo",
        label: "Retour en avant",
        icon: <Redo2 size={14} />,
        disabled: !onRedo || !canRedo,
        onSelect: () => onRedo?.(),
      },
      { id: "sep-clear", label: "", separator: true },
      {
        id: "clear-selection",
        label: "Désélectionner",
        icon: <CircleDot size={14} />,
        disabled: !onClearSelection || !selectedPath,
        onSelect: () => onClearSelection?.(),
      },
    );

    return items;
  }, [
    canRedo,
    canUndo,
    onAddKind,
    onApplyPreset,
    onClearSelection,
    onOpenAddMenu,
    onRedo,
    onStartRecord,
    onUndo,
    selectedPath,
  ]);

  useEffect(() => {
    if (locked || !selectedPath || selectedPath.length < 1) return;
    const path = selectedPath;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      void (async () => {
        const ok = await confirmAction({
          title: "Supprimer l’action",
          message: "Retirer cette action de la séquence ?",
          confirmLabel: "Supprimer",
          danger: true,
        });
        if (ok) onRemoveRef.current(path);
      })();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, selectedPath]);

  let prevAbs = 0;

  function clearDrag() {
    sessionRef.current = null;
    dropEdgeRef.current = null;
    setDragFrom(null);
    setDropEdge(null);
    setGhost(null);
    document.body.classList.remove("action-list-is-dragging");
  }

  function captureRowRects(): Map<string, DOMRect> {
    const map = new Map<string, DOMRect>();
    const list = listRef.current;
    if (!list) return map;
    for (const el of list.querySelectorAll<HTMLElement>(
      ".action-list-item[data-list-path]",
    )) {
      const key = el.getAttribute("data-list-path");
      if (key) map.set(key, el.getBoundingClientRect());
    }
    return map;
  }

  useLayoutEffect(() => {
    const before = pendingFlipRef.current;
    if (!before || reducedMotion) {
      pendingFlipRef.current = null;
      return;
    }
    pendingFlipRef.current = null;
    const list = listRef.current;
    if (!list) return;
    for (const el of list.querySelectorAll<HTMLElement>(
      ".action-list-item[data-list-path]",
    )) {
      const key = el.getAttribute("data-list-path");
      if (!key) continue;
      const prev = before.get(key);
      if (!prev) continue;
      const next = el.getBoundingClientRect();
      const dy = prev.top - next.top;
      if (Math.abs(dy) < 0.5) continue;
      el.animate(
        [
          { transform: `translateY(${dy}px)` },
          { transform: "translateY(0)" },
        ],
        {
          duration: FLIP_MS,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
    }
  }, [actions, reducedMotion]);

  function onRowPointerDown(flatIndex: number, e: ReactPointerEvent) {
    if (locked || e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest(".row-ops")) return;
    if (
      t.closest(
        "input, select, textarea, button, label.action-cell-mod, .action-cell-btn",
      )
    ) {
      return;
    }

    sessionRef.current = {
      from: flatIndex,
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
        setDragFrom(session.from);
        document.body.classList.add("action-list-is-dragging");
        const rowEl = listRef.current?.querySelector(
          `.action-list-item[data-list-index="${session.from}"]`,
        ) as HTMLElement | null;
        const row = rowsRef.current[session.from];
        if (rowEl && row) {
          const rect = rowEl.getBoundingClientRect();
          const siblings = siblingList(actions, row.path);
          const siblingIdx = row.path[row.path.length - 1]!;
          setGhost({
            title: actionTitleInList(siblings, siblingIdx),
            indexLabel: padIndex(siblingIdx + 1),
            tone: actionTone(row.action.type),
            x: ev.clientX,
            y: ev.clientY,
            width: rect.width,
            height: Math.min(rect.height, 44),
            offsetX: ev.clientX - rect.left,
            offsetY: ev.clientY - rect.top,
          });
        }
      } else {
        setGhost((g) => (g ? { ...g, x: ev.clientX, y: ev.clientY } : g));
      }
      const hit = hitTestListDrop(
        ev.clientX,
        ev.clientY,
        session.from,
        rowsRef.current,
        dropEdgeRef.current,
      );
      dropEdgeRef.current = hit;
      setDropEdge(hit);
    };

    const onUp = (ev: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || ev.pointerId !== session.pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      const wasActive = session.active;
      const from = session.from;
      const currentRows = rowsRef.current;
      const hit = wasActive
        ? hitTestListDrop(
            ev.clientX,
            ev.clientY,
            from,
            currentRows,
            dropEdgeRef.current,
          )
        : null;

      if (!wasActive || !hit) {
        clearDrag();
        return;
      }
      const paths = dropToReorderPaths(currentRows, from, hit);
      if (!paths) {
        clearDrag();
        return;
      }
      if (!reducedMotion) pendingFlipRef.current = captureRowRects();
      clearDrag();
      onReorderRef.current(paths.fromPath, paths.toPath);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function selectRow(path: ActionPath) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSelect(path);
  }

  const dragParent =
    dragFrom != null ? parentPath(rows[dragFrom]?.path ?? []) : null;

  return (
    <div
      className="action-list-shell"
      onContextMenu={
        !readOnly && !locked
          ? (e) => {
              const t = e.target as HTMLElement;
              if (t.closest(".action-list-item")) return;
              e.preventDefault();
              emptyCtx.openFromEvent(e);
            }
          : undefined
      }
    >
      <ul
        ref={listRef}
        className={[
          "action-list",
          "action-list-dense",
          dragFrom != null ? "is-dragging" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onContextMenu={
          !readOnly && !locked
            ? (e) => {
                const t = e.target as HTMLElement;
                if (t.closest(".action-list-item")) return;
                e.preventDefault();
                emptyCtx.openFromEvent(e);
              }
            : undefined
        }
      >
        {rows.length > 0 ? (
          <li className="action-list-head" aria-hidden>
            <span />
            <span>#</span>
            <span>Action</span>
            <span>Paramètres</span>
            <span>Offset</span>
            <span />
          </li>
        ) : null}
        {rows.map((row, flatIndex) => {
          const abs = actionOffsetMs(actions, row.path);
          const displayOffset = formatActionOffset(actions, row.path, prevAbs);
          prevAbs = abs;
          const sameParent =
            dragParent != null &&
            pathsEqual(dragParent, parentPath(row.path));
          const dropBefore =
            sameParent &&
            dropEdge &&
            dropEdge.index === flatIndex &&
            dropEdge.edge === "before";
          const dropAfter =
            sameParent &&
            dropEdge &&
            dropEdge.index === flatIndex &&
            dropEdge.edge === "after";

          const siblings = siblingList(actions, row.path);
          const siblingIdx = row.path[row.path.length - 1]!;
          const dragEnd = dragGestureEndIndex(siblings, siblingIdx);
          const inDragPath = (() => {
            for (let s = 0; s < siblingIdx; s++) {
              const end = dragGestureEndIndex(siblings, s);
              if (end != null && siblingIdx <= end) return true;
            }
            return dragEnd != null;
          })();

          return (
            <li
              key={pathKey(row.path)}
              className={[
                "action-list-item",
                "has-hover-reveal",
                pathsEqual(selectedPath, row.path) ? "selected" : "",
                pathsEqual(activePath, row.path) ? "active" : "",
                row.depth > 0 ? "nested" : "",
                row.branchLabel === "then" ? "branch-then" : "",
                row.branchLabel === "else" ? "branch-else" : "",
                dragFrom === flatIndex ? "is-drag-source" : "",
                dropBefore ? "drop-before" : "",
                dropAfter ? "drop-after" : "",
                inDragPath ? "is-drag-gesture" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ ["--nest-depth" as string]: row.depth }}
              data-list-index={flatIndex}
              data-list-path={pathKey(row.path)}
              onPointerDown={
                !locked ? (ev) => onRowPointerDown(flatIndex, ev) : undefined
              }
              onClick={(e) => {
                const t = e.target as HTMLElement;
                if (t.closest(".row-ops")) return;
                if (
                  t.closest(
                    "input, select, textarea, button, label.action-cell-mod, .action-cell-btn",
                  )
                ) {
                  return;
                }
                selectRow(row.path);
              }}
              onContextMenu={
                !readOnly && !locked
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCtxPath(row.path);
                      rowCtx.openFromEvent(e);
                    }
                  : undefined
              }
            >
              <span
                className={`action-dot ${actionTone(row.action.type)}`}
                aria-hidden
              />
              <span className="idx">
                {isBranchHead(row) && row.branchLabel ? (
                  <em className="branch-tag">
                    {branchLabelFr(row.branchLabel)}
                  </em>
                ) : (
                  padIndex(row.path[row.path.length - 1]! + 1)
                )}
              </span>
              <span className="lbl">
                <strong className="act-type">
                  {actionTitleInList(siblings, siblingIdx)}
                </strong>
              </span>
              <div className="act-params">
                {onChangeAction && !readOnly ? (
                  <ActionParamCells
                    action={row.action}
                    disabled={locked}
                    onChange={(a) => {
                      onSelect(row.path);
                      onChangeAction(row.path, a);
                    }}
                    branchAddMenuItems={branchAddMenuItems}
                    onOpenScript={onOpenScript}
                  />
                ) : (
                  <span className="action-cell-summary">
                    {actionDetailFr(row.action)}
                  </span>
                )}
              </div>
              <span className="act-offset">{displayOffset}</span>
              {!readOnly ? (
                <div className="row-ops hover-reveal">
                  <button
                    type="button"
                    className="icon-ghost danger-text"
                    disabled={locked}
                    title="Supprimer"
                    aria-label="Supprimer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(row.path);
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <span />
              )}
            </li>
          );
        })}
        {rows.length === 0 ? (
          <li className="action-list-empty">
            <div className="v2-empty-state">
              <strong>Aucune étape</strong>
              <p>
                Ajoute un clic, un délai ou une condition pour démarrer la
                macro.
              </p>
              {onEmptyAdd && !readOnly ? (
                <button
                  type="button"
                  className="v2-btn v2-btn-primary"
                  disabled={locked}
                  onClick={onEmptyAdd}
                >
                  <Plus size={14} aria-hidden />
                  Ajouter une étape
                </button>
              ) : null}
            </div>
          </li>
        ) : null}
      </ul>

      <ContextMenu
        open={rowCtx.open}
        x={rowCtx.x}
        y={rowCtx.y}
        items={ctxRowItems}
        onClose={rowCtx.close}
        onSelect={(id) => {
          findMenuItem(ctxRowItems, id)?.onSelect?.();
        }}
        ariaLabel="Actions sur l’étape"
      />

      <ContextMenu
        open={emptyCtx.open}
        x={emptyCtx.x}
        y={emptyCtx.y}
        items={emptyMenuItems}
        onClose={emptyCtx.close}
        onSelect={(id) => {
          findMenuItem(emptyMenuItems, id)?.onSelect?.();
        }}
        ariaLabel="Ajouter une étape"
      />

      {ghost && typeof document !== "undefined"
        ? createPortal(
            <div
              className="action-list-drag-ghost"
              style={{
                width: ghost.width,
                height: ghost.height,
                transform: `translate(${ghost.x - ghost.offsetX}px, ${ghost.y - ghost.offsetY}px)`,
              }}
              aria-hidden
            >
              <span className={`action-dot ${ghost.tone}`} />
              <span className="idx">{ghost.indexLabel}</span>
              <strong className="act-type">{ghost.title}</strong>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
