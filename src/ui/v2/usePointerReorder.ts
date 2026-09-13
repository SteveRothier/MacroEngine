import { useCallback, useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const DEFAULT_THRESHOLD_PX = 6;

export type PointerReorderHandlers = {
  onPointerDown: (index: number, e: React.PointerEvent) => void;
  draggingIndex: number | null;
  overIndex: number | null;
  isDragging: boolean;
};

type Options<T> = {
  items: T[];
  getId: (item: T) => string;
  onReorder: (from: number, to: number) => void;
  thresholdPx?: number;
  disabled?: boolean;
};

/**
 * Flat-list pointer reorder (seuil + Escape cancel).
 * Used by simple flat lists (e.g. clicker zones). Accueil / Library keep
 * custom drag sessions (folder targets + key-based reorder).
 */
export function usePointerReorder<T>({
  items,
  getId,
  onReorder,
  thresholdPx = DEFAULT_THRESHOLD_PX,
  disabled = false,
}: Options<T>): PointerReorderHandlers {
  const reducedMotion = usePrefersReducedMotion();
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const session = useRef<{
    from: number;
    pointerId: number;
    startY: number;
    armed: boolean;
    ids: string[];
  } | null>(null);

  const reset = useCallback(() => {
    session.current = null;
    setDraggingIndex(null);
    setOverIndex(null);
    document.body.classList.remove("v2-pointer-reorder-dragging");
  }, []);

  useEffect(() => {
    if (disabled) reset();
  }, [disabled, reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && session.current) {
        e.preventDefault();
        reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset]);

  const onPointerDown = useCallback(
    (index: number, e: React.PointerEvent) => {
      if (disabled || e.button !== 0) return;
      const ids = items.map(getId);
      session.current = {
        from: index,
        pointerId: e.pointerId,
        startY: e.clientY,
        armed: false,
        ids,
      };

      const onMove = (ev: PointerEvent) => {
        const s = session.current;
        if (!s || ev.pointerId !== s.pointerId) return;
        const dy = Math.abs(ev.clientY - s.startY);
        if (!s.armed) {
          if (dy < thresholdPx) return;
          s.armed = true;
          setDraggingIndex(s.from);
          document.body.classList.add("v2-pointer-reorder-dragging");
        }
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const row = el?.closest?.("[data-reorder-id]") as HTMLElement | null;
        const id = row?.dataset.reorderId;
        if (!id) return;
        const to = s.ids.indexOf(id);
        if (to >= 0) setOverIndex(to);
      };

      const onUp = (ev: PointerEvent) => {
        const s = session.current;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (!s || ev.pointerId !== s.pointerId) {
          reset();
          return;
        }
        if (s.armed) {
          const el = document.elementFromPoint(ev.clientX, ev.clientY);
          const row = el?.closest?.("[data-reorder-id]") as HTMLElement | null;
          const id = row?.dataset.reorderId;
          const to = id != null ? s.ids.indexOf(id) : -1;
          if (to >= 0 && to !== s.from) {
            onReorder(s.from, to);
          }
        }
        reset();
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [disabled, getId, items, onReorder, reset, thresholdPx],
  );

  return {
    onPointerDown,
    draggingIndex,
    overIndex: reducedMotion ? overIndex : overIndex,
    isDragging: draggingIndex != null,
  };
}
