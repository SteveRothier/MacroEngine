import {
  Fragment,
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
  ChevronDown,
  Play,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
} from "lucide-react";
import { confirmAction } from "../ui";
import {
  ActionPickerMenu,
  ContextMenu,
  findMenuItem,
  useContextMenuState,
  usePrefersReducedMotion,
  type ActionPickerEntry,
  type MenuItemDef,
} from "../ui/shell";
import { useT, type TFunction } from "../i18n";
import { buildActionAddMenu } from "./actionFactory";
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
import {
  pathHasPrefix,
  parsePathKey,
  remapCollapsedAfterReorder,
} from "./collapseRemap";
import { actionOffsetMs, formatActionOffset } from "./sequenceUtils";

type Props = {
  actions: MacroAction[];
  selectedPath: ActionPath | null;
  activePath: ActionPath | null;
  disabled?: boolean;
  readOnly?: boolean;
  /** When false, Delete/Backspace removes without confirm dialog. */
  confirmDeleteAction?: boolean;
  onSelect: (path: ActionPath) => void;
  onReorder: (fromPath: ActionPath, toPath: ActionPath) => void;
  onRemove: (path: ActionPath) => void;
  /** Batch delete — single undo entry when provided. */
  onRemoveMany?: (paths: ActionPath[]) => void;
  onDuplicate?: (path: ActionPath) => void;
  onDuplicateMany?: (paths: ActionPath[]) => void;
  onMove?: (path: ActionPath, dir: -1 | 1) => void;
  onMoveMany?: (paths: ActionPath[], dir: -1 | 1) => void;
  onRunFrom?: (path: ActionPath) => void;
  onInsertBefore?: (path: ActionPath, kind: MacroAction["type"]) => void;
  onInsertAfter?: (path: ActionPath, kind: MacroAction["type"]) => void;
  onPasteAfter?: (path: ActionPath, action: MacroAction | MacroAction[]) => void;
  onAddKind?: (kind: MacroAction["type"]) => void;
  onOpenAddMenu?: () => void;
  onChangeAction?: (path: ActionPath, action: MacroAction) => void;
  onAddToBranch?: (
    path: ActionPath,
    branch: "then" | "else" | "body",
    kind: MacroAction["type"],
  ) => void;
  onEmptyAdd?: () => void;
  onStartRecord?: () => void;
  onApplyPreset?: (name: string) => void;
  onClearSelection?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  addMenuItems?: ActionPickerEntry[];
  addMenuOpen?: boolean;
  onAddMenuOpenChange?: (open: boolean) => void;
  onOpenScript?: (scriptId: string, label?: string) => void;
};

const DRAG_THRESHOLD_PX = 6;
const EDGE_HYSTERESIS_PX = 6;
const FLIP_MS = 200;
/** Extra hit area past the last row so dropping at end is easy. */
const LIST_END_SLACK_PX = 64;
/** On the last row, "after" starts earlier (top 28% = before, rest = after). */
const LAST_ROW_AFTER_RATIO = 0.28;
const AUTO_SCROLL_EDGE_PX = 48;
const AUTO_SCROLL_MAX_PX = 18;

/** In-memory step clipboard (not OS clipboard). Multi when copying a selection. */
let actionClipboard: MacroAction[] | null = null;

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

type BranchKey = "then" | "else" | "body";

type DropEdge = {
  index: number;
  edge: "before" | "after";
  /** Nest into this branch of rows[index] (control.if / while). */
  intoBranch?: BranchKey;
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
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

function padIndex(n: number): string {
  return String(n).padStart(2, "0");
}

type BranchSlotItem = {
  kind: "branch-slot";
  key: string;
  parentPath: ActionPath;
  branch: BranchKey;
  depth: number;
  count: number;
};

type ActionDisplayItem = {
  kind: "action";
  row: FlatRow;
  flatIndex: number;
};

type DisplayItem = ActionDisplayItem | BranchSlotItem;

/** True if `path` is strictly under a collapsed control.if / while. */
function isDescendantOfCollapsed(
  path: ActionPath,
  collapsed: Set<string>,
): boolean {
  if (collapsed.size === 0) return false;
  for (const key of collapsed) {
    const prefix = parsePathKey(key);
    if (!prefix) continue;
    if (path.length > prefix.length && pathHasPrefix(path, prefix)) {
      return true;
    }
  }
  return false;
}

function findLastUnderPrefix(rows: FlatRow[], prefix: ActionPath): number {
  let last = -1;
  for (let i = 0; i < rows.length; i++) {
    if (pathHasPrefix(rows[i]!.path, prefix)) last = i;
  }
  return last;
}

function makeSlot(
  parentPath: ActionPath,
  branch: BranchKey,
  depth: number,
  count: number,
): BranchSlotItem {
  return {
    kind: "branch-slot",
    key: `${pathKey(parentPath)}:${branch}`,
    parentPath,
    branch,
    depth,
    count,
  };
}

/**
 * Always show Boucle / Alors / Sinon + at the bottom of each branch.
 * Drag indices stay on FlatRow only — slots are display-only (but droppable).
 */
function buildDisplayItems(
  _actions: MacroAction[],
  rows: FlatRow[],
): DisplayItem[] {
  const after = new Map<number, BranchSlotItem[]>();

  const pushAfter = (flatIndex: number, slot: BranchSlotItem) => {
    const list = after.get(flatIndex) ?? [];
    list.push(slot);
    after.set(flatIndex, list);
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const depth = row.depth + 1;

    if (row.action.type === "control.if") {
      const thenLen = row.action.then?.length ?? 0;
      const elseLen = row.action.else?.length ?? 0;
      const lastThen =
        thenLen > 0 ? findLastUnderPrefix(rows, [...row.path, 0]) : -1;
      const lastElse =
        elseLen > 0 ? findLastUnderPrefix(rows, [...row.path, 1]) : -1;

      // Then footer: after last then action, or right after Si if empty.
      pushAfter(
        lastThen >= 0 ? lastThen : i,
        makeSlot(row.path, "then", depth, thenLen),
      );

      // Else footer: after last else action; if empty, after then footer anchor.
      if (lastElse >= 0) {
        pushAfter(lastElse, makeSlot(row.path, "else", depth, elseLen));
      } else {
        pushAfter(
          lastThen >= 0 ? lastThen : i,
          makeSlot(row.path, "else", depth, 0),
        );
      }
    } else if (row.action.type === "control.while") {
      const bodyLen = row.action.body?.length ?? 0;
      const lastBody =
        bodyLen > 0 ? findLastUnderPrefix(rows, [...row.path, 0]) : -1;
      pushAfter(
        lastBody >= 0 ? lastBody : i,
        makeSlot(row.path, "body", depth, bodyLen),
      );
    }
  }

  const items: DisplayItem[] = [];
  for (let i = 0; i < rows.length; i++) {
    items.push({ kind: "action", row: rows[i]!, flatIndex: i });
    for (const slot of after.get(i) ?? []) {
      items.push(slot);
    }
  }
  return items;
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
  if (parent?.type === "control.while" && branch === 0) {
    return parent.body ?? [];
  }
  return actions;
}

function branchKeyToIndex(branch: BranchKey): 0 | 1 {
  return branch === "else" ? 1 : 0;
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
  if (pathsEqual(fromPath, dropPath)) return null;
  if (isAncestorPath(fromPath, dropPath)) return null;

  const isControl =
    dropRow.action.type === "control.if" ||
    dropRow.action.type === "control.while";

  // Explicit branch target (empty slot) or drop-after on if/while → nest.
  if (isControl && (drop.intoBranch != null || drop.edge === "after")) {
    const branch: BranchKey =
      drop.intoBranch ??
      (dropRow.action.type === "control.while" ? "body" : "then");
    if (dropRow.action.type === "control.while" && branch === "else") {
      return null;
    }
    if (dropRow.action.type === "control.if" && branch === "body") {
      return null;
    }
    const intoBranch: ActionPath = [
      ...dropPath,
      branchKeyToIndex(branch),
      0,
    ];
    if (isAncestorPath(fromPath, intoBranch)) return null;
    return { fromPath, toPath: intoBranch };
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
  listEl: HTMLElement | null,
): DropEdge | null {
  if (rows.length === 0) return null;
  const lastIndex = rows.length - 1;
  const fromPath = rows[fromIndex]?.path;
  if (!fromPath) return null;

  const el = document.elementFromPoint(x, y);

  // Empty branch slot (+ then/else/body) → nest into that branch.
  if (el instanceof Element) {
    const slot = el.closest(
      ".action-list-branch-slot[data-branch-parent][data-branch-key]",
    ) as HTMLElement | null;
    if (slot) {
      const parentKey = slot.getAttribute("data-branch-parent");
      const branchRaw = slot.getAttribute("data-branch-key");
      const branch: BranchKey | null =
        branchRaw === "then" || branchRaw === "else" || branchRaw === "body"
          ? branchRaw
          : null;
      if (parentKey != null && branch) {
        const parentFlat = rows.findIndex((r) => pathKey(r.path) === parentKey);
        if (parentFlat >= 0 && parentFlat !== fromIndex) {
          const hitPath = rows[parentFlat]?.path;
          if (hitPath && !isAncestorPath(fromPath, hitPath)) {
            return {
              index: parentFlat,
              edge: "after",
              intoBranch: branch,
            };
          }
        }
      }
    }
  }

  let row =
    el instanceof Element
      ? (el.closest(".action-list-item[data-list-index]") as HTMLElement | null)
      : null;

  // Empty padding / below last row → drop after last (macros + long lists).
  if (!row && listEl) {
    const lastRow = listEl.querySelector(
      `.action-list-item[data-list-index="${lastIndex}"]`,
    ) as HTMLElement | null;
    if (lastRow) {
      const listRect = listEl.getBoundingClientRect();
      const lastRect = lastRow.getBoundingClientRect();
      const afterLine = lastRect.top + lastRect.height * LAST_ROW_AFTER_RATIO;
      const bottomLimit =
        Math.max(listRect.bottom, lastRect.bottom) + LIST_END_SLACK_PX;
      if (y >= afterLine && y <= bottomLimit && fromIndex !== lastIndex) {
        const hitPath = rows[lastIndex]?.path;
        if (hitPath && !isAncestorPath(fromPath, hitPath)) {
          return { index: lastIndex, edge: "after" };
        }
      }
      const firstRow = listEl.querySelector(
        `.action-list-item[data-list-index="0"]`,
      ) as HTMLElement | null;
      if (firstRow && fromIndex !== 0) {
        const firstRect = firstRow.getBoundingClientRect();
        if (
          y >= listRect.top - LIST_END_SLACK_PX &&
          y < firstRect.top + firstRect.height * 0.5
        ) {
          const hitPath = rows[0]?.path;
          if (hitPath && !isAncestorPath(fromPath, hitPath)) {
            return { index: 0, edge: "before" };
          }
        }
      }
    }
    return null;
  }

  if (!(row instanceof HTMLElement)) return null;
  const raw = row.getAttribute("data-list-index");
  if (raw == null) return null;
  const index = Number(raw);
  if (!Number.isFinite(index) || index < 0 || index >= rows.length) return null;
  if (index === fromIndex) return null;

  const hitPath = rows[index]?.path;
  if (!hitPath) return null;
  if (isAncestorPath(fromPath, hitPath)) return null;

  const rect = row.getBoundingClientRect();
  const isLast = index === lastIndex;
  const splitY = isLast
    ? rect.top + rect.height * LAST_ROW_AFTER_RATIO
    : rect.top + rect.height / 2;
  const prevEdge = prev?.index === index ? prev.edge : null;
  let edge: "before" | "after";
  if (prevEdge && Math.abs(y - splitY) < EDGE_HYSTERESIS_PX) {
    edge = prevEdge;
  } else {
    edge = y < splitY ? "before" : "after";
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
  confirmDeleteAction = true,
  onSelect,
  onReorder,
  onRemove,
  onRemoveMany,
  onDuplicate,
  onDuplicateMany,
  onMove,
  onMoveMany,
  onRunFrom,
  onInsertBefore,
  onInsertAfter,
  onPasteAfter,
  onAddKind,
  onOpenAddMenu,
  onChangeAction,
  onAddToBranch,
  onEmptyAdd,
  onStartRecord,
  onApplyPreset,
  onClearSelection,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  addMenuItems,
  addMenuOpen,
  onAddMenuOpenChange,
  onOpenScript,
}: Props) {
  const t = useT();
  const rows: FlatRow[] = flattenTree(actions);
  const displayItems = useMemo(
    () => buildDisplayItems(actions, rows),
    [actions, rows],
  );
  const locked = disabled || readOnly;
  const reducedMotion = usePrefersReducedMotion();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropEdge, setDropEdge] = useState<DropEdge | null>(null);
  const [ghost, setGhost] = useState<DragGhost | null>(null);
  const [clipboardTick, setClipboardTick] = useState(0);
  const [multiKeys, setMultiKeys] = useState<Set<string>>(() => new Set());
  const [collapsedControls, setCollapsedControls] = useState<Set<string>>(
    () => new Set(),
  );
  const multiAnchorRef = useRef<string | null>(null);

  const toggleControlCollapse = (controlPath: ActionPath) => {
    const key = pathKey(controlPath);
    setCollapsedControls((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const rowCtx = useContextMenuState();
  const emptyCtx = useContextMenuState();
  const branchCtx = useContextMenuState();
  const [ctxPath, setCtxPath] = useState<ActionPath | null>(null);
  const [ctxBranch, setCtxBranch] = useState<{
    parentPath: ActionPath;
    branch: BranchKey;
    count: number;
  } | null>(null);
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

  useEffect(() => {
    if (!activePath) return;
    const key = pathKey(activePath);
    const el = listRef.current?.querySelector(
      `[data-list-path="${CSS.escape(key)}"]`,
    );
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activePath]);

  useEffect(() => {
    if (!selectedPath) {
      setMultiKeys(new Set());
      multiAnchorRef.current = null;
      return;
    }
    const key = pathKey(selectedPath);
    setMultiKeys((prev) => {
      if (prev.size <= 1 && prev.has(key)) return prev;
      if (prev.has(key) && prev.size > 1) return prev;
      return new Set([key]);
    });
    if (!multiAnchorRef.current) multiAnchorRef.current = key;
  }, [selectedPath]);

  const selectRow = (
    path: ActionPath,
    e?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
  ) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const key = pathKey(path);
    const ctrl = !!(e?.ctrlKey || e?.metaKey);
    const shift = !!e?.shiftKey;
    if (shift && multiAnchorRef.current) {
      const keys = rows.map((r) => pathKey(r.path));
      const a = keys.indexOf(multiAnchorRef.current);
      const b = keys.indexOf(key);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setMultiKeys(new Set(keys.slice(lo, hi + 1)));
        onSelect(path);
        return;
      }
    }
    if (ctrl) {
      setMultiKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        if (next.size === 0) next.add(key);
        return next;
      });
      multiAnchorRef.current = key;
      onSelect(path);
      return;
    }
    multiAnchorRef.current = key;
    setMultiKeys(new Set([key]));
    onSelect(path);
  };

  const removeSelectedPaths = async () => {
    const paths = rows
      .filter((r) => multiKeys.has(pathKey(r.path)))
      .map((r) => r.path);
    if (paths.length === 0) return;
    if (confirmDeleteAction) {
      const ok = await confirmAction({
        title: t("macros.confirm.deleteActionTitle"),
        message:
          paths.length > 1
            ? t("macros.confirm.deleteActionsMessage", { n: paths.length })
            : t("macros.confirm.deleteActionMessage"),
        confirmLabel: t("automations.confirm.deleteConfirm"),
        danger: true,
      });
      if (!ok) return;
    }
    if (onRemoveMany && paths.length > 1) {
      onRemoveMany(paths);
    } else if (paths.length === 1) {
      onRemove(paths[0]!);
    } else {
      const sorted = [...paths].sort((a, b) => {
        if (a.length !== b.length) return b.length - a.length;
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) return (b[i] ?? 0) - (a[i] ?? 0);
        }
        return 0;
      });
      for (const p of sorted) onRemove(p);
    }
    setMultiKeys(new Set());
    onClearSelection?.();
  };

  const copyPath = (path: ActionPath) => {
    const src = getAtPath(actions, path);
    if (!src) return;
    actionClipboard = [structuredClone(src)];
    setClipboardTick((n) => n + 1);
  };

  const copySelectedPaths = () => {
    const paths = rows
      .filter((r) => multiKeys.has(pathKey(r.path)))
      .map((r) => r.path);
    if (paths.length === 0 && selectedPath) {
      copyPath(selectedPath);
      return;
    }
    const items: MacroAction[] = [];
    for (const p of paths) {
      const src = getAtPath(actions, p);
      if (src) items.push(structuredClone(src));
    }
    if (items.length === 0) return;
    actionClipboard = items;
    setClipboardTick((n) => n + 1);
  };

  const cutPath = (path: ActionPath) => {
    const src = getAtPath(actions, path);
    if (!src) return;
    actionClipboard = [structuredClone(src)];
    setClipboardTick((n) => n + 1);
    onRemove(path);
  };

  const pasteAfterPath = (path: ActionPath) => {
    if (!actionClipboard?.length || !onPasteAfter) return;
    onPasteAfter(
      path,
      actionClipboard.length === 1
        ? structuredClone(actionClipboard[0]!)
        : structuredClone(actionClipboard),
    );
  };

  const ctxRowItems: MenuItemDef[] = useMemo(() => {
    if (!ctxPath) return [];
    const interactItems: MenuItemDef[] = [
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
    ];
    const ctxActionEarly = getAtPath(actions, ctxPath);
    const isControlFlowEarly =
      ctxActionEarly?.type === "control.if" ||
      ctxActionEarly?.type === "control.while";
    if (readOnly) {
      if (!isControlFlowEarly) return interactItems;
      const blockCollapsed = collapsedControls.has(pathKey(ctxPath));
      return [
        ...interactItems,
        {
          id: "fold-block",
          label: blockCollapsed
            ? t("macros.params.expandBlock")
            : t("macros.params.collapseBlock"),
          icon: <ChevronDown size={14} />,
          onSelect: () => toggleControlCollapse(ctxPath),
        },
      ];
    }

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
    const ctxAction = getAtPath(actions, ctxPath);
    const isControlFlow =
      ctxAction?.type === "control.if" || ctxAction?.type === "control.while";
    const blockCollapsed = collapsedControls.has(pathKey(ctxPath));

    const items: MenuItemDef[] = [
      interactItems[0]!,
      interactItems[1]!,
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
        disabled: !onPasteAfter || !actionClipboard?.length,
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
    ];

    if (isControlFlow) {
      if (onAddToBranch && ctxAction) {
        const branches: Array<"then" | "else" | "body"> =
          ctxAction.type === "control.while"
            ? ["body"]
            : ["then", "else"];
        const intoSubs: MenuItemDef[] = branches.map((branch) => {
          const addEntries = buildActionAddMenu(
            (kind) => onAddToBranch(ctxPath, branch, kind),
            t,
          );
          const addSub: MenuItemDef[] = [];
          for (const entry of addEntries) {
            if ("items" in entry) {
              addSub.push({
                id: `into-${branch}-${entry.id}`,
                label: entry.label,
                submenu: entry.items.map((item) => ({
                  id: `into-${branch}-${item.id}`,
                  label: item.label,
                  icon: item.icon,
                  onSelect: item.onSelect,
                })),
              });
            } else {
              addSub.push({
                id: `into-${branch}-${entry.id}`,
                label: entry.label,
                icon: entry.icon,
                onSelect: entry.onSelect,
              });
            }
          }
          return {
            id: `into-${branch}`,
            label: branchLabel(branch, t),
            icon: <GitBranch size={14} />,
            disabled: addSub.length === 0,
            submenu: addSub.length > 0 ? addSub : undefined,
          };
        });
        items.push({
          id: "add-into-branch",
          label: t("macros.params.addIntoBranch"),
          icon: <Plus size={14} />,
          submenu: intoSubs,
        });
      }
      items.push({
        id: "fold-block",
        label: blockCollapsed
          ? t("macros.params.expandBlock")
          : t("macros.params.collapseBlock"),
        icon: <ChevronDown size={14} />,
        onSelect: () => toggleControlCollapse(ctxPath),
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
      interactItems[2]!,
      interactItems[3]!,
      interactItems[4]!,
      {
        id: "delete",
        label: t("macros.menu.ctx.delete"),
        icon: <Trash2 size={14} />,
        danger: true,
        onSelect: () => onRemove(ctxPath),
      },
    );
    return items;
  }, [
    actions,
    canRedo,
    canUndo,
    collapsedControls,
    ctxPath,
    onAddToBranch,
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
    readOnly,
    selectedPath,
    clipboardTick,
    t,
  ]);

  const branchCtxItems: MenuItemDef[] = useMemo(() => {
    if (!ctxBranch) return [];
    const { parentPath, branch, count } = ctxBranch;
    const parentKey = pathKey(parentPath);
    const blockCollapsed = collapsedControls.has(parentKey);
    const addEntries = onAddToBranch
      ? buildActionAddMenu(
          (kind) => onAddToBranch(parentPath, branch, kind),
          t,
        )
      : [];
    const addSub: MenuItemDef[] = [];
    for (const entry of addEntries) {
      if ("items" in entry) {
        addSub.push({
          id: `branch-add-${entry.id}`,
          label: entry.label,
          submenu: entry.items.map((item) => ({
            id: `branch-add-${item.id}`,
            label: item.label,
            icon: item.icon,
            onSelect: item.onSelect,
          })),
        });
      } else {
        addSub.push({
          id: `branch-add-${entry.id}`,
          label: entry.label,
          icon: entry.icon,
          onSelect: entry.onSelect,
        });
      }
    }

    const items: MenuItemDef[] = [
      {
        id: "branch-add",
        label: t("macros.params.addToBranch"),
        icon: <Plus size={14} />,
        disabled: readOnly || locked || !onAddToBranch || addSub.length === 0,
        submenu: addSub.length > 0 ? addSub : undefined,
      },
      {
        id: "branch-fold",
        label: blockCollapsed
          ? t("macros.params.expandBlock")
          : t("macros.params.collapseBlock"),
        icon: <ChevronDown size={14} />,
        onSelect: () => toggleControlCollapse(parentPath),
      },
    ];

    if (!readOnly && !locked && count > 0 && onChangeAction) {
      items.push(
        { id: "sep-clear", label: "", separator: true },
        {
          id: "branch-clear",
          label: t("macros.params.clearBranch"),
          icon: <Trash2 size={14} />,
          danger: true,
          onSelect: () => {
            const parent = getAtPath(actions, parentPath);
            if (!parent) return;
            if (parent.type === "control.if") {
              onChangeAction(parentPath, {
                ...parent,
                then: branch === "then" ? [] : parent.then,
                else: branch === "else" ? [] : parent.else,
              });
            } else if (parent.type === "control.while" && branch === "body") {
              onChangeAction(parentPath, { ...parent, body: [] });
            }
          },
        },
      );
    }
    return items;
  }, [
    actions,
    collapsedControls,
    ctxBranch,
    locked,
    onAddToBranch,
    onChangeAction,
    readOnly,
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
    if (locked || multiKeys.size < 1) return;
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const primary =
        selectedPath ??
        rows.find((r) => multiKeys.has(pathKey(r.path)))?.path ??
        null;
      if (!primary) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const visible = rows.filter(
          (r) => !isDescendantOfCollapsed(r.path, collapsedControls),
        );
        if (visible.length === 0) return;
        const curKey = pathKey(primary);
        let idx = visible.findIndex((r) => pathKey(r.path) === curKey);
        if (idx < 0) idx = 0;
        const nextIdx =
          e.key === "ArrowDown"
            ? Math.min(visible.length - 1, idx + 1)
            : Math.max(0, idx - 1);
        const nextPath = visible[nextIdx]!.path;
        selectRow(nextPath, { shiftKey: e.shiftKey });
        const el = listRef.current?.querySelector(
          `[data-list-path="${CSS.escape(pathKey(nextPath))}"]`,
        );
        if (el instanceof HTMLElement) {
          el.scrollIntoView({ block: "nearest" });
        }
        return;
      }

      if (e.key === "Enter") {
        const action = getAtPath(actions, primary);
        if (
          action?.type === "control.if" ||
          action?.type === "control.while"
        ) {
          e.preventDefault();
          toggleControlCollapse(primary);
        }
        return;
      }

      if (mod && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        copySelectedPaths();
        return;
      }
      if (mod && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        if (multiKeys.size > 1) {
          copySelectedPaths();
          void removeSelectedPaths();
          return;
        }
        const src = getAtPath(actions, primary);
        if (!src) return;
        actionClipboard = [structuredClone(src)];
        setClipboardTick((n) => n + 1);
        onRemoveRef.current(primary);
        return;
      }
      if (mod && (e.key === "v" || e.key === "V")) {
        if (!actionClipboard?.length || !onPasteAfterRef.current) return;
        e.preventDefault();
        onPasteAfterRef.current(
          primary,
          actionClipboard.length === 1
            ? structuredClone(actionClipboard[0]!)
            : structuredClone(actionClipboard),
        );
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      e.preventDefault();
      void removeSelectedPaths();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    actions,
    collapsedControls,
    confirmDeleteAction,
    locked,
    multiKeys,
    rows,
    selectedPath,
    t,
  ]);

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
        "input, select, textarea, button, label.action-cell-mod, .action-cell-btn, .caster-condition-field, .caster-select, .act-params",
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
        listRef.current,
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
            listRef.current,
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
      setCollapsedControls((prev) =>
        remapCollapsedAfterReorder(prev, paths.fromPath, paths.toPath),
      );
      clearDrag();
      onReorderRef.current(paths.fromPath, paths.toPath);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  const dragFromPath =
    dragFrom != null ? (rows[dragFrom]?.path ?? null) : null;

  const clearSelectionIfBackground = (target: EventTarget | null) => {
    if (!onClearSelection || !selectedPath) return;
    const el = target instanceof HTMLElement ? target : null;
    if (!el) return;
    if (
      el.closest(
        ".action-list-item, .action-list-bulk, .action-list-empty, .caster-action-picker-root, .caster-dropdown-menu-root, .caster-menu-popover, .caster-context-menu, button, a, input, select, textarea, label, [role='button'], [role='menuitem'], [role='option']",
      )
    ) {
      return;
    }
    onClearSelection();
  };

  return (
    <div
      className="action-list-shell"
      onClick={(e) => clearSelectionIfBackground(e.target)}
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
            <span>#</span>
            <span>{t("macros.menu.list.headAction")}</span>
            <span>{t("macros.menu.list.headParams")}</span>
            <span>{t("macros.menu.list.headOffset")}</span>
            <span />
          </li>
        ) : null}
        {displayItems.map((item) => {
          if (item.kind === "branch-slot") {
            if (
              collapsedControls.has(pathKey(item.parentPath)) ||
              isDescendantOfCollapsed(item.parentPath, collapsedControls)
            ) {
              return null;
            }
            const branchClass =
              item.branch === "else" ? "branch-else" : "branch-then";
            const label = branchLabel(item.branch, t);
            const addAria = t("macros.params.addToBranchNamed", {
              branch: label,
            });
            const parentFlat = rows.findIndex((r) =>
              pathsEqual(r.path, item.parentPath),
            );
            const slotDropTarget =
              dragFromPath != null &&
              parentFlat >= 0 &&
              dropEdge != null &&
              dropEdge.index === parentFlat &&
              dropEdge.edge === "after" &&
              dropEdge.intoBranch === item.branch &&
              !isAncestorPath(dragFromPath, item.parentPath);
            return (
              <li
                key={item.key}
                className={[
                  "action-list-item",
                  "action-list-branch-slot",
                  "nested",
                  branchClass,
                  slotDropTarget ? "is-drop-target" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ ["--nest-depth" as string]: item.depth }}
                data-branch-parent={pathKey(item.parentPath)}
                data-branch-key={item.branch}
                onContextMenu={
                  !disabled
                    ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCtxBranch({
                          parentPath: item.parentPath,
                          branch: item.branch,
                          count: item.count,
                        });
                        branchCtx.openFromEvent(e);
                      }
                    : undefined
                }
              >
                <span className="idx">
                  <em className="branch-tag">{label}</em>
                  {onAddToBranch && !readOnly ? (
                    <ActionPickerMenu
                      label={addAria}
                      disabled={locked}
                      items={buildActionAddMenu(
                        (kind) =>
                          onAddToBranch(item.parentPath, item.branch, kind),
                        t,
                      )}
                      triggerContent={<Plus size={14} aria-hidden />}
                      triggerClassName="caster-btn caster-btn-ghost action-list-branch-slot-add"
                    />
                  ) : null}
                </span>
                <span className="lbl" />
                <div className="act-params" />
                <span className="act-offset" />
                <span />
              </li>
            );
          }

          const { row, flatIndex } = item;
          const abs = actionOffsetMs(actions, row.path);
          const displayOffset = formatActionOffset(actions, row.path, prevAbs);
          prevAbs = abs;
          if (isDescendantOfCollapsed(row.path, collapsedControls)) {
            return null;
          }
          const isControlFlow =
            row.action.type === "control.if" ||
            row.action.type === "control.while";
          const controlCollapsed =
            isControlFlow && collapsedControls.has(pathKey(row.path));
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
            dropEdge.edge === "after" &&
            dropEdge.intoBranch == null;

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

          const tone = actionTone(row.action.type);

          return (
            <Fragment key={pathKey(row.path)}>
              <li
                className={[
                  "action-list-item",
                  "has-hover-reveal",
                  pathsEqual(selectedPath, row.path) ||
                  multiKeys.has(pathKey(row.path))
                    ? "selected"
                    : "",
                  pathsEqual(activePath, row.path) ? "active" : "",
                  row.depth > 0 ? "nested" : "",
                  row.branchLabel === "then" || row.branchLabel === "body"
                    ? "branch-then"
                    : "",
                  row.branchLabel === "else" ? "branch-else" : "",
                  isControlFlow ? "action-list-control-row" : "",
                  controlCollapsed ? "is-collapsed" : "",
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
                data-tone={tone}
                onPointerDown={
                  !locked ? (ev) => onRowPointerDown(flatIndex, ev) : undefined
                }
                onClick={(e) => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  const el = e.target as HTMLElement;
                  if (el.closest(".row-ops")) return;
                  if (
                    el.closest(
                      "input, select, textarea, button, label.action-cell-mod, .action-cell-btn, .caster-condition-field, .caster-condition-swatch",
                    )
                  ) {
                    return;
                  }
                  if (isControlFlow) {
                    toggleControlCollapse(row.path);
                  }
                  selectRow(row.path, e);
                }}
                onContextMenu={
                  !disabled
                    ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCtxPath(row.path);
                        rowCtx.openFromEvent(e);
                      }
                    : undefined
                }
                {...(isControlFlow
                  ? {
                      "aria-expanded": !controlCollapsed,
                    }
                  : {})}
              >
                <span className="idx">
                  {padIndex(siblingIdx + 1)}
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
                      onActivate={() => onSelect(row.path)}
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
                {isControlFlow ? (
                  <span
                    className="action-list-control-fold-hit"
                    aria-hidden
                  />
                ) : null}
              </li>
            </Fragment>
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
        {addMenuItems && !readOnly && rows.length > 0 ? (
          <li className="action-list-add-row">
            <ActionPickerMenu
              label={t("macros.toolbar.add")}
              disabled={locked}
              items={addMenuItems}
              open={addMenuOpen}
              onOpenChange={onAddMenuOpenChange}
              triggerClassName="caster-btn caster-btn-primary caster-action-list-add-btn"
            />
          </li>
        ) : null}
      </ul>

      {!readOnly && rows.length > 0 ? (
        <p className="action-list-kbd-hint">{t("macros.menu.list.kbdHint")}</p>
      ) : null}

      {!readOnly && !locked && multiKeys.size > 1 ? (
        <div className="action-list-bulk" role="toolbar" aria-label={t("macros.bulk.aria")}>
          <span className="action-list-bulk-count">
            {t("macros.bulk.selected", { n: multiKeys.size })}
          </span>
          {onMove || onMoveMany ? (
            <>
              <button
                type="button"
                className="caster-btn caster-btn-ghost"
                onClick={() => {
                  const paths = rows
                    .filter((r) => multiKeys.has(pathKey(r.path)))
                    .map((r) => r.path);
                  if (onMoveMany) {
                    onMoveMany(paths, -1);
                    return;
                  }
                  for (const p of paths) onMove?.(p, -1);
                }}
              >
                <ArrowUp size={14} aria-hidden />
                {t("macros.bulk.moveUp")}
              </button>
              <button
                type="button"
                className="caster-btn caster-btn-ghost"
                onClick={() => {
                  const paths = rows
                    .filter((r) => multiKeys.has(pathKey(r.path)))
                    .map((r) => r.path);
                  if (onMoveMany) {
                    onMoveMany(paths, 1);
                    return;
                  }
                  for (const p of [...paths].reverse()) onMove?.(p, 1);
                }}
              >
                <ArrowDown size={14} aria-hidden />
                {t("macros.bulk.moveDown")}
              </button>
            </>
          ) : null}
          {onDuplicate || onDuplicateMany ? (
            <button
              type="button"
              className="caster-btn caster-btn-ghost"
              onClick={() => {
                const paths = rows
                  .filter((r) => multiKeys.has(pathKey(r.path)))
                  .map((r) => r.path);
                if (onDuplicateMany) {
                  onDuplicateMany(paths);
                } else {
                  for (const p of [...paths].reverse()) onDuplicate?.(p);
                }
                setMultiKeys(new Set());
              }}
            >
              <Copy size={14} aria-hidden />
              {t("macros.bulk.duplicate")}
            </button>
          ) : null}
          <button
            type="button"
            className="caster-btn caster-btn-danger-ghost"
            onClick={() => void removeSelectedPaths()}
          >
            <Trash2 size={14} aria-hidden />
            {t("macros.bulk.delete")}
          </button>
          <button
            type="button"
            className="caster-btn caster-btn-ghost"
            onClick={() => {
              setMultiKeys(new Set());
              onClearSelection?.();
            }}
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : null}

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

      <ContextMenu
        open={branchCtx.open}
        x={branchCtx.x}
        y={branchCtx.y}
        items={branchCtxItems}
        onClose={branchCtx.close}
        onSelect={(id) => {
          findMenuItem(branchCtxItems, id)?.onSelect?.();
        }}
        ariaLabel={t("macros.menu.list.branchCtxAria")}
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
              <span className="idx">{ghost.indexLabel}</span>
              <strong className="act-type">{ghost.title}</strong>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
