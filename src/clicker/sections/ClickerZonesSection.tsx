import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from "react";
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
import { ClickerInfoTip } from "../ClickerInfoTip";
import type { ClickerEditor } from "../useClickerEditor";
import {
  customZoneContextItems,
  runCustomZoneContextAction,
} from "../zoneContextMenu";

type Props = { editor: ClickerEditor };

const ZONE_ACTIONS: ZoneAction[] = ["stop", "pause", "start"];

export function ClickerZonesSection({ editor: e }: Props) {
  const t = useT();
  const zonesPanelRef = useRef<HTMLDivElement | null>(null);
  const selectedCustom =
    e.zoneSelection?.kind === "custom"
      ? e.zoneModel.customZones.find((z) => z.id === e.zoneSelection!.id)
      : undefined;
  const ctxMenu = useContextMenuState();
  const [ctxZoneId, setCtxZoneId] = useState<string | null>(null);
  const [multiZoneIds, setMultiZoneIds] = useState<Set<string>>(() => new Set());
  const zones = e.zoneModel.customZones;
  const safetyCustoms = zones.filter((z) => z.kind === "safety");
  const clickCustoms = zones.filter((z) => z.kind === "click");

  useEffect(() => {
    const clearIfOutside = (ev: PointerEvent) => {
      if (e.zoneSelection == null && multiZoneIds.size === 0) return;
      const root = zonesPanelRef.current;
      const target = ev.target;
      if (!(target instanceof Node) || !root) return;
      if (root.contains(target)) return;
      // Keep selection when interacting with the zone map / overlay canvas.
      if (
        target instanceof Element &&
        target.closest(
          ".caster-clicker-zone-stage, .caster-clicker-canvas-map, .caster-clicker-zone-overlay",
        )
      ) {
        return;
      }
      setMultiZoneIds(new Set());
      e.setZoneSelection(null);
    };
    document.addEventListener("pointerdown", clearIfOutside, true);
    return () =>
      document.removeEventListener("pointerdown", clearIfOutside, true);
  }, [e, e.zoneSelection, multiZoneIds.size]);

  function selectCustomZone(
    id: string,
    kindList: { id: string }[],
    ev: ReactMouseEvent,
  ) {
    e.setZoneSelection({ kind: "custom", id });
    if (ev.shiftKey && multiZoneIds.size > 0) {
      const ids = kindList.map((z) => z.id);
      const anchor =
        [...multiZoneIds].find((x) => ids.includes(x)) ??
        (e.zoneSelection?.kind === "custom" ? e.zoneSelection.id : id);
      const a = ids.indexOf(anchor);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setMultiZoneIds(new Set(ids.slice(lo, hi + 1)));
        return;
      }
    }
    if (ev.ctrlKey || ev.metaKey) {
      setMultiZoneIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }
    setMultiZoneIds(new Set([id]));
  }

  function clearMultiZones() {
    setMultiZoneIds(new Set());
  }

  function reorderKind(kind: ZoneKind, from: number, to: number) {
    e.setZoneModelWithHistory(
      "clicker.history.zoneReordered",
      (m) => {
        const ofKind = m.customZones.filter((z) => z.kind === kind);
        const next = [...ofKind];
        const [moved] = next.splice(from, 1);
        if (!moved) return m;
        next.splice(to, 0, moved);
        let i = 0;
        return {
          ...m,
          customZones: m.customZones.map((z) =>
            z.kind === kind ? next[i++]! : z,
          ),
        };
      },
      { coalesceMs: 400 },
    );
  }

  const safetyReorder = usePointerReorder({
    items: safetyCustoms,
    getId: (z) => z.id,
    disabled: e.editDisabled,
    onReorder: (from, to) => reorderKind("safety", from, to),
  });
  const clickReorder = usePointerReorder({
    items: clickCustoms,
    getId: (z) => z.id,
    disabled: e.editDisabled,
    onReorder: (from, to) => reorderKind("click", from, to),
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
    e.updateCustomZone(
      selectedCustom.id,
      next,
      "clicker.history.zoneSized",
      { coalesceMs: 400 },
    );
  }

  function applyEdgeDelta(
    edgeId: (typeof EDGES)[number]["id"],
    delta: number,
  ) {
    if (e.editDisabled || !e.zoneModel.edges[edgeId]) return;
    e.setZoneModelWithHistory(
      "clicker.history.zoneSized",
      (m) => ({
        ...m,
        edgeMargin: {
          ...m.edgeMargin,
          [edgeId]: clampEdgeMargin(
            edgeId,
            m.edgeMargin[edgeId] + delta,
            e.screenGeom,
          ),
        },
      }),
      { coalesceMs: 400 },
    );
  }

  function applyCornerDelta(
    cornerId: (typeof CORNER_LABELS)[number]["id"],
    delta: number,
    axisH: boolean,
  ) {
    if (e.editDisabled || !e.zoneModel.corners[cornerId]) return;
    e.setZoneModelWithHistory(
      "clicker.history.zoneSized",
      (m) =>
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
      { coalesceMs: 400 },
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
    <div
      ref={zonesPanelRef}
      className="caster-clicker-section caster-clicker-zones-panel"
    >
      {multiZoneIds.size > 1 ? (
        <div className="caster-clicker-zones-bulk">
          <span>
            {t("clicker.zones.selectedCount", { count: multiZoneIds.size })}
          </span>
          <button
            type="button"
            className="caster-btn caster-btn-ghost"
            disabled={e.editDisabled}
            onClick={() => {
              e.bringCustomZonesFront([...multiZoneIds]);
            }}
          >
            {t("clicker.zones.bringFront")}
          </button>
          <button
            type="button"
            className="caster-btn caster-btn-danger-ghost"
            disabled={e.editDisabled}
            onClick={() => {
              e.removeCustomZones([...multiZoneIds]);
              clearMultiZones();
            }}
          >
            {t("clicker.zones.delete")}
          </button>
          <button
            type="button"
            className="caster-btn caster-btn-ghost"
            onClick={clearMultiZones}
          >
            {t("clicker.zones.clearSelection")}
          </button>
        </div>
      ) : null}
      <div className="caster-clicker-zones-section">
        <h3 className="caster-clicker-zones-section-title caster-settings-row-label-with-info">
          <span>{t("clicker.zones.safetyBlock")}</span>
          <ClickerInfoTip text={t("clicker.scenario.safetyHint")} />
        </h3>

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
                      e.setZoneModelWithHistory(
                        "clicker.history.cornerToggled",
                        (m) => ({
                          ...m,
                          corners: { ...m.corners, [c.id]: true },
                        }),
                      );
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
                        e.setZoneModelWithHistory(
                          "clicker.history.cornerToggled",
                          (m) => ({
                            ...m,
                            corners: { ...m.corners, [c.id]: on },
                          }),
                        );
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
                            e.setZoneModelWithHistory(
                              "clicker.history.zoneSized",
                              (m) => ({
                                ...m,
                                cornerWidth: {
                                  ...m.cornerWidth,
                                  [c.id]: clampCornerWidth(n, e.screenGeom),
                                },
                              }),
                              { coalesceMs: 400 },
                            );
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
                            e.setZoneModelWithHistory(
                              "clicker.history.zoneSized",
                              (m) => ({
                                ...m,
                                cornerHeight: {
                                  ...m.cornerHeight,
                                  [c.id]: clampCornerHeight(n, e.screenGeom),
                                },
                              }),
                              { coalesceMs: 400 },
                            );
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
                      e.setZoneModelWithHistory(
                        "clicker.history.edgeToggled",
                        (m) => ({
                          ...m,
                          edges: { ...m.edges, [edge.id]: true },
                        }),
                      );
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
                        e.setZoneModelWithHistory(
                          "clicker.history.edgeToggled",
                          (m) => ({
                            ...m,
                            edges: { ...m.edges, [edge.id]: on },
                          }),
                        );
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
                      e.setZoneModelWithHistory(
                        "clicker.history.zoneSized",
                        (m) => ({
                          ...m,
                          edgeMargin: {
                            ...m.edgeMargin,
                            [edge.id]: clampEdgeMargin(
                              edge.id,
                              n,
                              e.screenGeom,
                            ),
                          },
                        }),
                        { coalesceMs: 400 },
                      );
                    }}
                  />
                  <span className="caster-clicker-zone-px">px</span>
                </div>
              );
            })}
          </div>
        </div>

        {safetyCustoms.length > 0 ? (
          <div className="caster-clicker-zones-block">
            <ul className="caster-clicker-zone-list">
              {safetyCustoms.map((z, index) => {
                const selected =
                  multiZoneIds.has(z.id) ||
                  zoneSelectionEquals(e.zoneSelection, {
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
                      safetyReorder.draggingIndex === index
                        ? "is-dragging"
                        : "",
                      safetyReorder.overIndex === index ? "is-drop-over" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onPointerDown={(ev) =>
                      safetyReorder.onPointerDown(index, ev)
                    }
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      if (!selected) {
                        e.setZoneSelection({ kind: "custom", id: z.id });
                        setMultiZoneIds(new Set([z.id]));
                        return;
                      }
                      setCtxZoneId(z.id);
                      ctxMenu.openFromEvent(ev);
                    }}
                  >
                    <button
                      type="button"
                      className="caster-clicker-zone-line-main"
                      onClick={(ev) => selectCustomZone(z.id, safetyCustoms, ev)}
                    >
                      <span
                        className="caster-clicker-zone-swatch"
                        style={{ background: z.color }}
                        aria-hidden
                      />
                      <span className="caster-clicker-zone-line-meta">
                        {z.width}×{z.height} · {zoneActionLabel(t, z.action)}
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
          </div>
        ) : null}
      </div>

      <div className="caster-clicker-zones-section">
        <h3 className="caster-clicker-zones-section-title caster-settings-row-label-with-info">
          <span>{t("clicker.zones.clickBlock")}</span>
          <ClickerInfoTip text={t("clicker.scenario.clickZonesHint")} />
        </h3>

        {clickCustoms.length > 0 ? (
          <div className="caster-clicker-zones-block">
            <ul className="caster-clicker-zone-list">
              {clickCustoms.map((z, index) => {
                const selected =
                  multiZoneIds.has(z.id) ||
                  zoneSelectionEquals(e.zoneSelection, {
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
                      clickReorder.draggingIndex === index ? "is-dragging" : "",
                      clickReorder.overIndex === index ? "is-drop-over" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onPointerDown={(ev) =>
                      clickReorder.onPointerDown(index, ev)
                    }
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      if (!selected) {
                        e.setZoneSelection({ kind: "custom", id: z.id });
                        setMultiZoneIds(new Set([z.id]));
                        return;
                      }
                      setCtxZoneId(z.id);
                      ctxMenu.openFromEvent(ev);
                    }}
                  >
                    <button
                      type="button"
                      className="caster-clicker-zone-line-main"
                      onClick={(ev) => selectCustomZone(z.id, clickCustoms, ev)}
                    >
                      <span
                        className="caster-clicker-zone-swatch"
                        style={{ background: z.color }}
                        aria-hidden
                      />
                      <span className="caster-clicker-zone-line-meta">
                        {z.width}×{z.height} · {zoneActionLabel(t, z.action)}
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
          </div>
        ) : (
          <div className="caster-clicker-zones-empty">
            <p className="caster-clicker-hint">{t("clicker.zones.emptyClick")}</p>
            <button
              type="button"
              className="caster-btn"
              disabled={e.editDisabled || e.drawing}
              onClick={() => void e.onDrawZone("click")}
            >
              {e.drawing
                ? t("clicker.zones.drawing")
                : t("clicker.zones.drawCta")}
            </button>
          </div>
        )}
      </div>

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
              <span className="caster-settings-row-label-with-info">
                <span>{t("clicker.zones.action")}</span>
                <ClickerInfoTip
                  text={zoneActionHint(t, selectedCustom.action)}
                />
              </span>
              <Select
                className="caster-select"
                value={selectedCustom.action}
                disabled={e.editDisabled}
                title={zoneActionHint(t, selectedCustom.action)}
                options={zoneActionOpts}
                onChange={(v) =>
                  e.updateCustomZone(
                    selectedCustom.id,
                    { action: v as ZoneAction },
                    "clicker.history.zoneActionChanged",
                  )
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
                  e.updateCustomZone(
                    selectedCustom.id,
                    { kind: v as ZoneKind },
                    "clicker.history.zoneKindChanged",
                  )
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
        </div>
      ) : null}

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
