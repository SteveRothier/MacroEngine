import {
  useLayoutEffect,
  useRef,
  type MutableRefObject,
  type RefObject,
} from "react";

const LAYOUT_ANIM_DURATION_MS = 200;
const WIDTH_EPSILON_PX = 0.5;
const STRIP_GAP_PX = 4;
const FALLBACK_TAB_MIN_W = 36;
const FALLBACK_TAB_MAX_W = 180;

type TabStripTokens = { minW: number; maxW: number };

function readTabStripTokens(scrollEl: HTMLElement): TabStripTokens {
  const style = getComputedStyle(scrollEl);
  const minW = parseFloat(style.getPropertyValue("--v2-tab-abs-min-w"));
  const maxW = parseFloat(style.getPropertyValue("--v2-tab-max-w"));
  return {
    minW: Number.isFinite(minW) && minW > 0 ? minW : FALLBACK_TAB_MIN_W,
    maxW: Number.isFinite(maxW) && maxW > 0 ? maxW : FALLBACK_TAB_MAX_W,
  };
}

function captureWidths(
  tabIds: string[],
  tabEls: Map<string, HTMLDivElement>,
): Map<string, number> {
  const widths = new Map<string, number>();
  for (const id of tabIds) {
    const el = tabEls.get(id);
    if (!el) continue;
    widths.set(id, el.getBoundingClientRect().width);
  }
  return widths;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function clampTabWidth(width: number, tokens: TabStripTokens): number {
  return Math.min(tokens.maxW, Math.max(tokens.minW, width));
}

function computeTargetTabWidth(
  scrollEl: HTMLElement,
  addBtnEl: HTMLElement | null,
  tabCount: number,
  tokens: TabStripTokens,
): number {
  if (tabCount <= 0) return tokens.maxW;
  const addW = addBtnEl?.offsetWidth ?? tokens.minW;
  const gapTotal = tabCount * STRIP_GAP_PX;
  const available = scrollEl.clientWidth - addW - gapTotal;
  return clampTabWidth(available / tabCount, tokens);
}

function setLockedWidth(el: HTMLDivElement, width: number): void {
  const px = `${width}px`;
  el.style.flex = "none";
  el.style.width = px;
  el.style.minWidth = width <= 0 ? "0px" : px;
  el.style.maxWidth = px;
}

function clearLockedWidth(el: HTMLDivElement): void {
  el.style.flex = "";
  el.style.width = "";
  el.style.minWidth = "";
  el.style.maxWidth = "";
  el.classList.remove("v2-doc-tab--width-animating");
}

type AnimJob = { el: HTMLDivElement; from: number; to: number };

let batchRafId = 0;
let cancelBatch: (() => void) | null = null;

function runBatchAnimation(jobs: AnimJob[], onAllDone: () => void): void {
  cancelBatch?.();

  for (const { el, from } of jobs) {
    el.classList.add("v2-doc-tab--width-animating");
    setLockedWidth(el, from);
  }

  const start = performance.now();

  const finish = () => {
    for (const { el, to } of jobs) {
      setLockedWidth(el, to);
    }
    batchRafId = requestAnimationFrame(() => {
      for (const { el } of jobs) {
        clearLockedWidth(el);
      }
      cancelBatch = null;
      batchRafId = 0;
      onAllDone();
    });
  };

  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / LAYOUT_ANIM_DURATION_MS);
    const t = easeOutCubic(progress);
    for (const { el, from, to } of jobs) {
      setLockedWidth(el, from + (to - from) * t);
    }
    if (progress < 1) {
      batchRafId = requestAnimationFrame(tick);
      return;
    }
    finish();
  };

  cancelBatch = () => {
    if (batchRafId) cancelAnimationFrame(batchRafId);
    batchRafId = 0;
    for (const { el } of jobs) {
      clearLockedWidth(el);
    }
    cancelBatch = null;
  };

  batchRafId = requestAnimationFrame(tick);
}

export function useTabStripLayoutAnimation({
  tabIds,
  tabElsRef,
  scrollRef,
  addBtnRef,
  enabled = true,
  onAnimationEnd,
}: {
  tabIds: string[];
  tabElsRef: MutableRefObject<Map<string, HTMLDivElement>>;
  scrollRef: RefObject<HTMLDivElement | null>;
  addBtnRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  onAnimationEnd?: () => void;
}) {
  const snapshotRef = useRef<Map<string, number>>(new Map());
  const prevCountRef = useRef(0);
  const isLayoutAnimatingRef = useRef(false);
  const onAnimationEndRef = useRef(onAnimationEnd);
  onAnimationEndRef.current = onAnimationEnd;

  const setAnimating = (active: boolean) => {
    isLayoutAnimatingRef.current = active;
    scrollRef.current?.classList.toggle("is-layout-animating", active);
  };

  useLayoutEffect(() => {
    const tabEls = tabElsRef.current;
    const prevSnapshot = snapshotRef.current;
    const scrollEl = scrollRef.current;

    if (!enabled) {
      snapshotRef.current = captureWidths(tabIds, tabEls);
      prevCountRef.current = tabIds.length;
      return;
    }

    if (prevSnapshot.size === 0 || !scrollEl) {
      snapshotRef.current = captureWidths(tabIds, tabEls);
      prevCountRef.current = tabIds.length;
      return;
    }

    const countDelta = tabIds.length - prevCountRef.current;
    if (countDelta === 0) {
      snapshotRef.current = captureWidths(tabIds, tabEls);
      return;
    }

    const tokens = readTabStripTokens(scrollEl);
    const targetWidth = computeTargetTabWidth(
      scrollEl,
      addBtnRef.current,
      tabIds.length,
      tokens,
    );

    const prevIds = new Set(prevSnapshot.keys());
    const isClosing = countDelta < 0;
    const jobs: AnimJob[] = [];

    for (const id of tabIds) {
      const el = tabEls.get(id);
      if (!el) continue;

      if (!prevIds.has(id)) {
        jobs.push({ el, from: 0, to: targetWidth });
        continue;
      }

      const oldWidth = prevSnapshot.get(id);
      if (oldWidth == null) continue;

      const widthDelta = Math.abs(oldWidth - targetWidth);
      if (widthDelta <= WIDTH_EPSILON_PX && !isClosing) continue;

      jobs.push({ el, from: oldWidth, to: targetWidth });
    }

    if (jobs.length === 0) {
      snapshotRef.current = captureWidths(tabIds, tabEls);
      prevCountRef.current = tabIds.length;
      return;
    }

    setAnimating(true);

    runBatchAnimation(jobs, () => {
      setAnimating(false);
      snapshotRef.current = captureWidths(tabIds, tabElsRef.current);
      prevCountRef.current = tabIds.length;
      onAnimationEndRef.current?.();
    });
  }, [tabIds, tabElsRef, scrollRef, addBtnRef, enabled]);

  return { isLayoutAnimatingRef };
}
