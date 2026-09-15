import { useState } from "react";
import {
  CORNER_LABELS,
  EDGES,
  cornerLabel,
  edgeLabel,
  zoneActionHint,
  zoneActionLabel,
  zoneKindLabel,
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
} from "../../ui/shell";
import { useT } from "../../i18n";
import type { ClickerEditor } from "../useClickerEditor";

type Props = { editor: ClickerEditor };

const ZONE_ACTIONS: ZoneAction[] = ["stop", "pause", "start"];

export function ClickerZonesSection({ editor: e }: Props) {
  const t = useT();
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

  const zoneActionOpts = ZONE_ACTIONS.map((a) => ({
    value: a,
    label: zoneActionLabel(t, a),
  }));

  const zoneKindOpts = (["safety", "click"] as ZoneKind[]).map((k) => ({
    value: k,
    label: zoneKindLabel(t, k),
  }));

  const clickModeOpts = [
    { value: "random", label: t("clicker.segments.random") },
    { value: "center", label: t("clicker.segments.center") },
  ];

  const ctxItems: MenuItemDef[] = [
    { id: "edit", label: t("clicker.zones.edit") },
    ...(e.editDisabled
      ? []
      : [
          {
            id: "delete",
            label: t("clicker.zones.delete"),
            danger: true,
          } satisfies MenuItemDef,
        ]),
  ];

  function removeZone(id: string) {
    e.setZoneModel((m) => ({
      ...m,
      customZones: m.customZones.filter((cz) => cz.id !== id),
    }));
    if (e.selectedZoneId === id) e.setSelectedZoneId(null);
  }

  return (
    <div className="caster-clicker-section caster-clicker-zones-panel">
      <div className="caster-clicker-zones-block">
        <div className="caster-clicker-zones-block-head">
          <span>{t("clicker.zones.corners")}</span>
          <input
            type="color"
            value={e.zoneModel.cornerColor}
            disabled={e.editDisabled}
            aria-label={t("clicker.zones.cornerColorAria")}
            onChange={(ev) =>
              e.setZoneModel((m) => ({ ...m, cornerColor: ev.target.value }))
            }
          />
        </div>
        <div className="caster-clicker-zones-grid">
          {CORNER_LABELS.map((c) => (
            <label key={c.id} className="caster-clicker-zone-toggle">
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
              <span>{cornerLabel(t, c.id)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="caster-clicker-zones-block">
        <div className="caster-clicker-zones-block-head">
          <span>{t("clicker.zones.edges")}</span>
        </div>
        <div className="caster-clicker-zones-grid">
          {EDGES.map((edge) => (
            <label key={edge.id} className="caster-clicker-zone-edge">
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
              <span>{edgeLabel(t, edge.id)}</span>
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
              <span className="caster-clicker-zone-px">px</span>
            </label>
          ))}
        </div>
      </div>

      <div className="caster-clicker-zones-block">
        <div className="caster-clicker-zones-block-head">
          <span>{t("clicker.zones.custom")}</span>
          <span className="caster-clicker-hint-inline">
            {t("clicker.zones.zoneCount", { n: zones.length })}
          </span>
        </div>
        {zones.length === 0 ? (
          <p className="caster-clicker-hint">{t("clicker.zones.drawHint")}</p>
        ) : (
          <ul className="caster-clicker-zone-list">
            {zones.map((z, index) => (
              <li
                key={z.id}
                data-reorder-id={z.id}
                className={[
                  "caster-clicker-zone-line",
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
                  className="caster-clicker-zone-line-main"
                  onClick={() => e.setSelectedZoneId(z.id)}
                >
                  <span
                    className="caster-clicker-zone-swatch"
                    style={{ background: z.color }}
                    aria-hidden
                  />
                  <span className="caster-clicker-zone-line-meta">
                    {z.width}×{z.height} · {zoneKindLabel(t, z.kind)} ·{" "}
                    {zoneActionLabel(t, z.action)}
                  </span>
                </button>
                <button
                  type="button"
                  className="caster-clicker-zone-line-remove"
                  disabled={e.editDisabled}
                  aria-label={t("clicker.zones.delete")}
                  onClick={() => removeZone(z.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected ? (
          <div className="caster-clicker-zone-detail">
            <div className="caster-field-row">
              <label className="caster-field caster-field--compact">
                <span>{t("clicker.zones.action")}</span>
                <Select
                  className="caster-select"
                  value={selected.action}
                  disabled={e.editDisabled}
                  title={zoneActionHint(t, selected.action)}
                  options={zoneActionOpts}
                  onChange={(v) =>
                    e.updateCustomZone(selected.id, {
                      action: v as ZoneAction,
                    })
                  }
                />
              </label>
              <label className="caster-field caster-field--compact">
                <span>{t("clicker.zones.kind")}</span>
                <Select
                  className="caster-select"
                  value={selected.kind}
                  disabled={e.editDisabled}
                  options={zoneKindOpts}
                  onChange={(v) =>
                    e.updateCustomZone(selected.id, {
                      kind: v as ZoneKind,
                    })
                  }
                />
              </label>
            </div>
            {selected.kind === "click" ? (
              <label className="caster-field caster-field--compact">
                <span>{t("clicker.zones.sample")}</span>
                <Select
                  className="caster-select"
                  value={selected.clickMode}
                  disabled={e.editDisabled}
                  options={clickModeOpts}
                  onChange={(v) =>
                    e.updateCustomZone(selected.id, {
                      clickMode: v as ClickSampleMode,
                    })
                  }
                />
              </label>
            ) : null}
            <label className="caster-field caster-field--compact">
              <span>{t("clicker.zones.color")}</span>
              <input
                type="color"
                value={selected.color}
                disabled={e.editDisabled}
                onChange={(ev) =>
                  e.updateCustomZone(selected.id, { color: ev.target.value })
                }
              />
            </label>
            <p className="caster-clicker-hint">
              {zoneActionHint(t, selected.action)}
            </p>
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
        ariaLabel={t("clicker.zones.contextAria")}
      />
    </div>
  );
}
