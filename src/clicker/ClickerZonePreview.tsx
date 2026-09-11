import type { CSSProperties } from "react";
import { Switch } from "../ui";
import { Select } from "../ui/v2";
import { ZoneMap } from "./ZoneMap";
import type { ClickerEditor } from "./useClickerEditor";

type Props = { editor: ClickerEditor };

export function ClickerZonePreview({ editor: e }: Props) {
  const previewAspectStyle = {
    "--preview-w": e.screenGeom.width,
    "--preview-h": e.screenGeom.height,
  } as CSSProperties;

  const displayValue =
    e.activeDisplayId ?? e.displays.find((d) => d.isPrimary)?.id ?? "";

  return (
    <div className="v2-clicker-zone-stage">
      <div className="v2-clicker-zone-toolbar v2-clicker-zone-toolbar--full">
        {e.displays.length > 0 ? (
          <Select
            className="v2-clicker-zone-select"
            value={displayValue}
            disabled={e.editDisabled}
            ariaLabel="Écran cible"
            options={e.displays.map((d) => ({
              value: d.id,
              label: `${d.label}${d.isPrimary ? " (principal)" : ""}`,
            }))}
            onChange={(v) => void e.onSelectDisplay(v)}
          />
        ) : (
          <span className="v2-clicker-hint-inline">
            {e.screenGeom.width}×{e.screenGeom.height}
          </span>
        )}
        <Switch
          checked={e.zoneOverlayVisible}
          disabled={e.editDisabled}
          label="Overlay"
          onChange={e.setZoneOverlayVisible}
        />
        <span className="v2-clicker-zone-toolbar-spacer" />
        <button
          type="button"
          className="v2-btn v2-btn-ghost"
          disabled={e.editDisabled || e.drawing}
          onClick={() => void e.onDrawZone("safety")}
        >
          {e.drawing ? "Glisse LMB…" : "Zone sécurité"}
        </button>
        <button
          type="button"
          className="v2-btn v2-btn-ghost"
          disabled={e.editDisabled || e.drawing}
          onClick={() => void e.onDrawZone("click")}
        >
          Zone clic
        </button>
      </div>
      <div className="screen-preview-frame v2-clicker-zone-frame v2-bg-canvas">
        <div className="screen-preview" style={previewAspectStyle}>
          <ZoneMap
            geom={e.screenGeom}
            model={e.zoneModel}
            editable={!e.editDisabled}
            selectedId={e.selectedZoneId}
            onToggleCorner={(corner) =>
              e.setZoneModel((m) => ({
                ...m,
                corners: { ...m.corners, [corner]: !m.corners[corner] },
              }))
            }
            onToggleEdge={(edge) =>
              e.setZoneModel((m) => ({
                ...m,
                edges: { ...m.edges, [edge]: !m.edges[edge] },
              }))
            }
            onSelectCustom={e.setSelectedZoneId}
            onResizeEdge={(edge, marginPx) =>
              e.setZoneModel((m) => ({
                ...m,
                edgeMargin: { ...m.edgeMargin, [edge]: marginPx },
              }))
            }
            onResizeCorner={(corner, widthPx, heightPx) =>
              e.setZoneModel((m) => ({
                ...m,
                cornerWidth: { ...m.cornerWidth, [corner]: widthPx },
                cornerHeight: { ...m.cornerHeight, [corner]: heightPx },
              }))
            }
            onResizeCustom={(id, next) =>
              e.setZoneModel((m) => ({
                ...m,
                customZones: m.customZones.map((z) => (z.id === id ? next : z)),
              }))
            }
          />
        </div>
      </div>
    </div>
  );
}
