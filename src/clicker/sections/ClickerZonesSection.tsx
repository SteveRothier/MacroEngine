import { useState, type WheelEvent as ReactWheelEvent } from "react";
import {
  CORNER_LABELS,
  EDGES,
  cornerLabel,
  edgeLabel,
  zoneActionHint,
  zoneActionLabel,
  zoneKindLabel,
  zoneSelectionEquals,
  type ClickSampleMode,
  type ZoneAction,
  type ZoneKind,
} from "../clickerTypes";
import {
  clampCornerHeight,
  clampCornerWidth,
  clampCustomExtent,
  clampEdgeMargin,
  edgeAxisSize,
} from "../zoneGeom";
import {
  ContextMenu,
  Select,
  useContextMenuState,
  usePointerReorder,
} from "../../ui/shell";
import { WheelNumberInput } from "../../ui/WheelNumberInput";
import { wheelDeltaFromEvent } from "../../ui/useGlobalWheelNudge";
import { useT } from "../../i18n";
import type { ClickerEditor } from "../useClickerEditor";
import {
  customZoneContextItems,
  runCustomZoneContextAction,
} from "../zoneContextMenu";

type Props = { editor: ClickerEditor };

const ZONE_ACTIONS: ZoneAction[] = ["stop", "pause", "start"];

export function ClickerZonesSection({ editor: e }: Props) {
  const t = useT();
  const selectedCustom =
    e.zoneSelection?.kind === "custom"
      ? e.zoneModel.customZones.find((z) => z.id === e.zoneSelection!.id)
      : undefined;
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

  const ctxItems = customZoneContextItems(
    t,
    e.zoneModel.customZones.find((z) => z.id === ctxZoneId),
    e.editDisabled,
  );

  function patchSelectedGeom(
    patch: Partial<{ x: number; y: number; width: number; height: number }>,
  ) {
    if (!selectedCustom) return;
    const next = clampCustomExtent(selectedCustom, patch, e.screenGeom);
    e.updateCustomZone(selectedCustom.id, next);
  }

  function applyEdgeDelta(
    edgeId: (typeof EDGES)[number]["id"],
    delta: number,
  ) {
    if (e.editDisabled || !e.zoneModel.edges[edgeId]) return;
    e.setZoneModel((m) => ({
      ...m,
      edgeMargin: {
        ...m.edgeMargin,
        [edgeId]: clampEdgeMargin(
          edgeId,
          m.edgeMargin[edgeId] + delta,
          e.screenGeom,
        ),
      },
    }));
  }

  function applyCornerDelta(
    cornerId: (typeof CORNER_LABELS)[number]["id"],
    delta: number,
    axisH: boolean,
  ) {
    if (e.editDisabled || !e.zoneModel.corners[cornerId]) return;
    e.setZoneModel((m) =>
      axisH
        ? {
            ...m,
            cornerHeight: {
              ...m.cornerHeight,
              [cornerId]: clampCornerHeight(
                m.cornerHeight[cornerId] + delta,
                e.screenGeom,
              ),
            },
          }
        : {
            ...m,
            cornerWidth: {
              ...m.cornerWidth,
              [cornerId]: clampCornerWidth(
                m.cornerWidth[cornerId] + delta,
                e.screenGeom,
              ),
            },
          },
    );
  }

  function onEdgeWheel(
    edgeId: (typeof EDGES)[number]["id"],
    ev: ReactWheelEvent,
  ) {
    if (e.editDisabled || !e.zoneModel.edges[edgeId]) return;
    if (
      !zoneSelectionEquals(e.zoneSelection, { kind: "edge", id: edgeId })
    ) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    applyEdgeDelta(edgeId, wheelDeltaFromEvent(ev));
  }

  function onCornerWheel(
    cornerId: (typeof CORNER_LABELS)[number]["id"],
    ev: ReactWheelEvent,
  ) {
    if (e.editDisabled || !e.zoneModel.corners[cornerId]) return;
    if (
      !zoneSelectionEquals(e.zoneSelection, { kind: "corner", id: cornerId })
    ) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    applyCornerDelta(
      cornerId,
      wheelDeltaFromEvent(ev),
      ev.ctrlKey || ev.metaKey,
    );
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
        <div className="caster-clicker-zones-grid caster-clicker-zones-grid--corners">
          {CORNER_LABELS.map((c) => {
            const selected = zoneSelectionEquals(e.zoneSelection, {
              kind: "corner",
              id: c.id,
            });
            return (
              <div
                key={c.id}
                className={[
                  "caster-clicker-zone-corner-row",
                  selected ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  if (!e.zoneModel.corners[c.id]) {
                    e.setZoneModel((m) => ({
                      ...m,
                      corners: { ...m.corners, [c.id]: true },
                    }));
                  }
                  e.setZoneSelection({ kind: "corner", id: c.id });
                }}
                onWheel={(ev) => onCornerWheel(c.id, ev)}
              >
                <label
                  className="caster-clicker-zone-toggle"
                  onClick={(ev) => ev.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={e.zoneModel.corners[c.id]}
                    disabled={e.editDisabled}
                    onChange={(ev) => {
                      const on = ev.target.checked;
                      e.setZoneModel((m) => ({
                        ...m,
                        corners: { ...m.corners, [c.id]: on },
                      }));
                      if (on) {
                        e.setZoneSelection({ kind: "corner", id: c.id });
                      } else if (selected) {
                        e.setZoneSelection(null);
                      }
                    }}
                  />
                  <span>{cornerLabel(t, c.id)}</span>
                </label>
                {e.zoneModel.corners[c.id] ? (
                  <div className="caster-clicker-zone-size-pair">
                    <label className="caster-clicker-zone-size">
                      <span>{t("clicker.zones.coordW")}</span>
                      <WheelNumberInput
                        min={1}
                        max={e.screenGeom.width}
                        value={e.zoneModel.cornerWidth[c.id]}
                        disabled={e.editDisabled}
                        onClick={(ev) => ev.stopPropagation()}
                        onFocus={() => {
                          e.setZoneSelection({ kind: "corner", id: c.id });
                        }}
                        onValueChange={(n) => {
                          e.setZoneModel((m) => ({
                            ...m,
                            cornerWidth: {
                              ...m.cornerWidth,
                              [c.id]: clampCornerWidth(n, e.screenGeom),
                            },
                          }));
                        }}
                      />
                    </label>
                    <label className="caster-clicker-zone-size">
                      <span>{t("clicker.zones.coordH")}</span>
                      <WheelNumberInput
                        min={1}
                        max={e.screenGeom.height}
                        value={e.zoneModel.cornerHeight[c.id]}
                        disabled={e.editDisabled}
                        onClick={(ev) => ev.stopPropagation()}
                        onFocus={() => {
                          e.setZoneSelection({ kind: "corner", id: c.id });
                        }}
                        onValueChange={(n) => {
                          e.setZoneModel((m) => ({
                            ...m,
                            cornerHeight: {
                              ...m.cornerHeight,
                              [c.id]: clampCornerHeight(n, e.screenGeom),
                            },
                          }));
                        }}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="caster-clicker-zones-block">
        <div className="caster-clicker-zones-block-head">
          <span>{t("clicker.zones.edges")}</span>
        </div>
        <div className="caster-clicker-zones-grid">
          {EDGES.map((edge) => {
            const selected = zoneSelectionEquals(e.zoneSelection, {
              kind: "edge",
              id: edge.id,
            });
            return (
              <div
                key={edge.id}
                className={[
                  "caster-clicker-zone-edge",
                  selected ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  if (!e.zoneModel.edges[edge.id]) {
                    e.setZoneModel((m) => ({
                      ...m,
                      edges: { ...m.edges, [edge.id]: true },
                    }));
                  }
                  e.setZoneSelection({ kind: "edge", id: edge.id });
                }}
                onWheel={(ev) => onEdgeWheel(edge.id, ev)}
              >
                <label
                  className="caster-clicker-zone-toggle"
                  onClick={(ev) => ev.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={e.zoneModel.edges[edge.id]}
                    disabled={e.editDisabled}
                    onChange={(ev) => {
                      const on = ev.target.checked;
                      e.setZoneModel((m) => ({
                        ...m,
                        edges: { ...m.edges, [edge.id]: on },
                      }));
                      if (on) {
                        e.setZoneSelection({ kind: "edge", id: edge.id });
                      } else if (selected) {
                        e.setZoneSelection(null);
                      }
                    }}
                  />
                  <span>{edgeLabel(t, edge.id)}</span>
                </label>
                <WheelNumberInput
                  min={1}
                  max={edgeAxisSize(edge.id, e.screenGeom)}
                  value={e.zoneModel.edgeMargin[edge.id]}
                  disabled={e.editDisabled || !e.zoneModel.edges[edge.id]}
                  onClick={(ev) => ev.stopPropagation()}
                  onFocus={() => {
                    e.setZoneSelection({ kind: "edge", id: edge.id });
                  }}
                  onValueChange={(n) => {
                    e.setZoneModel((m) => ({
                      ...m,
                      edgeMargin: {
                        ...m.edgeMargin,
                        [edge.id]: clampEdgeMargin(edge.id, n, e.screenGeom),
                      },
                    }));
                  }}
                />
                <span className="caster-clicker-zone-px">px</span>
              </div>
            );
          })}
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
            {zones.map((z, index) => {
              const selected = zoneSelectionEquals(e.zoneSelection, {
                kind: "custom",
                id: z.id,
              });
              return (
                <li
                  key={z.id}
                  data-reorder-id={z.id}
                  className={[
                    "caster-clicker-zone-line",
                    selected ? "selected" : "",
                    reorder.draggingIndex === index ? "is-dragging" : "",
                    reorder.overIndex === index ? "is-drop-over" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onPointerDown={(ev) => reorder.onPointerDown(index, ev)}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    if (!selected) {
                      e.setZoneSelection({ kind: "custom", id: z.id });
                      return;
                    }
                    setCtxZoneId(z.id);
                    ctxMenu.openFromEvent(ev);
                  }}
                >
                  <button
                    type="button"
                    className="caster-clicker-zone-line-main"
                    onClick={() =>
                      e.setZoneSelection({ kind: "custom", id: z.id })
                    }
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
                    disabled={e.editDisabled || !selected}
                    aria-label={t("clicker.zones.delete")}
                    onClick={() => e.removeCustomZone(z.id)}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selectedCustom ? (
          <div className="caster-clicker-zone-detail">
            <div className="caster-clicker-zone-xywh">
              {(
                [
                  ["x", t("clicker.zones.coordX"), selectedCustom.x],
                  ["y", t("clicker.zones.coordY"), selectedCustom.y],
                  ["width", t("clicker.zones.coordW"), selectedCustom.width],
                  ["height", t("clicker.zones.coordH"), selectedCustom.height],
                ] as const
              ).map(([key, label, value]) => (
                <label key={key} className="caster-field caster-field--compact">
                  <span>{label}</span>
                  <WheelNumberInput
                    value={value}
                    disabled={e.editDisabled}
                    onValueChange={(n) => patchSelectedGeom({ [key]: n })}
                  />
                </label>
              ))}
            </div>
            <div className="caster-field-row">
              <label className="caster-field caster-field--compact">
                <span>{t("clicker.zones.action")}</span>
                <Select
                  className="caster-select"
                  value={selectedCustom.action}
                  disabled={e.editDisabled}
                  title={zoneActionHint(t, selectedCustom.action)}
                  options={zoneActionOpts}
                  onChange={(v) =>
                    e.updateCustomZone(selectedCustom.id, {
                      action: v as ZoneAction,
                    })
                  }
                />
              </label>
              <label className="caster-field caster-field--compact">
                <span>{t("clicker.zones.kind")}</span>
                <Select
                  className="caster-select"
                  value={selectedCustom.kind}
                  disabled={e.editDisabled}
                  options={zoneKindOpts}
                  onChange={(v) =>
                    e.updateCustomZone(selectedCustom.id, {
                      kind: v as ZoneKind,
                    })
                  }
                />
              </label>
            </div>
            {selectedCustom.kind === "click" ? (
              <label className="caster-field caster-field--compact">
                <span>{t("clicker.zones.sample")}</span>
                <Select
                  className="caster-select"
                  value={selectedCustom.clickMode}
                  disabled={e.editDisabled}
                  options={clickModeOpts}
                  onChange={(v) =>
                    e.updateCustomZone(selectedCustom.id, {
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
                value={selectedCustom.color}
                disabled={e.editDisabled}
                onChange={(ev) =>
                  e.updateCustomZone(selectedCustom.id, {
                    color: ev.target.value,
                  })
                }
              />
            </label>
            <p className="caster-clicker-hint">
              {zoneActionHint(t, selectedCustom.action)}
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
          runCustomZoneContextAction(e, ctxZoneId, id);
        }}
        ariaLabel={t("clicker.zones.contextAria")}
      />
    </div>
  );
}
