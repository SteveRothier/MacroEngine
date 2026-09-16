import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  canReorderAccueilRows,
  resolveAccueilReorderDrop,
  type AccueilDropEdge,
} from "./accueilDrop";
import { rowOrderKey } from "./accueilOrder";
import type { AutomationRow } from "./types";

const EDGE_HYSTERESIS_PX = 6;
const AUTO_SCROLL_EDGE_PX = 48;
const AUTO_SCROLL_MAX_PX = 18;

export type AccueilRowDropEdge = {
  key: string;
  edge: AccueilDropEdge;
};

export type AccueilDragGhost = {
  name: string;
  kind: AutomationRow["kind"];
  x: number;
  y: number;
};

export type AccueilDropIntent =
  | { type: "move-folder"; row: AutomationRow; folderId: string }
  | { type: "unfile"; row: AutomationRow }
  | {
      type: "reorder";
      row: AutomationRow;
      beforeKey: string | null;
      /** Also clear folderId before applying Accueil order. */
      unfile?: boolean;
      /** Move into this folder when dropping onto a row that lives there. */
      folderId?: string;
    };

type Options = {
  listScrollRef: RefObject<HTMLDivElement | null>;
  sortedRef: RefObject<AutomationRow[]>;
  /** Current Accueil sort mode (`order` enables row blue-line). */
  sortByRef: RefObject<string>;
  dragThresholdPx: number;
  onCommit: (intent: AccueilDropIntent) => void;
};

function rowKey(r: Pick<AutomationRow, "kind" | "id">): string {
  return rowOrderKey(r);
}

function hitTestFolderDrop(
  x: number,
  y: number,
  drag: AutomationRow,
): string | null {
  const el = document.elementFromPoint(x, y);
  if (!el || !(el instanceof Element)) return null;
  // Rows own the blue-line reorder; folder targets are header / end / root only.
  if (el.closest(".caster-auto-row[data-row-key]")) return null;

  const header = el.closest(
    ".caster-auto-folder-section[data-folder-drop-id]",
  );
  if (header instanceof HTMLElement) {
    const id = header.getAttribute("data-folder-drop-id");
    if (id) return id;
  }

  const folderEnd = el.closest(
    ".caster-auto-folder-section-end[data-folder-drop-id]",
  );
  if (folderEnd instanceof HTMLElement) {
    const id = folderEnd.getAttribute("data-folder-drop-id");
    if (id) return id;
  }

  if (drag.folderId != null) {
    const root = el.closest('[data-folder-drop="root"]');
    if (root) return "root";
  }

  return null;
}

function hitTestRowDrop(
  x: number,
  y: number,
  drag: AutomationRow,
  sorted: AutomationRow[],
  sortBy: string,
  prev: AccueilRowDropEdge | null,
): AccueilRowDropEdge | null {
  if (sortBy !== "order") return null;
  const el = document.elementFromPoint(x, y);
  if (!el || !(el instanceof Element)) return null;
  if (el.closest(".caster-auto-folder-chip, .caster-auto-folder-drop-chip")) {
    return null;
  }
  const rowEl = el.closest(".caster-auto-row[data-row-key]");
  if (!(rowEl instanceof HTMLElement)) return null;
  const key = rowEl.getAttribute("data-row-key");
  if (!key || key === rowKey(drag)) return null;
  const target = sorted.find((r) => rowKey(r) === key);
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

/**
 * Pointer DnD for Accueil: one window commit path, hit-test for folder/root/edge.
 */
export function useAccueilDnd({
  listScrollRef,
  sortedRef,
  sortByRef,
  dragThresholdPx,
  onCommit,
}: Options) {
  const [dragRow, setDragRow] = useState<AutomationRow | null>(null);
  const [dropFolderKey, setDropFolderKey] = useState<string | null>(null);
  const [dropEdge, setDropEdge] = useState<AccueilRowDropEdge | null>(null);
  const [dragGhost, setDragGhost] = useState<AccueilDragGhost | null>(null);

  const armedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const sessionRef = useRef<{
    row: AutomationRow;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const dropEdgeRef = useRef<AccueilRowDropEdge | null>(null);
  const dropFolderKeyRef = useRef<string | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const thresholdRef = useRef(dragThresholdPx);
  thresholdRef.current = dragThresholdPx;
  /** Bumps on each clear/new gesture so stale window listeners no-op. */
  const gestureIdRef = useRef(0);
  const detachListenersRef = useRef<(() => void) | null>(null);

  const clearDrag = useCallback((opts?: { suppressClick?: boolean }) => {
    const suppress =
      opts?.suppressClick === true || armedRef.current;
    gestureIdRef.current += 1;
    detachListenersRef.current?.();
    detachListenersRef.current = null;
    sessionRef.current = null;
    armedRef.current = false;
    dropEdgeRef.current = null;
    dropFolderKeyRef.current = null;
    setDragRow(null);
    setDropFolderKey(null);
    setDropEdge(null);
    setDragGhost(null);
    if (suppress) {
      suppressClickRef.current = true;
      const swallow = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
        suppressClickRef.current = false;
        window.removeEventListener("click", swallow, true);
      };
      window.addEventListener("click", swallow, true);
      window.setTimeout(() => {
        window.removeEventListener("click", swallow, true);
        suppressClickRef.current = false;
      }, 400);
    }
  }, []);

  const autoScrollNearEdges = useCallback(
    (clientY: number) => {
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
    },
    [listScrollRef],
  );

  const onRowPointerDown = useCallback(
    (row: AutomationRow, e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      // Always reset any leftover gesture so the 2nd+ DnD can start.
      clearDrag();
      const pointerId = e.pointerId;
      const gestureId = gestureIdRef.current;
      sessionRef.current = {
        row,
        pointerId,
        startX: e.clientX,
        startY: e.clientY,
      };

      const onMove = (ev: PointerEvent) => {
        if (gestureIdRef.current !== gestureId) return;
        const s = sessionRef.current;
        if (!s || ev.pointerId !== s.pointerId) return;
        if (!armedRef.current) {
          const dx = ev.clientX - s.startX;
          const dy = ev.clientY - s.startY;
          if (Math.hypot(dx, dy) < thresholdRef.current) return;
          armedRef.current = true;
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
          g ? { ...g, x: ev.clientX, y: ev.clientY } : g,
        );

        // Prefer row blue-line; folder header/end only when not over a row.
        const hit = hitTestRowDrop(
          ev.clientX,
          ev.clientY,
          s.row,
          sortedRef.current,
          sortByRef.current,
          dropEdgeRef.current,
        );
        if (hit) {
          dropFolderKeyRef.current = null;
          setDropFolderKey(null);
          dropEdgeRef.current = hit;
          setDropEdge(hit);
          return;
        }

        const folderHit = hitTestFolderDrop(ev.clientX, ev.clientY, s.row);
        dropFolderKeyRef.current = folderHit;
        setDropFolderKey(folderHit);
        dropEdgeRef.current = null;
        setDropEdge(null);
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (gestureIdRef.current !== gestureId) return;
        detachListenersRef.current?.();
        detachListenersRef.current = null;

        const s = sessionRef.current;
        const armed = armedRef.current;
        const edge = dropEdgeRef.current;
        const overFolder = dropFolderKeyRef.current;
        if (!armed || !s) {
          clearDrag();
          return;
        }

        if (overFolder === "root") {
          clearDrag({ suppressClick: true });
          onCommitRef.current({ type: "unfile", row: s.row });
          return;
        }
        if (overFolder) {
          clearDrag({ suppressClick: true });
          onCommitRef.current({
            type: "move-folder",
            row: s.row,
            folderId: overFolder,
          });
          return;
        }
        if (edge && sortByRef.current === "order") {
          const target = sortedRef.current.find((r) => rowKey(r) === edge.key);
          if (target) {
            const resolved = resolveAccueilReorderDrop(
              s.row,
              target,
              edge.edge,
              sortedRef.current,
            );
            const shouldUnfile =
              s.row.folderId != null && target.folderId == null;
            const targetFolderId = target.folderId ?? null;
            const shouldFile =
              targetFolderId != null && s.row.folderId !== targetFolderId;
            clearDrag({ suppressClick: true });
            if (resolved) {
              onCommitRef.current({
                type: "reorder",
                row: s.row,
                beforeKey: resolved.beforeKey,
                unfile: shouldUnfile || undefined,
                folderId: shouldFile ? targetFolderId : undefined,
              });
            } else if (shouldUnfile) {
              onCommitRef.current({ type: "unfile", row: s.row });
            } else if (shouldFile && targetFolderId) {
              onCommitRef.current({
                type: "move-folder",
                row: s.row,
                folderId: targetFolderId,
              });
            }
            return;
          }
        }
        clearDrag({ suppressClick: true });
      };

      const detach = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      detachListenersRef.current = detach;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [autoScrollNearEdges, clearDrag, sortByRef, sortedRef],
  );

  return {
    dragRow,
    dropFolderKey,
    dropEdge,
    dragGhost,
    armedRef,
    suppressClickRef,
    onRowPointerDown,
    clearDrag,
  };
}
