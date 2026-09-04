import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { confirmAction } from "../ui";
import type { AddMenuEntry } from "../ui";
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
  onChangeAction?: (path: ActionPath, action: MacroAction) => void;
  onEmptyAdd?: () => void;
  branchAddMenuItems?: (branch: "then" | "else") => AddMenuEntry[];
};

const DRAG_THRESHOLD_PX = 6;
const EDGE_HYSTERESIS_PX = 6;

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
  if (!Number.isFinite(index) || index === fromIndex) return null;
  const fromParent = rows[fromIndex]?.path.slice(0, -1);
  const dropParent = rows[index]?.path.slice(0, -1);
  if (!fromParent || !dropParent || !pathsEqual(fromParent, dropParent)) {
    return null;
  }
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

export function ActionList({
  actions,
  selectedPath,
  activePath,
  disabled,
  readOnly,
  onSelect,
  onReorder,
  onRemove,
  onChangeAction,
  onEmptyAdd,
  branchAddMenuItems,
}: Props) {
  const rows: FlatRow[] = flattenTree(actions);
  const locked = disabled || readOnly;
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropEdge, setDropEdge] = useState<DropEdge | null>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const dropEdgeRef = useRef<DropEdge | null>(null);
  const rowsRef = useRef(rows);
  const suppressClickRef = useRef(false);
  const onReorderRef = useRef(onReorder);
  const onRemoveRef = useRef(onRemove);
  rowsRef.current = rows;
  onReorderRef.current = onReorder;
  onRemoveRef.current = onRemove;

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
    document.body.classList.remove("action-list-is-dragging");
  }

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
      clearDrag();

      if (!wasActive || !hit) return;
      const paths = dropToReorderPaths(currentRows, from, hit);
      if (!paths) return;
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
    <ul
      className={[
        "action-list",
        "action-list-dense",
        dragFrom != null ? "is-dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
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
          dragParent != null && pathsEqual(dragParent, parentPath(row.path));
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
            const e = dragGestureEndIndex(siblings, s);
            if (e != null && siblingIdx <= e) return true;
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
              !locked ? (e) => onRowPointerDown(flatIndex, e) : undefined
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
          >
            <span
              className={`action-dot ${actionTone(row.action.type)}`}
              aria-hidden
            />
            <span className="idx">
              {isBranchHead(row) && row.branchLabel ? (
                <em className="branch-tag">{branchLabelFr(row.branchLabel)}</em>
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
            <p>Ajoute un clic, un délai ou une condition pour démarrer la macro.</p>
            {onEmptyAdd && !readOnly ? (
              <button
                type="button"
                className="v2-btn v2-btn-primary"
                disabled={locked}
                onClick={onEmptyAdd}
              >
                Ajouter une étape
              </button>
            ) : null}
          </div>
        </li>
      ) : null}
    </ul>
  );
}
