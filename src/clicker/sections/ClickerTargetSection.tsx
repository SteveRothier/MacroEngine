import type { ClickerEditor } from "../useClickerEditor";
import { TargetMiniMap } from "../TargetMiniMap";

type Props = { editor: ClickerEditor };

type TargetMode = "cursor" | "fixed" | "sequence";

function targetMode(e: ClickerEditor): TargetMode {
  if (e.pointsEnabled) return "sequence";
  if (e.targetFixed) return "fixed";
  return "cursor";
}

export function ClickerTargetSection({ editor: e }: Props) {
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
    <div className="v2-clicker-section v2-clicker-target-panel">
      <p className="v2-clicker-hint">
        Priorité : séquence de points → zones clic → point fixe / curseur.
      </p>

      <div className="v2-segmented v2-segmented--wide v2-clicker-target-modes" role="group" aria-label="Mode cible">
        {(
          [
            ["cursor", "Curseur"],
            ["fixed", "Point fixe"],
            ["sequence", "Séquence de points"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={["v2-segmented-btn", mode === value ? "active" : ""]
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
        <div className="v2-settings-row">
          <div className="v2-settings-row-label">
            <span>Coordonnées</span>
            <p>Délai 2 s après le clic pour placer le curseur.</p>
          </div>
          <div className="v2-settings-row-control">
            <button
              type="button"
              className="v2-btn"
              disabled={e.running || e.picking}
              onClick={() => void e.onPick()}
            >
              {e.picking && e.pickingPointIndex == null
                ? "Place le curseur…"
                : `${e.targetX}, ${e.targetY}`}
            </button>
          </div>
        </div>
      ) : null}

      {mode === "sequence" ? (
        <>
          <div className="v2-settings-row">
            <div className="v2-settings-row-label">
              <span>Arrêter à la fin</span>
              <p>Stop après le dernier point (sinon boucle).</p>
            </div>
            <div className="v2-settings-row-control">
              <input
                type="checkbox"
                checked={e.stopWhenComplete}
                disabled={e.editDisabled}
                onChange={(ev) => e.setStopWhenComplete(ev.target.checked)}
              />
            </div>
          </div>

          <div className="v2-clicker-points-head">
            <span className="v2-clicker-points-title">Points</span>
            <button
              type="button"
              className="v2-btn v2-btn-ghost"
              disabled={e.editDisabled}
              onClick={() =>
                e.setPoints((prev) => [...prev, { x: 0, y: 0, clicks: 1, radius: 0 }])
              }
            >
              + Point
            </button>
          </div>

          {e.points.length === 0 ? (
            <p className="v2-clicker-hint">Aucun point — ajoutez-en ou utilisez Pick.</p>
          ) : (
            <ul className="v2-clicker-points-list">
              {e.points.map((pt, i) => (
                <li key={i} className="v2-clicker-point-row">
                  <button
                    type="button"
                    className="v2-btn v2-btn-ghost v2-clicker-point-pick"
                    disabled={e.running || e.picking || e.editDisabled}
                    title="Choisir à l'écran"
                    onClick={() => void e.onPickPoint(i)}
                  >
                    {e.picking && e.pickingPointIndex === i ? "…" : "Pick"}
                  </button>
                  <label className="v2-clicker-point-coord">
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
                  <label className="v2-clicker-point-coord">
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
                  <label className="v2-clicker-point-mini" title="Clics sur ce point">
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
                              ? { ...p, clicks: Math.max(1, Number(ev.target.value) || 1) }
                              : p,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="v2-clicker-point-mini" title="Rayon aléatoire (px)">
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
                              ? { ...p, radius: Math.max(0, Number(ev.target.value) || 0) }
                              : p,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="v2-btn v2-btn-ghost v2-clicker-point-remove"
                    disabled={e.editDisabled}
                    aria-label="Supprimer le point"
                    onClick={() => e.setPoints((prev) => prev.filter((_, j) => j !== i))}
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
