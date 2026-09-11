import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { DocumentTabItem } from "./DocumentTabBar";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const DRAG_THRESHOLD_PX = 6;
const EDGE_SCROLL_PX = 24;
const EDGE_HYSTERESIS_PX = 6;
const FLIP_DURATION_MS = 180;
const FLIP_EASING = "cubic-bezier(0.2, 0, 0, 1)";

export type TabReorderHandler = (
  fromTabId: string,
  insertBeforeTabId: string | null,
) => void;

export type TabGhostMeta = {
  tab: DocumentTabItem;
  width: number;
  height: number;
};

export type TabDragUi = {
  isDragging: boolean;
  draggingId: string | null;
  ghost: TabGhostMeta | null;
};

type Session = {
  tabId: string;
  tab: DocumentTabItem;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  pinGroup: boolean;
  ghostOffsetX: number;
  ghostOffsetY: number;
  width: number;
  height: number;
  initialOrder: string[];
};

function getReorderableIds(
  tabs: DocumentTabItem[],
  pinGroup: boolean,
): string[] {
  return tabs
    .filter((t) => t.kind !== "home" && Boolean(t.pinned) === pinGroup)
    .map((t) => t.id);
}

function captureLeftRects(
  ids: string[],
  tabEls: Map<string, HTMLDivElement>,
): Map<string, number> {
  const rects = new Map<string, number>();
  for (const id of ids) {
    const el = tabEls.get(id);
    if (!el) continue;
    rects.set(id, el.getBoundingClientRect().left);
  }
  return rects;
}

function captureFrozenWidths(
  tabEls: Map<string, HTMLDivElement>,
): Record<string, number> {
  const widths: Record<string, number> = {};
  tabEls.forEach((el, id) => {
    widths[id] = el.getBoundingClientRect().width;
  });
  return widths;
}

function applyFrozenWidths(
  tabEls: Map<string, HTMLDivElement>,
  widths: Record<string, number>,
): void {
  for (const [id, width] of Object.entries(widths)) {
    const el = tabEls.get(id);
    if (!el) continue;
    const px = `${width}px`;
    if (el.classList.contains("v2-doc-tab--home")) {
      el.style.flex = "0 0 auto";
      el.style.width = px;
      el.style.minWidth = px;
      el.style.maxWidth = px;
      continue;
    }
    el.style.flex = "none";
    el.style.width = px;
    el.style.minWidth = px;
    el.style.maxWidth = px;
  }
}

function clearFrozenWidths(tabEls: Map<string, HTMLDivElement>): void {
  tabEls.forEach((el) => {
    el.style.flex = "";
    el.style.width = "";
    el.style.minWidth = "";
    el.style.maxWidth = "";
  });
}

function clearFlipStyles(el: HTMLDivElement): void {
  el.getAnimations().forEach((anim) => anim.cancel());
  el.style.transition = "";
  el.style.transform = "";
}

function playFlip(
  tabEls: Map<string, HTMLDivElement>,
  firstRects: Map<string, number>,
  skipId: string | null,
  reducedMotion = false,
): void {
  if (firstRects.size === 0) return;
  if (reducedMotion) {
    tabEls.forEach((el) => clearFlipStyles(el));
    return;
  }

  firstRects.forEach((firstLeft, id) => {
    if (id === skipId) return;
    const el = tabEls.get(id);
    if (!el) return;

    const lastLeft = el.getBoundingClientRect().left;
    const dx = firstLeft - lastLeft;
    if (Math.abs(dx) < 0.5) return;

    el.getAnimations().forEach((anim) => anim.cancel());
    clearFlipStyles(el);

    const animation = el.animate(
      [
        { transform: `translateX(${dx}px)` },
        { transform: "translateX(0px)" },
      ],
      {
        duration: FLIP_DURATION_MS,
        easing: FLIP_EASING,
        fill: "forwards",
      },
    );

    animation.onfinish = () => {
      clearFlipStyles(el);
    };
  });
}

function buildDisplayTabs(
  tabs: DocumentTabItem[],
  previewOrder: string[] | null,
  pinGroup: boolean | null,
): DocumentTabItem[] {
  if (!previewOrder || pinGroup == null) return tabs;

  const byId = new Map(tabs.map((t) => [t.id, t]));
  const home = tabs.filter((t) => t.kind === "home");
  const pinned = tabs.filter((t) => t.kind !== "home" && t.pinned);
  const unpinned = tabs.filter((t) => t.kind !== "home" && !t.pinned);
  const orderedGroup = previewOrder
    .map((id) => byId.get(id))
    .filter((t): t is DocumentTabItem => t != null);

  if (pinGroup) {
    return [...home, ...orderedGroup, ...unpinned];
  }
  return [...home, ...pinned, ...orderedGroup];
}

export function useDocumentTabReorder({
  tabs,
  tabElsRef,
  scrollRef,
  onTabReorder,
  enabled = true,
}: {
  tabs: DocumentTabItem[];
  tabElsRef: MutableRefObject<Map<string, HTMLDivElement>>;
  scrollRef: RefObject<HTMLDivElement | null>;
  onTabReorder?: TabReorderHandler;
  enabled?: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [dragUi, setDragUi] = useState<TabDragUi>({
    isDragging: false,
    draggingId: null,
    ghost: null,
  });
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
  const [previewPinGroup, setPreviewPinGroup] = useState<boolean | null>(null);
  const [frozenTabWidths, setFrozenTabWidths] = useState<Record<
    string,
    number
  > | null>(null);

  const ghostElRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const previewOrderRef = useRef<string[] | null>(null);
  const firstRectsRef = useRef<Map<string, number> | null>(null);
  const pendingFlipRef = useRef(false);
  const suppressClickRef = useRef(false);
  const onTabReorderRef = useRef(onTabReorder);
  const tabsRef = useRef(tabs);
  const reducedMotionRef = useRef(reducedMotion);
  onTabReorderRef.current = onTabReorder;
  tabsRef.current = tabs;
  previewOrderRef.current = previewOrder;
  reducedMotionRef.current = reducedMotion;

  const canDragTab = useCallback(
    (tab: DocumentTabItem) =>
      enabled && Boolean(onTabReorder) && tab.kind !== "home",
    [enabled, onTabReorder],
  );

  const displayTabs = useMemo(
    () => buildDisplayTabs(tabs, previewOrder, previewPinGroup),
    [tabs, previewOrder, previewPinGroup],
  );

  const clearDrag = useCallback(() => {
    tabElsRef.current.forEach((el) => clearFlipStyles(el));
    clearFrozenWidths(tabElsRef.current);
    if (ghostElRef.current) {
      ghostElRef.current.style.display = "none";
    }
    sessionRef.current = null;
    previewOrderRef.current = null;
    firstRectsRef.current = null;
    pendingFlipRef.current = false;
    setPreviewOrder(null);
    setPreviewPinGroup(null);
    setFrozenTabWidths(null);
    setDragUi({
      isDragging: false,
      draggingId: null,
      ghost: null,
    });
    scrollRef.current?.classList.remove("is-tab-dragging");
  }, [scrollRef, tabElsRef]);

  useEffect(() => () => clearDrag(), [clearDrag]);

  useLayoutEffect(() => {
    if (!pendingFlipRef.current || !firstRectsRef.current) return;
    const first = firstRectsRef.current;
    const skipId = sessionRef.current?.tabId ?? null;
    pendingFlipRef.current = false;
    firstRectsRef.current = null;
    playFlip(tabElsRef.current, first, skipId, reducedMotionRef.current);
  }, [previewOrder, tabElsRef]);

  const tryAdjacentSwap = useCallback(
    (clientX: number, session: Session) => {
      const order = previewOrderRef.current;
      if (!order) return;

      const idx = order.indexOf(session.tabId);
      if (idx < 0) return;

      const tabEls = tabElsRef.current;
      const draggedEl = tabEls.get(session.tabId);
      if (!draggedEl) return;

      const draggedRect = draggedEl.getBoundingClientRect();

      if (idx < order.length - 1) {
        const rightId = order[idx + 1]!;
        const rightEl = tabEls.get(rightId);
        if (rightEl) {
          const rightRect = rightEl.getBoundingClientRect();
          const mid = rightRect.left + rightRect.width / 2;
          if (clientX > mid + EDGE_HYSTERESIS_PX) {
            const next = [...order];
            next[idx] = rightId;
            next[idx + 1] = session.tabId;
            firstRectsRef.current = captureLeftRects(order, tabEls);
            firstRectsRef.current.set(session.tabId, draggedRect.left);
            pendingFlipRef.current = true;
            previewOrderRef.current = next;
            setPreviewOrder(next);
            return;
          }
        }
      }

      if (idx > 0) {
        const leftId = order[idx - 1]!;
        const leftEl = tabEls.get(leftId);
        if (leftEl) {
          const leftRect = leftEl.getBoundingClientRect();
          const mid = leftRect.left + leftRect.width / 2;
          if (clientX < mid - EDGE_HYSTERESIS_PX) {
            const next = [...order];
            next[idx] = leftId;
            next[idx - 1] = session.tabId;
            firstRectsRef.current = captureLeftRects(order, tabEls);
            firstRectsRef.current.set(session.tabId, draggedRect.left);
            pendingFlipRef.current = true;
            previewOrderRef.current = next;
            setPreviewOrder(next);
          }
        }
      }
    },
    [tabElsRef],
  );

  const updateGhostPosition = useCallback(
    (clientX: number, clientY: number, session: Session) => {
      const ghost = ghostElRef.current;
      if (!ghost) return;
      ghost.style.display = "block";
      ghost.style.left = `${clientX - session.ghostOffsetX}px`;
      ghost.style.top = `${clientY - session.ghostOffsetY}px`;
    },
    [],
  );

  const onTabMainPointerDown = useCallback(
    (tab: DocumentTabItem, e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!canDragTab(tab) || e.button !== 0) return;

      const tabEl = tabElsRef.current.get(tab.id);
      if (!tabEl) return;

      const rect = tabEl.getBoundingClientRect();
      const pinGroup = Boolean(tab.pinned);
      const initialOrder = getReorderableIds(tabsRef.current, pinGroup);
      if (!initialOrder.includes(tab.id)) return;

      sessionRef.current = {
        tabId: tab.id,
        tab,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        pinGroup,
        ghostOffsetX: e.clientX - rect.left,
        ghostOffsetY: e.clientY - rect.top,
        width: rect.width,
        height: rect.height,
        initialOrder: [...initialOrder],
      };

      const onMove = (ev: PointerEvent) => {
        const session = sessionRef.current;
        if (!session || ev.pointerId !== session.pointerId) return;

        if (!session.active) {
          const dx = ev.clientX - session.startX;
          const dy = ev.clientY - session.startY;
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          session.active = true;
          suppressClickRef.current = true;
          const widths = captureFrozenWidths(tabElsRef.current);
          applyFrozenWidths(tabElsRef.current, widths);
          scrollRef.current?.classList.add("is-tab-dragging");
          previewOrderRef.current = [...session.initialOrder];
          setPreviewPinGroup(session.pinGroup);
          setPreviewOrder([...session.initialOrder]);
          setFrozenTabWidths(widths);
          setDragUi({
            isDragging: true,
            draggingId: session.tabId,
            ghost: {
              tab: session.tab,
              width: session.width,
              height: session.height,
            },
          });
          requestAnimationFrame(() => {
            updateGhostPosition(ev.clientX, ev.clientY, session);
          });
        }

        updateGhostPosition(ev.clientX, ev.clientY, session);
        tryAdjacentSwap(ev.clientX, session);

        const scroll = scrollRef.current;
        if (scroll) {
          const scrollRect = scroll.getBoundingClientRect();
          let delta = 0;
          if (ev.clientX < scrollRect.left + EDGE_SCROLL_PX) delta = -8;
          else if (ev.clientX > scrollRect.right - EDGE_SCROLL_PX) delta = 8;
          if (delta !== 0) {
            scroll.scrollBy({ left: delta, behavior: "auto" });
            tryAdjacentSwap(ev.clientX, session);
          }
        }
      };

      const onUp = (ev: PointerEvent) => {
        const session = sessionRef.current;
        if (!session || ev.pointerId !== session.pointerId) return;

        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);

        const wasActive = session.active;
        const finalOrder = previewOrderRef.current ?? session.initialOrder;
        const initial = session.initialOrder;
        const fromId = session.tabId;

        const orderChanged =
          wasActive &&
          (finalOrder.length !== initial.length ||
            finalOrder.some((id, i) => id !== initial[i]));

        let insertBeforeTabId: string | null = null;
        if (orderChanged) {
          const idx = finalOrder.indexOf(fromId);
          insertBeforeTabId =
            idx >= 0 && idx < finalOrder.length - 1
              ? finalOrder[idx + 1]!
              : null;
        }

        clearDrag();

        if (!orderChanged || !onTabReorderRef.current) return;
        onTabReorderRef.current(fromId, insertBeforeTabId);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [
      canDragTab,
      clearDrag,
      scrollRef,
      tabElsRef,
      tryAdjacentSwap,
      updateGhostPosition,
    ],
  );

  const consumeClickSuppression = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    dragUi,
    displayTabs,
    frozenTabWidths,
    ghostElRef,
    canDragTab,
    onTabMainPointerDown,
    consumeClickSuppression,
  };
}
