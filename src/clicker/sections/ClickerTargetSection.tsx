import type { ClickerEditor } from "../useClickerEditor";
import { useT } from "../../i18n";
import { TargetMiniMap } from "../TargetMiniMap";

type Props = { editor: ClickerEditor };

type TargetMode = "cursor" | "fixed" | "sequence";

function targetMode(e: ClickerEditor): TargetMode {
  if (e.pointsEnabled) return "sequence";
  if (e.targetFixed) return "fixed";
  return "cursor";
}

export function ClickerTargetSection({ editor: e }: Props) {
  const t = useT();
  const mode = targetMode(e);
  const mouseOnly = e.inputKind === "mouse";

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
    <div className="caster-clicker-section caster-clicker-target-panel">
      <p className="caster-clicker-hint">{t("clicker.target.priorityHint")}</p>

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
            <p>{t("clicker.target.pickDelay")}</p>
          </div>
          <div className="caster-settings-row-control">
            <button
              type="button"
              className="caster-btn"
              disabled={e.running || e.picking}
              onClick={() => void e.onPick()}
            >
              {e.picking && e.pickingPointIndex == null
                ? t("clicker.target.placeCursor")
                : `${e.targetX}, ${e.targetY}`}
            </button>
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
              onClick={() =>
                e.setPoints((prev) => [
                  ...prev,
                  { x: 0, y: 0, clicks: 1, radius: 0 },
                ])
              }
            >
              {t("clicker.target.addPoint")}
            </button>
          </div>

          {e.points.length === 0 ? (
            <p className="caster-clicker-hint">{t("clicker.target.emptyPoints")}</p>
          ) : (
            <ul className="caster-clicker-points-list">
              {e.points.map((pt, i) => (
                <li key={i} className="caster-clicker-point-row">
                  <button
                    type="button"
                    className="caster-btn caster-btn-ghost caster-clicker-point-pick"
                    disabled={e.running || e.picking || e.editDisabled}
                    title={t("clicker.target.pickOnScreen")}
                    onClick={() => void e.onPickPoint(i)}
                  >
                    {e.picking && e.pickingPointIndex === i ? "…" : "Pick"}
                  </button>
                  <label className="caster-clicker-point-coord">
                    <span className="sr-only">X</span>
                    <input
                      type="number"
                      value={pt.x}
                      disabled={e.editDisabled}
                      onChange={(ev) =>
                        e.setPoints((prev) =>
                          prev.map((p, j) =>
                            j === i ? { ...p, x: Number(ev.target.value) } : p,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="caster-clicker-point-coord">
                    <span className="sr-only">Y</span>
                    <input
                      type="number"
                      value={pt.y}
                      disabled={e.editDisabled}
                      onChange={(ev) =>
                        e.setPoints((prev) =>
                          prev.map((p, j) =>
                            j === i ? { ...p, y: Number(ev.target.value) } : p,
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
                    <input
                      type="number"
                      min={1}
                      max={9999}
                      value={pt.clicks}
                      disabled={e.editDisabled}
                      onChange={(ev) =>
                        e.setPoints((prev) =>
                          prev.map((p, j) =>
                            j === i
                              ? {
                                  ...p,
                                  clicks: Math.max(
                                    1,
                                    Number(ev.target.value) || 1,
                                  ),
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
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={pt.radius}
                      disabled={e.editDisabled}
                      onChange={(ev) =>
                        e.setPoints((prev) =>
                          prev.map((p, j) =>
                            j === i
                              ? {
                                  ...p,
                                  radius: Math.max(
                                    0,
                                    Number(ev.target.value) || 0,
                                  ),
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
                    onClick={() =>
                      e.setPoints((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      <TargetMiniMap
        geom={e.screenGeom}
        mode={mode}
        fixed={mode === "fixed" ? { x: e.targetX, y: e.targetY } : null}
        points={mode === "sequence" ? e.points : []}
      />
    </div>
  );
}
