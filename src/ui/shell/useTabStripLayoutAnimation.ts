import {
  useLayoutEffect,
  useRef,
  type MutableRefObject,
  type RefObject,
} from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const LAYOUT_ANIM_DURATION_MS = 180;
const WIDTH_EPSILON_PX = 0.75;

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

function setLockedWidth(el: HTMLDivElement, width: number): void {
  const px = `${Math.max(0, width)}px`;
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
  el.classList.remove("caster-doc-tab--width-animating");
}

type AnimJob = { el: HTMLDivElement; from: number; to: number };

let batchRafId = 0;
let cancelBatch: (() => void) | null = null;

function runBatchAnimation(jobs: AnimJob[], onAllDone: () => void): void {
  cancelBatch?.();

  for (const { el, from } of jobs) {
    el.classList.add("caster-doc-tab--width-animating");
    setLockedWidth(el, from);
  }

  const start = performance.now();

  const finish = () => {
    // Leave flex unlocked at the measured end — no second layout snap.
    for (const { el } of jobs) {
      clearLockedWidth(el);
    }
    cancelBatch = null;
    batchRafId = 0;
    onAllDone();
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

/**
 * FLIP width animation on tab add/remove:
 * measure natural flex widths after commit, lock to previous widths, animate to measured.
 * Avoids bounce from formula targets that disagree with flex.
 */
export function useTabStripLayoutAnimation({
  tabIds,
  tabElsRef,
  scrollRef,
  addBtnRef: _addBtnRef,
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
  const reducedMotion = usePrefersReducedMotion();
  const animEnabled = enabled && !reducedMotion;
  const snapshotRef = useRef<Map<string, number>>(new Map());
  const prevIdsRef = useRef<string[]>([]);
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
    const prevIds = prevIdsRef.current;
    const scrollEl = scrollRef.current;

    if (!animEnabled) {
      cancelBatch?.();
      setAnimating(false);
      snapshotRef.current = captureWidths(tabIds, tabEls);
      prevIdsRef.current = tabIds.slice();
      return;
    }

    if (prevSnapshot.size === 0 || !scrollEl) {
      snapshotRef.current = captureWidths(tabIds, tabEls);
      prevIdsRef.current = tabIds.slice();
      return;
    }

    const sameSet =
      prevIds.length === tabIds.length &&
      prevIds.every((id, i) => id === tabIds[i]);
    if (sameSet) {
      // Labels/chrome may change width; keep snapshot fresh, no anim.
      if (!isLayoutAnimatingRef.current) {
        snapshotRef.current = captureWidths(tabIds, tabEls);
      }
      return;
    }

    const countDelta = tabIds.length - prevIds.length;
    // Reorder only: skip width anim.
    if (countDelta === 0) {
      snapshotRef.current = captureWidths(tabIds, tabEls);
      prevIdsRef.current = tabIds.slice();
      return;
    }

    // Drop any in-flight locks so we measure true flex targets.
    cancelBatch?.();
    setAnimating(false);
    for (const id of tabIds) {
      const el = tabEls.get(id);
      if (el) clearLockedWidth(el);
    }

    // Natural flex widths after React commit (targets).
    const nextWidths = captureWidths(tabIds, tabEls);
    const prevIdSet = new Set(prevIds);
    const jobs: AnimJob[] = [];

    for (const id of tabIds) {
      const el = tabEls.get(id);
      if (!el) continue;
      const to = nextWidths.get(id) ?? 0;

      if (!prevIdSet.has(id)) {
        jobs.push({ el, from: 0, to });
        continue;
      }

      const from = prevSnapshot.get(id) ?? to;
      if (Math.abs(from - to) <= WIDTH_EPSILON_PX) continue;
      jobs.push({ el, from, to });
    }

    if (jobs.length === 0) {
      snapshotRef.current = nextWidths;
      prevIdsRef.current = tabIds.slice();
      return;
    }

    // Treat current ids as committed so re-renders with the same set don't restart.
    prevIdsRef.current = tabIds.slice();

    // Lock to start widths before paint so first frame isn't the flex snap.
    for (const { el, from } of jobs) {
      el.classList.add("caster-doc-tab--width-animating");
      setLockedWidth(el, from);
    }

    setAnimating(true);

    runBatchAnimation(jobs, () => {
      setAnimating(false);
      snapshotRef.current = captureWidths(tabIds, tabElsRef.current);
      onAnimationEndRef.current?.();
    });
  }, [tabIds, tabElsRef, scrollRef, animEnabled]);

  return { isLayoutAnimatingRef };
}
