import { useEffect, useState, type CSSProperties } from "react";
import { Switch } from "../ui";
import {
  ContextMenu,
  Select,
  useContextMenuState,
} from "../ui/shell";
import { useT } from "../i18n";
import { ZoneMap } from "./ZoneMap";
import type { ZoneKind, ZoneSelection } from "./clickerTypes";
import type { ClickerEditor } from "./useClickerEditor";
import {
  clampCornerHeight,
  clampCornerWidth,
  clampEdgeMargin,
} from "./zoneGeom";
import {
  customZoneContextItems,
  runCustomZoneContextAction,
} from "./zoneContextMenu";

type Props = { editor: ClickerEditor };

export function ClickerZonePreview({ editor: e }: Props) {
  const t = useT();
  const [drawMode, setDrawMode] = useState<ZoneKind | null>(null);
  const ctxMenu = useContextMenuState();
  const [ctxZoneId, setCtxZoneId] = useState<string | null>(null);
  const previewAspectStyle = {
    "--preview-w": e.screenGeom.width,
    "--preview-h": e.screenGeom.height,
  } as CSSProperties;

  const displayValue =
    e.activeDisplayId ?? e.displays.find((d) => d.isPrimary)?.id ?? "";

  const ctxZone = e.zoneModel.customZones.find((z) => z.id === ctxZoneId);

  useEffect(() => {
    if (e.drawing) setDrawMode(null);
  }, [e.drawing]);

  const toggleDrawMode = (kind: ZoneKind) => {
    setDrawMode((prev) => (prev === kind ? null : kind));
  };

  const selectZone = (sel: ZoneSelection) => {
    if (sel.kind === "edge" && !e.zoneModel.edges[sel.id]) {
      e.setZoneModel((m) => ({
        ...m,
        edges: { ...m.edges, [sel.id]: true },
      }));
    }
    if (sel.kind === "corner" && !e.zoneModel.corners[sel.id]) {
      e.setZoneModel((m) => ({
        ...m,
        corners: { ...m.corners, [sel.id]: true },
      }));
    }
    e.setZoneSelection(sel);
  };

  return (
    <div className="caster-clicker-zone-stage">
      <div className="caster-clicker-zone-toolbar caster-clicker-zone-toolbar--full">
        {e.displays.length > 0 ? (
          <Select
            className="caster-clicker-zone-select"
            value={displayValue}
            disabled={e.editDisabled}
            ariaLabel={t("clicker.zones.displayAria")}
            options={e.displays.map((d) => ({
              value: d.id,
              label: `${d.label}${d.isPrimary ? t("clicker.zones.primarySuffix") : ""}`,
            }))}
            onChange={(v) => void e.onSelectDisplay(v)}
          />
        ) : (
          <span className="caster-clicker-hint-inline">
            {e.screenGeom.width}×{e.screenGeom.height}
          </span>
        )}
        <Switch
          checked={e.zoneOverlayVisible}
          disabled={e.editDisabled}
          label={t("clicker.zones.overlay")}
          onChange={e.setZoneOverlayVisible}
        />
        <span className="caster-clicker-zone-toolbar-spacer" />
        <button
          type="button"
          className={[
            "caster-btn",
            "caster-btn-ghost",
            drawMode === "safety" ? "active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={e.editDisabled || e.drawing}
          aria-pressed={drawMode === "safety"}
          onClick={() => toggleDrawMode("safety")}
        >
          {t("clicker.zones.drawSafety")}
        </button>
        <button
          type="button"
          className={[
            "caster-btn",
            "caster-btn-ghost",
            drawMode === "click" ? "active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={e.editDisabled || e.drawing}
          aria-pressed={drawMode === "click"}
          onClick={() => toggleDrawMode("click")}
        >
          {t("clicker.zones.drawClick")}
        </button>
        <button
          type="button"
          className="caster-btn caster-btn-ghost"
          disabled={e.editDisabled || e.drawing}
          onClick={() => void e.onDrawZone(drawMode ?? "safety")}
        >
          {e.drawing
            ? t("clicker.zones.drawing")
            : t("clicker.zones.drawOnScreen")}
        </button>
      </div>
      {drawMode && !e.drawing ? (
        <p className="caster-clicker-hint caster-clicker-zone-draw-hint">
          {t("clicker.zones.drawModeHint")}
        </p>
      ) : null}
      <div className="screen-preview-frame caster-clicker-zone-frame caster-bg-canvas">
        <div className="screen-preview" style={previewAspectStyle}>
          <ZoneMap
            geom={e.screenGeom}
            model={e.zoneModel}
            editable={!e.editDisabled}
            selection={e.zoneSelection}
            drawingKind={e.drawing ? null : drawMode}
            onSelect={selectZone}
            onClearSelection={() => e.setZoneSelection(null)}
            onCustomContextMenu={(id, x, y) => {
              if (
                e.zoneSelection?.kind !== "custom" ||
                e.zoneSelection.id !== id
              ) {
                e.setZoneSelection({ kind: "custom", id });
                return;
              }
              setCtxZoneId(id);
              ctxMenu.openAt(x, y);
            }}
            onResizeEdge={(edge, marginPx) =>
              e.setZoneModel((m) => ({
                ...m,
                edgeMargin: {
                  ...m.edgeMargin,
                  [edge]: clampEdgeMargin(edge, marginPx, e.screenGeom),
                },
              }))
            }
            onResizeCorner={(corner, widthPx, heightPx) =>
              e.setZoneModel((m) => ({
                ...m,
                cornerWidth: {
                  ...m.cornerWidth,
                  [corner]: clampCornerWidth(widthPx, e.screenGeom),
                },
                cornerHeight: {
                  ...m.cornerHeight,
                  [corner]: clampCornerHeight(heightPx, e.screenGeom),
                },
              }))
            }
            onResizeCustom={(id, next) =>
              e.setZoneModel((m) => ({
                ...m,
                customZones: m.customZones.map((z) => (z.id === id ? next : z)),
              }))
            }
            onDrawComplete={(rect) => {
              if (!drawMode) return;
              e.addCustomZone(rect, drawMode);
              setDrawMode(null);
            }}
            onCancelDraw={() => setDrawMode(null)}
          />
        </div>
      </div>
      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        items={customZoneContextItems(t, ctxZone, e.editDisabled)}
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
