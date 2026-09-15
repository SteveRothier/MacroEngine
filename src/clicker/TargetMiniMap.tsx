import type { CSSProperties } from "react";
import { useT } from "../i18n";
import {
  FALLBACK_SCREEN_GEOM,
  type ClickPoint,
  type ScreenGeomDto,
} from "./clickerTypes";

type Marker = { x: number; y: number; label: string; radius?: number };

type Props = {
  geom: ScreenGeomDto;
  mode: "cursor" | "fixed" | "sequence";
  fixed?: { x: number; y: number } | null;
  points?: ClickPoint[];
};

export function TargetMiniMap({ geom, mode, fixed, points = [] }: Props) {
  const t = useT();
  const g =
    geom.width > 0 && geom.height > 0 ? geom : FALLBACK_SCREEN_GEOM;
  const aspectStyle = {
    "--preview-w": g.width,
    "--preview-h": g.height,
  } as CSSProperties;

  const markers: Marker[] = [];
  if (mode === "fixed" && fixed) {
    markers.push({ x: fixed.x, y: fixed.y, label: "1" });
  } else if (mode === "sequence") {
    points.forEach((p, i) => {
      markers.push({
        x: p.x,
        y: p.y,
        label: String(i + 1),
        radius: p.radius > 0 ? p.radius : undefined,
      });
    });
  }

  return (
    <div className="caster-clicker-target-minimap">
      <div className="caster-clicker-target-minimap-head">
        <span>{t("clicker.target.preview")}</span>
        <span className="caster-clicker-hint-inline">
          {g.width}×{g.height}
        </span>
      </div>
      <div className="screen-preview-frame caster-clicker-target-minimap-frame">
        <div className="screen-preview" style={aspectStyle}>
          <div className="caster-clicker-target-minimap-canvas" aria-hidden>
            {mode === "cursor" && markers.length === 0 ? (
              <span className="caster-clicker-target-minimap-hint">
                {t("clicker.target.liveCursor")}
              </span>
            ) : null}
            {markers.length === 0 && mode !== "cursor" ? (
              <span className="caster-clicker-target-minimap-hint">
                {t("clicker.target.noPoint")}
              </span>
            ) : null}
            {markers.map((m, i) => {
              const left = ((m.x - g.x) / g.width) * 100;
              const top = ((m.y - g.y) / g.height) * 100;
              const rPct =
                m.radius != null
                  ? (m.radius / Math.min(g.width, g.height)) * 100
                  : 0;
              return (
                <span
                  key={i}
                  className="caster-clicker-target-marker"
                  style={{
                    left: `${Math.min(100, Math.max(0, left))}%`,
                    top: `${Math.min(100, Math.max(0, top))}%`,
                  }}
                  title={`${m.x}, ${m.y}`}
                >
                  {rPct > 0 ? (
                    <span
                      className="caster-clicker-target-marker-radius"
                      style={{
                        width: `${rPct * 2}%`,
                        height: `${rPct * 2}%`,
                      }}
                    />
                  ) : null}
                  <span className="caster-clicker-target-marker-dot">{m.label}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
