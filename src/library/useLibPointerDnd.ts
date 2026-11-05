import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { AutomationFolderOption, AutomationRow } from "../automations/types";
import { rowDomKey, UNFILED_ID } from "./libTree";

const LIB_DRAG_THRESHOLD_PX = 6;

export type LibDragGhost = {
  name: string;
  x: number;
  y: number;
};

type Options = {
  foldersRef: MutableRefObject<AutomationFolderOption[]>;
  onMove: (
    row: AutomationRow,
    folder: AutomationFolderOption | null,
  ) => void | Promise<void>;
  onOpen: (row: AutomationRow) => void;
};

export function useLibPointerDnd({ foldersRef, onMove, onOpen }: Options) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragGhost, setDragGhost] = useState<LibDragGhost | null>(null);
  const dragSessionRef = useRef<{
    row: AutomationRow;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const dragArmedRef = useRef(false);
  const dropTargetRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  const gestureIdRef = useRef(0);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const clearLibDrag = useCallback((opts?: { suppressClick?: boolean }) => {
    const suppress = opts?.suppressClick === true || dragArmedRef.current;
    gestureIdRef.current += 1;
    dragSessionRef.current = null;
    dragArmedRef.current = false;
    dropTargetRef.current = null;
    setDraggingKey(null);
    setDropTarget(null);
    setDragGhost(null);
    if (suppress) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 350);
    }
  }, []);

  const onItemPointerDown = useCallback(
    (row: AutomationRow, e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      if (row.trashed || row.locked) return;
      clearLibDrag();
      const pointerId = e.pointerId;
      const gestureId = gestureIdRef.current;
      dragSessionRef.current = {
        row,
        pointerId,
        startX: e.clientX,
        startY: e.clientY,
      };

      const detach = () => {
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
          setDraggingKey(rowDomKey(s.row));
          setDragGhost({
            name: s.row.name,
            x: ev.clientX,
            y: ev.clientY,
          });
        } else {
          setDragGhost((g) =>
            g ? { ...g, x: ev.clientX, y: ev.clientY } : g,
          );
        }
        ev.preventDefault();
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        let next: string | null = null;
        if (el instanceof Element) {
          const folderNode = el.closest(
            ".caster-lib-tree-node[data-folder-drop-id]",
          );
          if (folderNode instanceof HTMLElement) {
            next = folderNode.dataset.folderDropId ?? null;
          } else {
            const unfiled = el.closest(
              ".caster-lib-unfiled[data-folder-drop-id]",
            );
            if (unfiled instanceof HTMLElement) {
              next = unfiled.dataset.folderDropId ?? null;
            }
          }
        }
        if (dropTargetRef.current === next) return;
        dropTargetRef.current = next;
        setDropTarget(next);
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (gestureIdRef.current !== gestureId) return;
        detach();

        const s = dragSessionRef.current;
        const armed = dragArmedRef.current;
        const targetId = dropTargetRef.current;
        if (!armed || !s) {
          clearLibDrag();
          return;
        }

        const folder =
          targetId && targetId !== UNFILED_ID
            ? (foldersRef.current.find((f) => f.id === targetId) ?? null)
            : null;
        const nextId = targetId === UNFILED_ID ? null : (folder?.id ?? null);
        const shouldMove =
          targetId != null &&
          (targetId === UNFILED_ID || folder != null) &&
          s.row.folderId !== nextId;

        clearLibDrag({ suppressClick: true });
        if (shouldMove) {
          void onMoveRef.current(
            s.row,
            targetId === UNFILED_ID ? null : folder,
          );
        }
      };

      window.addEventListener("pointermove", onMoveListener, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [clearLibDrag, foldersRef],
  );

  useEffect(() => () => clearLibDrag(), [clearLibDrag]);

  useEffect(() => {
    const on = Boolean(draggingKey);
    document.body.classList.toggle("is-lib-dragging", on);
    return () => document.body.classList.remove("is-lib-dragging");
  }, [draggingKey]);

  const openRow = useCallback(
    (row: AutomationRow) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      onOpen(row);
    },
    [onOpen],
  );

  return {
    dropTarget,
    draggingKey,
    dragGhost,
    onItemPointerDown,
    openRow,
  };
}
