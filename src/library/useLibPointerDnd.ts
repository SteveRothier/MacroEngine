import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { AutomationFolderOption, AutomationRow } from "../automations/types";
import { computeFolderReorderIds } from "./libFolderOrder";
import {
  resolveFolderDropHit,
  resolveItemDropHit,
  sortFolderRows,
  sortSiblingFolders,
  type DropHit,
  type LibDropIndicator,
} from "./libDropHit";
import { folderNavKey, rowDomKey, UNFILED_ID } from "./libTree";

export type { LibDropIndicator } from "./libDropHit";

const LIB_DRAG_THRESHOLD_PX = 6;
/** Badge sits tight against the system cursor hotspot. */
const LIB_CURSOR_OFFSET_X_PX = 2;
const LIB_CURSOR_OFFSET_Y_PX = 2;
const LIB_CURSOR_SIZE_PX = 28;
const LIB_CURSOR_PAD_PX = 4;

export type LibDragGhost =
  | { type: "item"; kind: AutomationRow["kind"] }
  | { type: "folder" };

type DragSession =
  | {
      kind: "item";
      row: AutomationRow;
      pointerId: number;
      startX: number;
      startY: number;
    }
  | {
      kind: "folder";
      folder: AutomationFolderOption;
      pointerId: number;
      startX: number;
      startY: number;
    };

type Options = {
  foldersRef: MutableRefObject<AutomationFolderOption[]>;
  rowsRef: MutableRefObject<AutomationRow[]>;
  onMoveItem: (
    row: AutomationRow,
    folder: AutomationFolderOption | null,
    beforeId?: string | null,
    beforeKind?: AutomationRow["kind"] | null,
  ) => void | Promise<void>;
  onMoveFolder: (
    folder: AutomationFolderOption,
    parentId: string | null,
    beforeFolderId: string | null,
  ) => void | Promise<void>;
  onOpen: (row: AutomationRow) => void;
};

function cursorGhostPosition(clientX: number, clientY: number): {
  x: number;
  y: number;
} {
  let x = clientX + LIB_CURSOR_OFFSET_X_PX;
  let y = clientY + LIB_CURSOR_OFFSET_Y_PX;
  x = Math.min(
    x,
    window.innerWidth - LIB_CURSOR_PAD_PX - LIB_CURSOR_SIZE_PX,
  );
  x = Math.max(x, LIB_CURSOR_PAD_PX);
  y = Math.min(
    y,
    window.innerHeight - LIB_CURSOR_PAD_PX - LIB_CURSOR_SIZE_PX,
  );
  y = Math.max(y, LIB_CURSOR_PAD_PX);
  return { x, y };
}

function applyCursorTransform(
  el: HTMLElement | null,
  x: number,
  y: number,
) {
  if (!el) return;
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

export function useLibPointerDnd({
  foldersRef,
  rowsRef,
  onMoveItem,
  onMoveFolder,
  onOpen,
}: Options) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<LibDropIndicator | null>(
    null,
  );
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragGhost, setDragGhost] = useState<LibDragGhost | null>(null);
  const dragCursorRef = useRef<HTMLDivElement | null>(null);
  const dragCursorPosRef = useRef({ x: 0, y: 0 });
  const dragSessionRef = useRef<DragSession | null>(null);
  const dragArmedRef = useRef(false);
  const dropHitRef = useRef<DropHit | null>(null);
  const suppressClickRef = useRef(false);
  const gestureIdRef = useRef(0);
  const onMoveItemRef = useRef(onMoveItem);
  const onMoveFolderRef = useRef(onMoveFolder);
  onMoveItemRef.current = onMoveItem;
  onMoveFolderRef.current = onMoveFolder;

  const clearLibDrag = useCallback((opts?: { suppressClick?: boolean }) => {
    const suppress = opts?.suppressClick === true || dragArmedRef.current;
    gestureIdRef.current += 1;
    dragSessionRef.current = null;
    dragArmedRef.current = false;
    dropHitRef.current = null;
    setDraggingKey(null);
    setDropTarget(null);
    setDropIndicator(null);
    setDragGhost(null);
    if (suppress) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 350);
    }
  }, []);

  const setDragCursorNode = useCallback((node: HTMLDivElement | null) => {
    dragCursorRef.current = node;
    if (node) {
      const { x, y } = dragCursorPosRef.current;
      node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }, []);

  const shouldSuppressClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  }, []);

  const beginPointerGesture = useCallback(
    (session: DragSession, target: HTMLElement, dragKey: string) => {
      clearLibDrag();
      const pointerId = session.pointerId;
      const gestureId = gestureIdRef.current;
      dragSessionRef.current = session;

      try {
        target.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }

      const detach = () => {
        try {
          if (target.hasPointerCapture?.(pointerId)) {
            target.releasePointerCapture(pointerId);
          }
        } catch {
          /* ignore */
        }
        target.removeEventListener("pointermove", onMoveListener);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
        window.removeEventListener("pointermove", onMoveListener);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      const onMoveListener = (ev: PointerEvent) => {
        if (gestureIdRef.current !== gestureId) return;
        const s = dragSessionRef.current;
        if (!s || ev.pointerId !== s.pointerId) return;
        if (!dragArmedRef.current) {
          const dist = Math.hypot(ev.clientX - s.startX, ev.clientY - s.startY);
          if (dist < LIB_DRAG_THRESHOLD_PX) return;
          dragArmedRef.current = true;
          ev.preventDefault();
          const pos = cursorGhostPosition(ev.clientX, ev.clientY);
          dragCursorPosRef.current = pos;
          setDraggingKey(dragKey);
          setDragGhost(
            s.kind === "item"
              ? { type: "item", kind: s.row.kind }
              : { type: "folder" },
          );
          applyCursorTransform(dragCursorRef.current, pos.x, pos.y);
        } else {
          ev.preventDefault();
          const pos = cursorGhostPosition(ev.clientX, ev.clientY);
          dragCursorPosRef.current = pos;
          applyCursorTransform(dragCursorRef.current, pos.x, pos.y);
        }

        const hit =
          s.kind === "item"
            ? resolveItemDropHit(
                ev.clientX,
                ev.clientY,
                dragKey,
                rowsRef.current,
              )
            : resolveFolderDropHit(
                ev.clientX,
                ev.clientY,
                s.folder,
                foldersRef.current,
              );
        dropHitRef.current = hit;
        if (!hit || hit.cancel) {
          setDropTarget((prev) => (prev == null ? prev : null));
          setDropIndicator((prev) => (prev == null ? prev : null));
          return;
        }

        let nextTarget: string | null = null;
        if (hit.mode === "item") {
          nextTarget = hit.indicator == null ? hit.targetId : null;
        } else {
          nextTarget = hit.nestIntoId;
        }
        setDropTarget((prev) => (prev === nextTarget ? prev : nextTarget));
        const nextInd = hit.indicator;
        setDropIndicator((prev) =>
          prev?.key === nextInd?.key && prev?.edge === nextInd?.edge
            ? prev
            : nextInd,
        );
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (gestureIdRef.current !== gestureId) return;
        detach();

        const s = dragSessionRef.current;
        const armed = dragArmedRef.current;
        const hit = dropHitRef.current;
        if (!armed || !s || !hit || hit.cancel) {
          clearLibDrag({ suppressClick: armed });
          return;
        }

        if (s.kind === "item" && hit.mode === "item") {
          const nextFolderId =
            hit.targetId === UNFILED_ID ? null : hit.targetId;
          const folder =
            nextFolderId == null
              ? null
              : (foldersRef.current.find((f) => f.id === nextFolderId) ?? null);

          if (hit.targetId !== UNFILED_ID && folder == null) {
            clearLibDrag({ suppressClick: true });
            return;
          }

          const live =
            rowsRef.current.find((r) => rowDomKey(r) === dragKey) ?? s.row;
          const beforeId = hit.beforeId;
          const beforeKind = hit.beforeKind;
          const sameFolder = (live.folderId ?? null) === nextFolderId;
          const visual = sortFolderRows(rowsRef.current, nextFolderId);
          const dragKeyLive = rowDomKey(live);

          let commit = false;
          if (!sameFolder) {
            commit = true;
          } else if (
            beforeId != null &&
            beforeKind != null &&
            !(beforeId === live.id && beforeKind === live.kind)
          ) {
            const fromIdx = visual.findIndex(
              (r) => rowDomKey(r) === dragKeyLive,
            );
            const beforeIdx = visual.findIndex(
              (r) => r.id === beforeId && r.kind === beforeKind,
            );
            commit = !(
              fromIdx >= 0 &&
              beforeIdx >= 0 &&
              fromIdx + 1 === beforeIdx
            );
          } else if (beforeId == null) {
            const last = visual[visual.length - 1];
            commit = Boolean(last && rowDomKey(last) !== dragKeyLive);
          }

          clearLibDrag({ suppressClick: true });
          if (commit) {
            void onMoveItemRef.current(live, folder, beforeId, beforeKind);
          }
          return;
        }

        if (s.kind === "folder" && hit.mode === "folder") {
          const live =
            foldersRef.current.find((f) => f.id === s.folder.id) ?? s.folder;
          const parentId = hit.nestIntoId ?? hit.parentId;
          const beforeFolderId = hit.nestIntoId ? null : hit.beforeFolderId;
          const sameParent = (live.parentId ?? null) === parentId;
          const siblings = sortSiblingFolders(foldersRef.current, parentId);
          let commit = false;
          if (!sameParent) {
            commit = true;
          } else if (beforeFolderId != null && beforeFolderId !== live.id) {
            const fromIdx = siblings.findIndex((f) => f.id === live.id);
            const beforeIdx = siblings.findIndex((f) => f.id === beforeFolderId);
            commit = !(
              fromIdx >= 0 &&
              beforeIdx >= 0 &&
              fromIdx + 1 === beforeIdx
            );
          } else if (beforeFolderId == null) {
            const last = siblings[siblings.length - 1];
            commit = Boolean(last && last.id !== live.id);
          }

          // Validate order computable before commit.
          if (
            commit &&
            !computeFolderReorderIds(
              foldersRef.current,
              live.id,
              parentId,
              beforeFolderId,
            )
          ) {
            commit = false;
          }

          clearLibDrag({ suppressClick: true });
          if (commit) {
            void onMoveFolderRef.current(live, parentId, beforeFolderId);
          }
        } else {
          clearLibDrag({ suppressClick: true });
        }
      };

      target.addEventListener("pointermove", onMoveListener);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onUp);
      window.addEventListener("pointermove", onMoveListener, {
        passive: false,
      });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [clearLibDrag, foldersRef, rowsRef],
  );

  const onItemPointerDown = useCallback(
    (row: AutomationRow, e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      beginPointerGesture(
        {
          kind: "item",
          row,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
        },
        e.currentTarget as HTMLElement,
        rowDomKey(row),
      );
    },
    [beginPointerGesture],
  );

  const onFolderPointerDown = useCallback(
    (folder: AutomationFolderOption, e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      beginPointerGesture(
        {
          kind: "folder",
          folder,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
        },
        e.currentTarget as HTMLElement,
        folderNavKey(folder.id),
      );
    },
    [beginPointerGesture],
  );

  useEffect(() => () => clearLibDrag(), [clearLibDrag]);

  useEffect(() => {
    const on = Boolean(draggingKey);
    document.body.classList.toggle("is-lib-dragging", on);
    return () => document.body.classList.remove("is-lib-dragging");
  }, [draggingKey]);

  useEffect(() => {
    if (!draggingKey) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      clearLibDrag({ suppressClick: true });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [draggingKey, clearLibDrag]);

  const openRow = useCallback(
    (row: AutomationRow) => {
      if (shouldSuppressClick()) return;
      onOpen(row);
    },
    [onOpen, shouldSuppressClick],
  );

  return {
    dropTarget,
    dropIndicator,
    draggingKey,
    dragGhost,
    setDragCursorNode,
    onItemPointerDown,
    onFolderPointerDown,
    openRow,
    shouldSuppressClick,
  };
}
