import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ClickerEditor } from "../useClickerEditor";
import { useT } from "../../i18n";
import { WheelNumberInput } from "../../ui/WheelNumberInput";

type Props = { editor: ClickerEditor };

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
  const listRef = useRef<HTMLUListElement | null>(null);
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
      <p className="caster-clicker-hint">{t("clicker.target.priorityHint")}</p>

      <div className="caster-settings-row">
        <div className="caster-settings-row-label">
          <span>{t("clicker.target.capture")}</span>
          <p>{t("clicker.target.captureHint")}</p>
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
              void e.onTogglePointCapture();
            }}
            onClick={() => {
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

      {mode === "fixed" ? (
        <div className="caster-settings-row">
          <div className="caster-settings-row-label">
            <span>{t("clicker.target.coordinates")}</span>
            <p>{t("clicker.target.previewFixedHint")}</p>
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
      ) : null}

      {mode === "sequence" ? (
        <>
          <div className="caster-settings-row">
            <div className="caster-settings-row-label">
              <span>{t("clicker.target.stopWhenComplete")}</span>
              <p>{t("clicker.target.stopWhenCompleteHint")}</p>
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
                  { x: 0, y: 0, clicks: 1, radius: 0 },
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
                    e.selectedPointIndex === i ? "selected" : "",
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
                  onClick={() => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    e.setSelectedPointIndex(i);
                  }}
                >
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
                </li>
              ))}
            </ul>
          )}

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
