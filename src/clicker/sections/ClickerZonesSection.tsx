import {
  CORNER_LABELS,
  EDGES,
  ZONE_ACTION_HINT,
  ZONE_ACTION_LABEL,
  ZONE_KIND_LABEL,
  type ClickSampleMode,
  type ZoneAction,
  type ZoneKind,
} from "../clickerTypes";
import type { ClickerEditor } from "../useClickerEditor";

type Props = { editor: ClickerEditor };

const ZONE_ACTIONS: ZoneAction[] = ["stop", "pause", "start"];

export function ClickerZonesSection({ editor: e }: Props) {
  const selected = e.zoneModel.customZones.find((z) => z.id === e.selectedZoneId);

  return (
    <div className="v2-clicker-section v2-clicker-zones-panel">
      <div className="v2-clicker-zones-block">
        <div className="v2-clicker-zones-block-head">
          <span>Coins</span>
          <input
            type="color"
            value={e.zoneModel.cornerColor}
            disabled={e.editDisabled}
            aria-label="Couleur des coins"
            onChange={(ev) =>
              e.setZoneModel((m) => ({ ...m, cornerColor: ev.target.value }))
            }
          />
        </div>
        <div className="v2-clicker-zones-grid">
          {CORNER_LABELS.map((c) => (
            <label key={c.id} className="v2-clicker-zone-toggle">
              <input
                type="checkbox"
                checked={e.zoneModel.corners[c.id]}
                disabled={e.editDisabled}
                onChange={(ev) =>
                  e.setZoneModel((m) => ({
                    ...m,
                    corners: { ...m.corners, [c.id]: ev.target.checked },
                  }))
                }
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="v2-clicker-zones-block">
        <div className="v2-clicker-zones-block-head">
          <span>Bords</span>
        </div>
        <div className="v2-clicker-zones-grid">
          {EDGES.map((edge) => (
            <label key={edge.id} className="v2-clicker-zone-edge">
              <input
                type="checkbox"
                checked={e.zoneModel.edges[edge.id]}
                disabled={e.editDisabled}
                onChange={(ev) =>
                  e.setZoneModel((m) => ({
                    ...m,
                    edges: { ...m.edges, [edge.id]: ev.target.checked },
                  }))
                }
              />
              <span>{edge.label}</span>
              <input
                type="number"
                min={1}
                max={200}
                value={e.zoneModel.edgeMargin[edge.id]}
                disabled={e.editDisabled || !e.zoneModel.edges[edge.id]}
                onChange={(ev) =>
                  e.setZoneModel((m) => ({
                    ...m,
                    edgeMargin: {
                      ...m.edgeMargin,
                      [edge.id]: Number(ev.target.value),
                    },
                  }))
                }
              />
              <span className="v2-clicker-zone-px">px</span>
            </label>
          ))}
        </div>
      </div>

      <div className="v2-clicker-zones-block">
        <div className="v2-clicker-zones-block-head">
          <span>Zones personnalisées</span>
          <span className="v2-clicker-hint-inline">
            {e.zoneModel.customZones.length} zone(s)
          </span>
        </div>
        {e.zoneModel.customZones.length === 0 ? (
          <p className="v2-clicker-hint">Dessinez depuis l&apos;aperçu →</p>
        ) : (
          <ul className="v2-clicker-zone-list">
            {e.zoneModel.customZones.map((z) => (
              <li
                key={z.id}
                className={[
                  "v2-clicker-zone-line",
                  e.selectedZoneId === z.id ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <button
                  type="button"
                  className="v2-clicker-zone-line-main"
                  onClick={() => e.setSelectedZoneId(z.id)}
                >
                  <span
                    className="v2-clicker-zone-swatch"
                    style={{ background: z.color }}
                    aria-hidden
                  />
                  <span className="v2-clicker-zone-line-meta">
                    {z.width}×{z.height} · {ZONE_KIND_LABEL[z.kind]} ·{" "}
                    {ZONE_ACTION_LABEL[z.action]}
                  </span>
                </button>
                <button
                  type="button"
                  className="v2-clicker-zone-line-remove"
                  disabled={e.editDisabled}
                  aria-label="Supprimer"
                  onClick={() => {
                    e.setZoneModel((m) => ({
                      ...m,
                      customZones: m.customZones.filter((cz) => cz.id !== z.id),
                    }));
                    if (e.selectedZoneId === z.id) e.setSelectedZoneId(null);
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected ? (
          <div className="v2-clicker-zone-detail">
            <div className="v2-field-row">
              <label className="v2-field v2-field--compact">
                <span>Action</span>
                <select
                  value={selected.action}
                  disabled={e.editDisabled}
                  title={ZONE_ACTION_HINT[selected.action]}
                  onChange={(ev) =>
                    e.updateCustomZone(selected.id, {
                      action: ev.target.value as ZoneAction,
                    })
                  }
                >
                  {ZONE_ACTIONS.map((a) => (
                    <option key={a} value={a} title={ZONE_ACTION_HINT[a]}>
                      {ZONE_ACTION_LABEL[a]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="v2-field v2-field--compact">
                <span>Type</span>
                <select
                  value={selected.kind}
                  disabled={e.editDisabled}
                  onChange={(ev) =>
                    e.updateCustomZone(selected.id, {
                      kind: ev.target.value as ZoneKind,
                    })
                  }
                >
                  {(Object.keys(ZONE_KIND_LABEL) as ZoneKind[]).map((k) => (
                    <option key={k} value={k}>
                      {ZONE_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {selected.kind === "click" ? (
              <label className="v2-field v2-field--compact">
                <span>Échantillon</span>
                <select
                  value={selected.clickMode}
                  disabled={e.editDisabled}
                  onChange={(ev) =>
                    e.updateCustomZone(selected.id, {
                      clickMode: ev.target.value as ClickSampleMode,
                    })
                  }
                >
                  <option value="random">Aléatoire</option>
                  <option value="center">Centre</option>
                </select>
              </label>
            ) : null}
            <label className="v2-field v2-field--compact">
              <span>Couleur</span>
              <input
                type="color"
                value={selected.color}
                disabled={e.editDisabled}
                onChange={(ev) =>
                  e.updateCustomZone(selected.id, { color: ev.target.value })
                }
              />
            </label>
            <p className="v2-clicker-hint">{ZONE_ACTION_HINT[selected.action]}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
