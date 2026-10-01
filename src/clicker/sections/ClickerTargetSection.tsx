import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Copy, Trash2 } from "lucide-react";
import type { ClickerEditor } from "../useClickerEditor";
import type { ClickPoint } from "../clickerTypes";
import { useT } from "../../i18n";
import { WheelNumberInput } from "../../ui/WheelNumberInput";
import { ClickerInfoTip } from "../ClickerInfoTip";

type Props = {
  editor: ClickerEditor;
};

type TargetMode = "cursor" | "fixed" | "sequence";

type DropEdge = { index: number; edge: "before" | "after" };

type DragGhost = {
  indexLabel: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

const DRAG_THRESHOLD_PX = 6;
const EDGE_HYSTERESIS_PX = 6;

const POINT_NUM = "action-cell-input action-cell-num";
const POINT_NUM_WIDE = "action-cell-input action-cell-num action-cell-num--wide";
/** Extra hit area past the last row so dropping at end is easy. */
const LIST_END_SLACK_PX = 64;
/** On the last row, "after" starts earlier (top 28% = before, rest = after). */
const LAST_ROW_AFTER_RATIO = 0.28;
const DEFAULT_JITTER_PX = 12;

function targetMode(e: ClickerEditor): TargetMode {
  if (e.pointsEnabled) return "sequence";
  if (e.targetFixed) return "fixed";
  return "cursor";
}

/** Keep selection attached to the moved point (or shift neighbors). */
function remapIndexAfterMove(
  selected: number | null,
  from: number,
  to: number,
): number | null {
  if (selected == null) return null;
  if (selected === from) return to;
  if (from < to) {
    if (selected > from && selected <= to) return selected - 1;
  } else if (selected >= to && selected < from) {
    return selected + 1;
  }
  return selected;
}

function insertIndexFromDrop(from: number, drop: DropEdge): number | null {
  let insert = drop.edge === "after" ? drop.index + 1 : drop.index;
  if (from < insert) insert -= 1;
  if (insert === from) return null;
  return insert;
}

function hitTestPointDrop(
  x: number,
  y: number,
  fromIndex: number,
  count: number,
  prev: DropEdge | null,
  listEl: HTMLElement | null,
): DropEdge | null {
  if (count === 0) return null;
  const lastIndex = count - 1;

  const el = document.elementFromPoint(x, y);
  let row =
    el instanceof Element
      ? (el.closest(
          ".caster-clicker-point-row[data-point-index]",
        ) as HTMLElement | null)
      : null;

  if (!row && listEl) {
    const lastRow = listEl.querySelector(
      `.caster-clicker-point-row[data-point-index="${lastIndex}"]`,
    ) as HTMLElement | null;
    if (lastRow) {
      const listRect = listEl.getBoundingClientRect();
      const lastRect = lastRow.getBoundingClientRect();
      const afterLine = lastRect.top + lastRect.height * LAST_ROW_AFTER_RATIO;
      const bottomLimit =
        Math.max(listRect.bottom, lastRect.bottom) + LIST_END_SLACK_PX;
      if (y >= afterLine && y <= bottomLimit && fromIndex !== lastIndex) {
        return { index: lastIndex, edge: "after" };
      }
      const firstRow = listEl.querySelector(
        `.caster-clicker-point-row[data-point-index="0"]`,
      ) as HTMLElement | null;
      if (firstRow && fromIndex !== 0) {
        const firstRect = firstRow.getBoundingClientRect();
        if (
          y >= listRect.top - LIST_END_SLACK_PX &&
          y < firstRect.top + firstRect.height * 0.5
        ) {
          return { index: 0, edge: "before" };
        }
      }
    }
    return null;
  }

  if (!(row instanceof HTMLElement)) return null;
  const raw = row.getAttribute("data-point-index");
  if (raw == null) return null;
  const index = Number(raw);
  if (!Number.isFinite(index) || index < 0 || index >= count) return null;
  if (index === fromIndex) return null;

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

export function ClickerTargetSection({ editor: e }: Props) {
  const t = useT();
  const mode = targetMode(e);
  const mouseOnly = e.inputKind === "mouse";
  const suppressCaptureClickRef = useRef(false);
  const jitterPx =
    e.points.length > 0
      ? Math.max(0, ...e.points.map((p) => p.radius ?? 0))
      : 0;
  const jitterOn = jitterPx > 0;
  const listRef = useRef<HTMLUListElement | null>(null);
  const pointsSectionRef = useRef<HTMLDivElement | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [drop, setDrop] = useState<DropEdge | null>(null);
  const [ghost, setGhost] = useState<DragGhost | null>(null);
  const sessionRef = useRef<{
    from: number;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const dropRef = useRef<DropEdge | null>(null);
  const suppressClickRef = useRef(false);
  const [multiIndices, setMultiIndices] = useState<Set<number>>(() => new Set());
  const multiAnchorRef = useRef<number | null>(null);

  useEffect(() => {
    setMultiIndices((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((i) => i >= 0 && i < e.points.length));
      return next.size === prev.size ? prev : next;
    });
  }, [e.points.length]);

  useEffect(() => {
    const clearIfOutside = (ev: PointerEvent) => {
      if (e.selectedPointIndex == null && multiIndices.size === 0) return;
      const root = pointsSectionRef.current;
      const target = ev.target;
      if (!(target instanceof Node) || !root) return;
      if (root.contains(target)) return;
      setMultiIndices(new Set());
      multiAnchorRef.current = null;
      e.setSelectedPointIndex(null);
    };
    document.addEventListener("pointerdown", clearIfOutside, true);
    return () =>
      document.removeEventListener("pointerdown", clearIfOutside, true);
  }, [e, e.selectedPointIndex, multiIndices.size]);

  const applyPointsBatch = useCallback(
    (labelKey: string, next: ClickPoint[]) => {
      e.pushHistory(labelKey);
      e.setPoints(next);
    },
    [e],
  );

  const selectPointRow = useCallback(
    (index: number, ev: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
      const mod = ev.ctrlKey || ev.metaKey;
      if (ev.shiftKey && multiAnchorRef.current != null) {
        const a = multiAnchorRef.current;
        const lo = Math.min(a, index);
        const hi = Math.max(a, index);
        const next = new Set<number>();
        for (let i = lo; i <= hi; i++) next.add(i);
        setMultiIndices(next);
        e.setSelectedPointIndex(index);
        return;
      }
      if (mod) {
        setMultiIndices((prev) => {
          const next = new Set(prev);
          if (next.has(index)) next.delete(index);
          else next.add(index);
          return next;
        });
        multiAnchorRef.current = index;
        e.setSelectedPointIndex(index);
        return;
      }
      multiAnchorRef.current = index;
      setMultiIndices(new Set([index]));
      e.setSelectedPointIndex(index);
    },
    [e],
  );

  const clearDrag = useCallback(() => {
    sessionRef.current = null;
    dropRef.current = null;
    setDragFrom(null);
    setDrop(null);
    setGhost(null);
    document.body.classList.remove("action-list-is-dragging");
  }, []);

  const onRowPointerDown = useCallback(
    (index: number, ev: React.PointerEvent) => {
      if (e.editDisabled || ev.button !== 0) return;
      const target = ev.target as HTMLElement;
      if (
        target.closest(
          "input, button, label.caster-clicker-point-coord, label.caster-clicker-point-mini, .caster-clicker-point-remove",
        )
      ) {
        return;
      }

      sessionRef.current = {
        from: index,
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        active: false,
      };

      const onMove = (moveEv: PointerEvent) => {
        const session = sessionRef.current;
        if (!session || moveEv.pointerId !== session.pointerId) return;
        const dx = moveEv.clientX - session.startX;
        const dy = moveEv.clientY - session.startY;
        if (!session.active) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          session.active = true;
          suppressClickRef.current = true;
          setDragFrom(session.from);
          document.body.classList.add("action-list-is-dragging");
          const rowEl = listRef.current?.querySelector(
            `.caster-clicker-point-row[data-point-index="${session.from}"]`,
          ) as HTMLElement | null;
          const pt = e.points[session.from];
          if (rowEl && pt) {
            const rect = rowEl.getBoundingClientRect();
            setGhost({
              indexLabel: String(session.from + 1),
              title: `${pt.x}, ${pt.y}`,
              x: moveEv.clientX,
              y: moveEv.clientY,
              width: rect.width,
              height: Math.min(rect.height, 40),
              offsetX: moveEv.clientX - rect.left,
              offsetY: moveEv.clientY - rect.top,
            });
          }
        } else {
          setGhost((g) =>
            g ? { ...g, x: moveEv.clientX, y: moveEv.clientY } : g,
          );
        }
        const next = hitTestPointDrop(
          moveEv.clientX,
          moveEv.clientY,
          session.from,
          e.points.length,
          dropRef.current,
          listRef.current,
        );
        dropRef.current = next;
        setDrop(next);
      };

      const onUp = (upEv: PointerEvent) => {
        const session = sessionRef.current;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (!session || upEv.pointerId !== session.pointerId) {
          clearDrag();
          return;
        }
        if (session.active) {
          const hit =
            hitTestPointDrop(
              upEv.clientX,
              upEv.clientY,
              session.from,
              e.points.length,
              dropRef.current,
              listRef.current,
            ) ?? dropRef.current;
          if (hit) {
            const to = insertIndexFromDrop(session.from, hit);
            if (to != null) {
              const from = session.from;
              e.setPoints((prev) => {
                const next = [...prev];
                const [moved] = next.splice(from, 1);
                if (!moved) return prev;
                next.splice(to, 0, moved);
                return next;
              });
              e.setSelectedPointIndex((cur) =>
                remapIndexAfterMove(cur, from, to),
              );
            }
          }
        }
        clearDrag();
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [clearDrag, e],
  );

  const setMode = (next: TargetMode) => {
    if (next === "cursor") {
      e.setPointsEnabled(false);
      e.setTargetFixed(false);
    } else if (next === "fixed") {
      e.setPointsEnabled(false);
      e.setTargetFixed(true);
    } else {
      e.setPointsEnabled(true);
    }
  };

  return (
    <div className="caster-clicker-section caster-clicker-target-panel caster-clicker-zones-panel">
      {e.capturingPoints && typeof document !== "undefined"
        ? createPortal(
            <div className="caster-pixel-pick-banner" role="status">
              <strong>
                {mode === "fixed"
                  ? t("clicker.target.captureBannerFixedTitle")
                  : t("clicker.target.captureBannerSequenceTitle", {
                      n: e.capturedCount,
                    })}
              </strong>
              <span>
                {mode === "fixed"
                  ? t("clicker.target.captureBannerFixedHint")
                  : t("clicker.target.captureScreenHint", {
                      n: e.capturedCount,
                    })}
              </span>
              <button
                type="button"
                className="caster-btn caster-btn-ghost caster-btn-sm"
                onPointerDown={(ev) => {
                  if (ev.button !== 0) return;
                  ev.preventDefault();
                  suppressCaptureClickRef.current = true;
                  void e.onTogglePointCapture();
                }}
                onClick={() => {
                  if (suppressCaptureClickRef.current) {
                    suppressCaptureClickRef.current = false;
                    return;
                  }
                  void e.onTogglePointCapture();
                }}
              >
                {mode === "fixed"
                  ? t("clicker.limits.pickCancelBtn")
                  : t("clicker.target.captureStop", { n: e.capturedCount })}
              </button>
            </div>,
            document.body,
          )
        : null}
      <div className="caster-settings-row-label-with-info caster-clicker-target-mode-head">
        <span>{t("clicker.target.modeAria")}</span>
        <ClickerInfoTip text={t("clicker.target.priorityHint")} />
      </div>

      <div
        className="caster-segmented caster-segmented--wide caster-clicker-target-modes"
        role="group"
        aria-label={t("clicker.target.modeAria")}
      >
        {(
          [
            ["cursor", t("clicker.segments.cursor")],
            ["fixed", t("clicker.segments.fixed")],
            ["sequence", t("clicker.segments.pointSequence")],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={["caster-segmented-btn", mode === value ? "active" : ""]
              .filter(Boolean)
              .join(" ")}
            disabled={
              e.editDisabled ||
              (value !== "sequence" && !mouseOnly) ||
              (value === "fixed" && !mouseOnly)
            }
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "cursor" ? (
        <div className="caster-settings-row-label-with-info caster-clicker-target-mode-head">
          <span>{t("clicker.segments.cursor")}</span>
          <ClickerInfoTip text={t("clicker.target.cursorFollowHint")} />
        </div>
      ) : null}

      {mode === "fixed" ? (
        <>
          <div className="caster-settings-row">
            <div className="caster-settings-row-label">
              <span className="caster-settings-row-label-with-info">
                <span>{t("clicker.target.pickOnScreen")}</span>
                <ClickerInfoTip text={t("clicker.target.pickDelay")} />
              </span>
            </div>
            <div className="caster-settings-row-control">
              <button
                type="button"
                className={[
                  "caster-btn",
                  e.capturingPoints ? "caster-btn-danger-ghost" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={e.editDisabled || !mouseOnly}
                onPointerDown={(ev) => {
                  if (ev.button !== 0 || !e.capturingPoints) return;
                  ev.preventDefault();
                  suppressCaptureClickRef.current = true;
                  void e.onTogglePointCapture();
                }}
                onClick={() => {
                  if (suppressCaptureClickRef.current) {
                    suppressCaptureClickRef.current = false;
                    return;
                  }
                  if (e.capturingPoints) return;
                  void e.onTogglePointCapture();
                }}
              >
                {e.capturingPoints
                  ? t("clicker.target.placeCursor")
                  : t("clicker.target.pickOnScreen")}
              </button>
            </div>
          </div>
          <div className="caster-settings-row">
            <div className="caster-settings-row-label">
              <span className="caster-settings-row-label-with-info">
                <span>{t("clicker.target.coordinates")}</span>
                <ClickerInfoTip text={t("clicker.target.previewFixedHint")} />
              </span>
            </div>
            <div className="caster-settings-row-control caster-clicker-point-coords">
              <label className="caster-clicker-point-coord">
                <span className="sr-only">X</span>
                <WheelNumberInput
                  className={POINT_NUM}
                  value={e.targetX}
                  disabled={e.editDisabled}
                  onValueChange={(n) => e.setTargetX(n)}
                />
              </label>
              <label className="caster-clicker-point-coord">
                <span className="sr-only">Y</span>
                <WheelNumberInput
                  className={POINT_NUM}
                  value={e.targetY}
                  disabled={e.editDisabled}
                  onValueChange={(n) => e.setTargetY(n)}
                />
              </label>
            </div>
          </div>
        </>
      ) : null}

      {mode === "sequence" ? (
        <>
          <div className="caster-settings-row">
            <div className="caster-settings-row-label">
              <span className="caster-settings-row-label-with-info">
                <span>{t("clicker.target.capture")}</span>
                <ClickerInfoTip text={t("clicker.target.captureHint")} />
              </span>
            </div>
            <div className="caster-settings-row-control">
              <button
                type="button"
                className={[
                  "caster-btn",
                  e.capturingPoints ? "caster-btn-danger-ghost" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={e.editDisabled || !mouseOnly}
                onPointerDown={(ev) => {
                  if (ev.button !== 0 || !e.capturingPoints) return;
                  ev.preventDefault();
                  suppressCaptureClickRef.current = true;
                  void e.onTogglePointCapture();
                }}
                onClick={() => {
                  if (suppressCaptureClickRef.current) {
                    suppressCaptureClickRef.current = false;
                    return;
                  }
                  if (e.capturingPoints) return;
                  void e.onTogglePointCapture();
                }}
              >
                {e.capturingPoints
                  ? t("clicker.target.captureStop", { n: e.capturedCount })
                  : t("clicker.target.captureStart")}
              </button>
            </div>
          </div>

          <div className="caster-settings-row">
            <div className="caster-settings-row-label">
              <span className="caster-settings-row-label-with-info">
                <span>{t("clicker.target.stopWhenComplete")}</span>
                <ClickerInfoTip text={t("clicker.target.stopWhenCompleteHint")} />
              </span>
            </div>
            <div className="caster-settings-row-control">
              <input
                type="checkbox"
                checked={e.stopWhenComplete}
                disabled={e.editDisabled}
                onChange={(ev) => e.setStopWhenComplete(ev.target.checked)}
              />
            </div>
          </div>

          {e.points.length > 0 ? (
            <div className="caster-settings-row">
              <div className="caster-settings-row-label">
                <span className="caster-settings-row-label-with-info">
                  <span>{t("clicker.scenario.jitterLabel")}</span>
                  <ClickerInfoTip text={t("clicker.scenario.jitterHint")} />
                </span>
              </div>
              <div className="caster-settings-row-control caster-clicker-jitter-ctrl">
                <input
                  type="checkbox"
                  checked={jitterOn}
                  disabled={e.editDisabled}
                  aria-label={t("clicker.scenario.jitterLabel")}
                  onChange={(ev) => {
                    const on = ev.target.checked;
                    const next = on ? Math.max(DEFAULT_JITTER_PX, jitterPx) : 0;
                    e.setPoints((prev) =>
                      prev.map((p) => ({ ...p, radius: next })),
                    );
                  }}
                />
                {jitterOn ? (
                  <label className="caster-clicker-point-mini">
                    <span>±</span>
                    <WheelNumberInput
                      className={POINT_NUM}
                      min={1}
                      max={500}
                      value={jitterPx}
                      disabled={e.editDisabled}
                      onValueChange={(n) => {
                        const next = Math.max(1, n || DEFAULT_JITTER_PX);
                        e.setPoints((prev) =>
                          prev.map((p) => ({ ...p, radius: next })),
                        );
                      }}
                    />
                    <span>px</span>
                  </label>
                ) : null}
              </div>
            </div>
          ) : null}

          <div ref={pointsSectionRef} className="caster-clicker-points-section">
          <div className="caster-clicker-points-head">
            <span className="caster-clicker-points-title">
              {t("clicker.target.points")}
            </span>
            <button
              type="button"
              className="caster-btn caster-btn-ghost"
              disabled={e.editDisabled}
              onClick={() => {
                e.setPoints((prev) => [
                  ...prev,
                  { x: 0, y: 0, clicks: 1, radius: 0, pauseAfterMs: 0 },
                ]);
                e.setSelectedPointIndex(e.points.length);
              }}
            >
              {t("clicker.target.addPoint")}
            </button>
          </div>

          {e.points.length === 0 ? (
            <p className="caster-clicker-hint">{t("clicker.target.emptyPoints")}</p>
          ) : (
            <ul ref={listRef} className="caster-clicker-points-list">
              {e.points.map((pt, i) => (
                <li
                  key={i}
                  data-point-index={i}
                  className={[
                    "caster-clicker-point-row",
                    e.selectedPointIndex === i || multiIndices.has(i)
                      ? "selected"
                      : "",
                    multiIndices.has(i) && multiIndices.size > 1
                      ? "is-multi-selected"
                      : "",
                    dragFrom === i ? "is-drag-source" : "",
                    drop?.index === i && drop.edge === "before"
                      ? "drop-before"
                      : "",
                    drop?.index === i && drop.edge === "after"
                      ? "drop-after"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onPointerDown={(ev) => onRowPointerDown(i, ev)}
                  onClick={(ev) => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    selectPointRow(i, ev);
                  }}
                >
                  <div className="caster-clicker-point-main">
                  <span className="caster-clicker-point-ord" aria-hidden>
                    {i + 1}
                  </span>
                  <label className="caster-clicker-point-coord">
                    <span className="sr-only">X</span>
                    <WheelNumberInput
                      className={POINT_NUM}
                      value={pt.x}
                      disabled={e.editDisabled}
                      onValueChange={(n) =>
                        e.setPoints((prev) =>
                          prev.map((p, j) =>
                            j === i ? { ...p, x: n } : p,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="caster-clicker-point-coord">
                    <span className="sr-only">Y</span>
                    <WheelNumberInput
                      className={POINT_NUM}
                      value={pt.y}
                      disabled={e.editDisabled}
                      onValueChange={(n) =>
                        e.setPoints((prev) =>
                          prev.map((p, j) =>
                            j === i ? { ...p, y: n } : p,
                          ),
                        )
                      }
                    />
                  </label>
                  <label
                    className="caster-clicker-point-mini"
                    title={t("clicker.target.clicksOnPoint")}
                  >
                    <span>×</span>
                    <WheelNumberInput
                      className={POINT_NUM_WIDE}
                      min={1}
                      max={9999}
                      value={pt.clicks}
                      disabled={e.editDisabled}
                      onValueChange={(n) =>
                        e.setPoints((prev) =>
                          prev.map((p, j) =>
                            j === i
                              ? {
                                  ...p,
                                  clicks: Math.max(1, n || 1),
                                }
                              : p,
                          ),
                        )
                      }
                    />
                  </label>
                  <label
                    className="caster-clicker-point-mini"
                    title={t("clicker.target.randomRadius")}
                  >
                    <span>R</span>
                    <WheelNumberInput
                      className={POINT_NUM}
                      min={0}
                      max={500}
                      value={pt.radius}
                      disabled={e.editDisabled}
                      onValueChange={(n) =>
                        e.setPoints((prev) =>
                          prev.map((p, j) =>
                            j === i
                              ? {
                                  ...p,
                                  radius: Math.max(0, n || 0),
                                }
                              : p,
                          ),
                        )
                      }
                    />
                  </label>
                  <label
                    className="caster-clicker-point-mini"
                    title={t("clicker.target.pauseAfterMs")}
                  >
                    <span>{t("clicker.target.pauseAfterMsUnit")}</span>
                    <WheelNumberInput
                      className={POINT_NUM_WIDE}
                      min={0}
                      max={600_000}
                      value={pt.pauseAfterMs ?? 0}
                      disabled={e.editDisabled}
                      onValueChange={(n) =>
                        e.setPoints((prev) =>
                          prev.map((p, j) =>
                            j === i
                              ? {
                                  ...p,
                                  pauseAfterMs: Math.max(0, n || 0),
                                }
                              : p,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="caster-btn caster-btn-ghost caster-clicker-point-remove"
                    disabled={e.editDisabled}
                    aria-label={t("clicker.target.removePoint")}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      e.setPoints((prev) => prev.filter((_, j) => j !== i));
                      e.setSelectedPointIndex((cur) =>
                        cur == null
                          ? null
                          : cur === i
                            ? null
                            : cur > i
                              ? cur - 1
                              : cur,
                      );
                    }}
                  >
                    ✕
                  </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!e.editDisabled && multiIndices.size > 1 ? (
            <div
              className="caster-clicker-points-bulk"
              role="toolbar"
              aria-label={t("clicker.target.bulkAria")}
            >
              <span className="caster-clicker-points-bulk-count">
                {t("clicker.target.bulkSelected", { n: multiIndices.size })}
              </span>
              <button
                type="button"
                className="caster-btn caster-btn-ghost"
                onClick={() => {
                  const idxs = [...multiIndices].sort((a, b) => a - b);
                  if (idxs[0] === 0) return;
                  const next = [...e.points];
                  for (const i of idxs) {
                    if (i <= 0) continue;
                    const tmp = next[i - 1]!;
                    next[i - 1] = next[i]!;
                    next[i] = tmp;
                  }
                  applyPointsBatch("clicker.history.pointsReordered", next);
                  setMultiIndices(new Set(idxs.map((i) => i - 1)));
                }}
              >
                <ArrowUp size={14} aria-hidden />
                {t("clicker.target.bulkMoveUp")}
              </button>
              <button
                type="button"
                className="caster-btn caster-btn-ghost"
                onClick={() => {
                  const idxs = [...multiIndices].sort((a, b) => b - a);
                  if (idxs[0] === e.points.length - 1) return;
                  const next = [...e.points];
                  for (const i of idxs) {
                    if (i >= next.length - 1) continue;
                    const tmp = next[i + 1]!;
                    next[i + 1] = next[i]!;
                    next[i] = tmp;
                  }
                  applyPointsBatch("clicker.history.pointsReordered", next);
                  setMultiIndices(
                    new Set(
                      [...multiIndices]
                        .map((i) => i + 1)
                        .filter((i) => i < e.points.length),
                    ),
                  );
                }}
              >
                <ArrowDown size={14} aria-hidden />
                {t("clicker.target.bulkMoveDown")}
              </button>
              <button
                type="button"
                className="caster-btn caster-btn-ghost"
                onClick={() => {
                  const idxs = [...multiIndices].sort((a, b) => a - b);
                  const copies = idxs.map((i) => ({ ...e.points[i]! }));
                  const next = [...e.points];
                  let insertAt = (idxs[idxs.length - 1] ?? 0) + 1;
                  for (const c of copies) {
                    next.splice(insertAt, 0, c);
                    insertAt += 1;
                  }
                  applyPointsBatch("clicker.history.pointsDuplicated", next);
                  const newSel = new Set<number>();
                  for (let k = 0; k < copies.length; k++) {
                    newSel.add((idxs[idxs.length - 1] ?? 0) + 1 + k);
                  }
                  setMultiIndices(newSel);
                  e.setSelectedPointIndex([...newSel][0] ?? null);
                }}
              >
                <Copy size={14} aria-hidden />
                {t("clicker.target.bulkDuplicate")}
              </button>
              <button
                type="button"
                className="caster-btn caster-btn-danger-ghost"
                onClick={() => {
                  const remove = multiIndices;
                  applyPointsBatch(
                    "clicker.history.pointsDeleted",
                    e.points.filter((_, i) => !remove.has(i)),
                  );
                  setMultiIndices(new Set());
                  e.setSelectedPointIndex(null);
                }}
              >
                <Trash2 size={14} aria-hidden />
                {t("clicker.target.bulkDelete")}
              </button>
              <button
                type="button"
                className="caster-btn caster-btn-ghost"
                onClick={() => {
                  setMultiIndices(new Set());
                  e.setSelectedPointIndex(null);
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          ) : null}
          </div>

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
        </>
      ) : null}
    </div>
  );
}
