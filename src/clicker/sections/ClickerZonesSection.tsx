import { useState } from "react";
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
import {
  ContextMenu,
  Select,
  useContextMenuState,
  usePointerReorder,
  type MenuItemDef,
} from "../../ui/v2";
import type { ClickerEditor } from "../useClickerEditor";

type Props = { editor: ClickerEditor };

const ZONE_ACTIONS: ZoneAction[] = ["stop", "pause", "start"];

const ZONE_ACTION_OPTS = ZONE_ACTIONS.map((a) => ({
  value: a,
  label: ZONE_ACTION_LABEL[a],
}));

const ZONE_KIND_OPTS = (Object.keys(ZONE_KIND_LABEL) as ZoneKind[]).map((k) => ({
  value: k,
  label: ZONE_KIND_LABEL[k],
}));

const CLICK_MODE_OPTS = [
  { value: "random", label: "Aléatoire" },
  { value: "center", label: "Centre" },
];

export function ClickerZonesSection({ editor: e }: Props) {
  const selected = e.zoneModel.customZones.find((z) => z.id === e.selectedZoneId);
  const ctxMenu = useContextMenuState();
  const [ctxZoneId, setCtxZoneId] = useState<string | null>(null);
  const zones = e.zoneModel.customZones;
  const reorder = usePointerReorder({
    items: zones,
    getId: (z) => z.id,
    disabled: e.editDisabled,
    onReorder: (from, to) => {
      e.setZoneModel((m) => {
        const next = [...m.customZones];
        const [moved] = next.splice(from, 1);
        if (!moved) return m;
        next.splice(to, 0, moved);
        return { ...m, customZones: next };
      });
    },
  });

  const ctxItems: MenuItemDef[] = [
    { id: "edit", label: "Éditer" },
    ...(e.editDisabled
      ? []
      : [{ id: "delete", label: "Supprimer", danger: true } satisfies MenuItemDef]),
  ];

  function removeZone(id: string) {
    e.setZoneModel((m) => ({
      ...m,
      customZones: m.customZones.filter((cz) => cz.id !== id),
    }));
    if (e.selectedZoneId === id) e.setSelectedZoneId(null);
  }

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
            {zones.length} zone(s)
          </span>
        </div>
        {zones.length === 0 ? (
          <p className="v2-clicker-hint">Dessinez depuis l&apos;aperçu →</p>
        ) : (
          <ul className="v2-clicker-zone-list">
            {zones.map((z, index) => (
              <li
                key={z.id}
                data-reorder-id={z.id}
                className={[
                  "v2-clicker-zone-line",
                  e.selectedZoneId === z.id ? "selected" : "",
                  reorder.draggingIndex === index ? "is-dragging" : "",
                  reorder.overIndex === index ? "is-drop-over" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onPointerDown={(ev) => reorder.onPointerDown(index, ev)}
                onContextMenu={(ev) => {
                  setCtxZoneId(z.id);
                  ctxMenu.openFromEvent(ev);
                }}
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
                  onClick={() => removeZone(z.id)}
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
                <Select
                  className="v2-select"
                  value={selected.action}
                  disabled={e.editDisabled}
                  title={ZONE_ACTION_HINT[selected.action]}
                  options={ZONE_ACTION_OPTS}
                  onChange={(v) =>
                    e.updateCustomZone(selected.id, {
                      action: v as ZoneAction,
                    })
                  }
                />
              </label>
              <label className="v2-field v2-field--compact">
                <span>Type</span>
                <Select
                  className="v2-select"
                  value={selected.kind}
                  disabled={e.editDisabled}
                  options={ZONE_KIND_OPTS}
                  onChange={(v) =>
                    e.updateCustomZone(selected.id, {
                      kind: v as ZoneKind,
                    })
                  }
                />
              </label>
            </div>
            {selected.kind === "click" ? (
              <label className="v2-field v2-field--compact">
                <span>Échantillon</span>
                <Select
                  className="v2-select"
                  value={selected.clickMode}
                  disabled={e.editDisabled}
                  options={CLICK_MODE_OPTS}
                  onChange={(v) =>
                    e.updateCustomZone(selected.id, {
                      clickMode: v as ClickSampleMode,
                    })
                  }
                />
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

      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        items={ctxItems}
        onClose={ctxMenu.close}
        onSelect={(id) => {
          if (!ctxZoneId) return;
          if (id === "edit") e.setSelectedZoneId(ctxZoneId);
          if (id === "delete" && !e.editDisabled) removeZone(ctxZoneId);
        }}
        ariaLabel="Actions sur la zone"
      />
    </div>
  );
}
