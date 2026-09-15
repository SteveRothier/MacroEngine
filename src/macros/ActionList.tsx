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
  ClipboardPaste,
  Clock,
  Copy,
  GitBranch,
  LayoutTemplate,
  ListPlus,
  MousePointer2,
  MousePointerClick,
  Play,
  Plus,
  Redo2,
  Scissors,
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
} from "../ui/shell";
import { useT, type TFunction } from "../i18n";
import { ActionParamCells } from "./ActionParamCells";
import {
  flattenTree,
  getAtPath,
  isAncestorPath,
  pathKey,
  pathsEqual,
  type ActionPath,
  type FlatRow,
  type MacroAction,
} from "./types";
import {
  actionDetail,
  actionTitleInList,
  actionTone,
  branchLabel,
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
  onRunFrom?: (path: ActionPath) => void;
  onInsertBefore?: (path: ActionPath, kind: MacroAction["type"]) => void;
  onInsertAfter?: (path: ActionPath, kind: MacroAction["type"]) => void;
  onPasteAfter?: (path: ActionPath, action: MacroAction) => void;
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
const AUTO_SCROLL_EDGE_PX = 48;
const AUTO_SCROLL_MAX_PX = 18;

/** In-memory step clipboard (not OS clipboard). */
let actionClipboard: MacroAction | null = null;

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return (
    t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT" ||
    t.isContentEditable
  );
}

function kindInsertItems(
  prefix: string,
  disabled: boolean,
  onPick: (kind: MacroAction["type"]) => void,
  t: TFunction,
): MenuItemDef[] {
  return [
    {
      id: `${prefix}-click`,
      label: t("macros.menu.add.click"),
      icon: <MousePointer2 size={14} />,
      disabled,
      onSelect: () => onPick("mouse.click"),
    },
    {
      id: `${prefix}-delay`,
      label: t("macros.menu.add.delay"),
      icon: <Clock size={14} />,
      disabled,
      onSelect: () => onPick("delay"),
    },
    {
      id: `${prefix}-if`,
      label: t("macros.menu.add.condition"),
      icon: <GitBranch size={14} />,
      disabled,
      onSelect: () => onPick("control.if"),
    },
  ];
}

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
  const dropRow = rows[drop.index];
  const dropPath = dropRow?.path;
  if (!fromPath || !dropPath) return null;
  if (isAncestorPath(fromPath, dropPath)) return null;

  // Nest into then when dropping after an if from another list (not sibling reorder).
  if (
    dropRow.action.type === "control.if" &&
    drop.edge === "after" &&
    !pathsEqual(fromPath, dropPath) &&
    !pathsEqual(parentPath(fromPath), parentPath(dropPath))
  ) {
    const intoThen: ActionPath = [...dropPath, 0, 0];
    if (isAncestorPath(fromPath, intoThen)) return null;
    return { fromPath, toPath: intoThen };
  }

  const fromParent = parentPath(fromPath);
  const dropParent = parentPath(dropPath);

  if (pathsEqual(fromParent, dropParent)) {
    const fromIdx = fromPath[fromPath.length - 1]!;
    let insertIdx = dropPath[dropPath.length - 1]!;
    if (drop.edge === "after") insertIdx += 1;
    let toIdx = insertIdx;
    if (fromIdx < insertIdx) toIdx = insertIdx - 1;
    if (toIdx === fromIdx) return null;
    return { fromPath, toPath: [...fromParent, toIdx] };
  }

  // Cross-parent: insert before/after the hit row in its sibling list.
  let insertIdx = dropPath[dropPath.length - 1]!;
  if (drop.edge === "after") insertIdx += 1;
  return { fromPath, toPath: [...dropParent, insertIdx] };
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
  if (isAncestorPath(fromPath, hitPath)) return null;

  const rect = row.getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  const prevEdge = prev?.index === index ? prev.edge : null;
  let edge: "before" | "after";
  if (prevEdge && Math.abs(y - mid) < EDGE_HYSTERESIS_PX) {
    edge = prevEdge;
  } else {
    edge = y < mid ? "before" : "after";
  }
  return { index, edge };
}

function autoScrollNearEdges(list: HTMLElement | null, clientY: number) {
  if (!list) return;
  const rect = list.getBoundingClientRect();
  if (clientY < rect.top + AUTO_SCROLL_EDGE_PX) {
    const t = 1 - (clientY - rect.top) / AUTO_SCROLL_EDGE_PX;
    list.scrollTop -= Math.ceil(AUTO_SCROLL_MAX_PX * Math.min(1, Math.max(0, t)));
  } else if (clientY > rect.bottom - AUTO_SCROLL_EDGE_PX) {
    const t = 1 - (rect.bottom - clientY) / AUTO_SCROLL_EDGE_PX;
    list.scrollTop += Math.ceil(AUTO_SCROLL_MAX_PX * Math.min(1, Math.max(0, t)));
  }
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
  onRunFrom,
  onInsertBefore,
  onInsertAfter,
  onPasteAfter,
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
  const t = useT();
  const rows: FlatRow[] = flattenTree(actions);
  const locked = disabled || readOnly;
  const reducedMotion = usePrefersReducedMotion();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropEdge, setDropEdge] = useState<DropEdge | null>(null);
  const [ghost, setGhost] = useState<DragGhost | null>(null);
  const [clipboardTick, setClipboardTick] = useState(0);
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
  const onPasteAfterRef = useRef(onPasteAfter);
  const pendingFlipRef = useRef<Map<string, DOMRect> | null>(null);
  rowsRef.current = rows;
  onReorderRef.current = onReorder;
  onRemoveRef.current = onRemove;
  onPasteAfterRef.current = onPasteAfter;

  const copyPath = (path: ActionPath) => {
    const src = getAtPath(actions, path);
    if (!src) return;
    actionClipboard = structuredClone(src);
    setClipboardTick((n) => n + 1);
  };

  const cutPath = (path: ActionPath) => {
    const src = getAtPath(actions, path);
    if (!src) return;
    actionClipboard = structuredClone(src);
    setClipboardTick((n) => n + 1);
    onRemove(path);
  };

  const pasteAfterPath = (path: ActionPath) => {
    if (!actionClipboard || !onPasteAfter) return;
    onPasteAfter(path, structuredClone(actionClipboard));
  };

  const ctxRowItems: MenuItemDef[] = useMemo(() => {
    if (!ctxPath) return [];
    const siblings = siblingList(actions, ctxPath);
    const idx = ctxPath[ctxPath.length - 1] ?? 0;
    const canUp = idx > 0;
    const canDown = idx < siblings.length - 1;
    const canInsert = !!(onInsertBefore || onInsertAfter);
    const addSub: MenuItemDef[] = [
      {
        id: "insert-before",
        label: t("macros.menu.ctx.insertBefore"),
        icon: <Plus size={14} />,
        disabled: !onInsertBefore,
        submenu: kindInsertItems(
          "before",
          !onInsertBefore,
          (kind) => onInsertBefore?.(ctxPath, kind),
          t,
        ),
      },
      {
        id: "insert-after",
        label: t("macros.menu.ctx.insertAfter"),
        icon: <Plus size={14} />,
        disabled: !onInsertAfter,
        submenu: kindInsertItems(
          "after",
          !onInsertAfter,
          (kind) => onInsertAfter?.(ctxPath, kind),
          t,
        ),
      },
    ];
    if (onOpenAddMenu) {
      addSub.push(
        { id: "sep-more", label: "", separator: true },
        {
          id: "add-picker",
          label: t("macros.menu.ctx.moreActions"),
          icon: <ListPlus size={14} />,
          onSelect: () => onOpenAddMenu(),
        },
      );
    }
    return [
      {
        id: "run-from",
        label: t("macros.menu.ctx.runFrom"),
        shortcut: t("macros.toolbar.playFromShortcut"),
        icon: <Play size={14} />,
        disabled: !onRunFrom,
        onSelect: () => onRunFrom?.(ctxPath),
      },
      {
        id: "copy",
        label: t("macros.menu.ctx.copy"),
        icon: <Copy size={14} />,
        onSelect: () => copyPath(ctxPath),
      },
      {
        id: "cut",
        label: t("macros.menu.ctx.cut"),
        icon: <Scissors size={14} />,
        onSelect: () => cutPath(ctxPath),
      },
      {
        id: "paste",
        label: t("macros.menu.ctx.pasteAfter"),
        icon: <ClipboardPaste size={14} />,
        disabled: !onPasteAfter || !actionClipboard,
        onSelect: () => pasteAfterPath(ctxPath),
      },
      {
        id: "duplicate",
        label: t("macros.menu.ctx.duplicate"),
        icon: <Copy size={14} />,
        disabled: !onDuplicate,
        onSelect: () => onDuplicate?.(ctxPath),
      },
      {
        id: "move-up",
        label: t("macros.menu.ctx.moveUp"),
        icon: <ArrowUp size={14} />,
        disabled: !onMove || !canUp,
        onSelect: () => onMove?.(ctxPath, -1),
      },
      {
        id: "move-down",
        label: t("macros.menu.ctx.moveDown"),
        icon: <ArrowDown size={14} />,
        disabled: !onMove || !canDown,
        onSelect: () => onMove?.(ctxPath, 1),
      },
      {
        id: "ajout",
        label: t("macros.menu.ctx.addGroup"),
        icon: <Plus size={14} />,
        disabled: !canInsert && !onOpenAddMenu,
        submenu: addSub,
      },
      {
        id: "undo",
        label: t("macros.toolbar.undo"),
        icon: <Undo2 size={14} />,
        disabled: !onUndo || !canUndo,
        onSelect: () => onUndo?.(),
      },
      {
        id: "redo",
        label: t("macros.toolbar.redo"),
        icon: <Redo2 size={14} />,
        disabled: !onRedo || !canRedo,
        onSelect: () => onRedo?.(),
      },
      { id: "sep-sel", label: "", separator: true },
      {
        id: "select",
        label: t("macros.menu.ctx.select"),
        icon: <MousePointerClick size={14} />,
        onSelect: () => onSelect(ctxPath),
      },
      {
        id: "clear-selection",
        label: t("macros.menu.ctx.deselect"),
        icon: <CircleDot size={14} />,
        disabled: !onClearSelection || !selectedPath,
        onSelect: () => onClearSelection?.(),
      },
      {
        id: "delete",
        label: t("macros.menu.ctx.delete"),
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
    onInsertBefore,
    onMove,
    onOpenAddMenu,
    onPasteAfter,
    onRedo,
    onRemove,
    onRunFrom,
    onSelect,
    onUndo,
    selectedPath,
    clipboardTick,
    t,
  ]);

  const emptyMenuItems: MenuItemDef[] = useMemo(() => {
    const addSub: MenuItemDef[] = [
      {
        id: "add-click",
        label: t("macros.menu.add.click"),
        icon: <MousePointer2 size={14} />,
        onSelect: () => onAddKind?.("mouse.click"),
      },
      {
        id: "add-delay",
        label: t("macros.menu.add.delay"),
        icon: <Clock size={14} />,
        onSelect: () => onAddKind?.("delay"),
      },
      {
        id: "add-if",
        label: t("macros.menu.add.condition"),
        icon: <GitBranch size={14} />,
        onSelect: () => onAddKind?.("control.if"),
      },
      { id: "sep-more", label: "", separator: true },
      {
        id: "add-picker",
        label: t("macros.menu.ctx.moreActions"),
        icon: <ListPlus size={14} />,
        onSelect: () => onOpenAddMenu?.(),
      },
    ];

    const items: MenuItemDef[] = [
      {
        id: "ajout",
        label: t("macros.menu.ctx.addGroup"),
        icon: <Plus size={14} />,
        submenu: addSub,
      },
    ];

    if (onStartRecord) {
      items.push({
        id: "record",
        label: t("macros.menu.empty.record"),
        icon: <CircleDot size={14} />,
        onSelect: () => onStartRecord(),
      });
    }

    if (onApplyPreset) {
      items.push({
        id: "presets",
        label: t("macros.menu.empty.presets"),
        icon: <LayoutTemplate size={14} />,
        submenu: [
          {
            id: "preset-click-delay",
            label: t("macros.menu.empty.presetClickDelay"),
            icon: <MousePointer2 size={14} />,
            onSelect: () => onApplyPreset("click-delay"),
          },
          {
            id: "preset-process-echo",
            label: t("macros.menu.empty.presetProcessEcho"),
            icon: <LayoutTemplate size={14} />,
            onSelect: () => onApplyPreset("process-echo"),
          },
        ],
      });
    }

    items.push(
      {
        id: "undo",
        label: t("macros.toolbar.undo"),
        icon: <Undo2 size={14} />,
        disabled: !onUndo || !canUndo,
        onSelect: () => onUndo?.(),
      },
      {
        id: "redo",
        label: t("macros.toolbar.redo"),
        icon: <Redo2 size={14} />,
        disabled: !onRedo || !canRedo,
        onSelect: () => onRedo?.(),
      },
      { id: "sep-clear", label: "", separator: true },
      {
        id: "clear-selection",
        label: t("macros.menu.ctx.deselect"),
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
    t,
  ]);

  useEffect(() => {
    if (locked || !selectedPath || selectedPath.length < 1) return;
    const path = selectedPath;
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        const src = getAtPath(actions, path);
        if (!src) return;
        actionClipboard = structuredClone(src);
        setClipboardTick((n) => n + 1);
        return;
      }
      if (mod && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        const src = getAtPath(actions, path);
        if (!src) return;
        actionClipboard = structuredClone(src);
        setClipboardTick((n) => n + 1);
        onRemoveRef.current(path);
        return;
      }
      if (mod && (e.key === "v" || e.key === "V")) {
        if (!actionClipboard || !onPasteAfterRef.current) return;
        e.preventDefault();
        onPasteAfterRef.current(path, structuredClone(actionClipboard));
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      e.preventDefault();
      void (async () => {
        const ok = await confirmAction({
          title: t("macros.confirm.deleteActionTitle"),
          message: t("macros.confirm.deleteActionMessage"),
          confirmLabel: t("automations.confirm.deleteConfirm"),
          danger: true,
        });
        if (ok) onRemoveRef.current(path);
      })();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, locked, selectedPath, t]);

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
    const target = e.target as HTMLElement;
    if (target.closest(".row-ops")) return;
    if (
      target.closest(
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
            title: actionTitleInList(siblings, siblingIdx, t),
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
      autoScrollNearEdges(listRef.current, ev.clientY);
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

  const dragFromPath =
    dragFrom != null ? (rows[dragFrom]?.path ?? null) : null;

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
            <span>{t("macros.menu.list.headAction")}</span>
            <span>{t("macros.menu.list.headParams")}</span>
            <span>{t("macros.menu.list.headOffset")}</span>
            <span />
          </li>
        ) : null}
        {rows.map((row, flatIndex) => {
          const abs = actionOffsetMs(actions, row.path);
          const displayOffset = formatActionOffset(actions, row.path, prevAbs);
          prevAbs = abs;
          const canDropHere =
            dragFromPath != null &&
            !pathsEqual(dragFromPath, row.path) &&
            !isAncestorPath(dragFromPath, row.path);
          const dropBefore =
            canDropHere &&
            dropEdge &&
            dropEdge.index === flatIndex &&
            dropEdge.edge === "before";
          const dropAfter =
            canDropHere &&
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
                    {branchLabel(row.branchLabel, t)}
                  </em>
                ) : (
                  padIndex(row.path[row.path.length - 1]! + 1)
                )}
              </span>
              <span className="lbl">
                <strong className="act-type">
                  {actionTitleInList(siblings, siblingIdx, t)}
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
                    {actionDetail(row.action, t)}
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
                    title={t("macros.menu.list.deleteTitle")}
                    aria-label={t("macros.menu.list.deleteTitle")}
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
            <div className="caster-empty-state">
              <strong>{t("macros.empty.noStepsTitle")}</strong>
              <p>{t("macros.empty.noStepsLead")}</p>
              {onEmptyAdd && !readOnly ? (
                <button
                  type="button"
                  className="caster-btn caster-btn-primary"
                  disabled={locked}
                  onClick={onEmptyAdd}
                >
                  <Plus size={14} aria-hidden />
                  {t("macros.empty.noStepsCta")}
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
        ariaLabel={t("macros.menu.list.ctxAria")}
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
        ariaLabel={t("macros.menu.list.emptyCtxAria")}
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
