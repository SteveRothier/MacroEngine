import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useT } from "../i18n";
import {
  FALLBACK_SCREEN_GEOM,
  type ClickPoint,
  type ScreenGeomDto,
} from "./clickerTypes";
import { CUSTOM_ZONE_PALETTE } from "./zoneGeom";

export type TargetMode = "cursor" | "fixed" | "sequence";

type Props = {
  geom: ScreenGeomDto;
  mode: TargetMode;
  fixed?: { x: number; y: number } | null;
  points?: ClickPoint[];
  selectedIndex?: number | null;
  editable?: boolean;
  onPlaceFixed?: (x: number, y: number) => void;
  onMovePoint?: (index: number, x: number, y: number) => void;
  onSelectPoint?: (index: number | null) => void;
  /** Right-click on a sequence point (client coords). */
  onPointContextMenu?: (index: number, clientX: number, clientY: number) => void;
  /** Right-click on empty preview (screen coords + client coords). */
  onCanvasContextMenu?: (
    screen: { x: number; y: number },
    clientX: number,
    clientY: number,
  ) => void;
};

function clampToGeom(
  x: number,
  y: number,
  g: ScreenGeomDto,
): { x: number; y: number } {
  return {
    x: Math.round(Math.min(g.x + g.width - 1, Math.max(g.x, x))),
    y: Math.round(Math.min(g.y + g.height - 1, Math.max(g.y, y))),
  };
}

function clientToScreen(
  clientX: number,
  clientY: number,
  el: HTMLElement,
  g: ScreenGeomDto,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  const nx = (clientX - rect.left) / Math.max(1, rect.width);
  const ny = (clientY - rect.top) / Math.max(1, rect.height);
  return clampToGeom(g.x + nx * g.width, g.y + ny * g.height, g);
}

export function TargetMap({
  geom,
  mode,
  fixed,
  points = [],
  selectedIndex = null,
  editable = false,
  onPlaceFixed,
  onMovePoint,
  onSelectPoint,
  onPointContextMenu,
  onCanvasContextMenu,
}: Props) {
  const t = useT();
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    index: number;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    moved: boolean;
  } | null>(null);
  const [liveDrag, setLiveDrag] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const g =
    geom.width > 0 && geom.height > 0 ? geom : FALLBACK_SCREEN_GEOM;
  const aspectStyle = {
    "--preview-w": g.width,
    "--preview-h": g.height,
  } as CSSProperties;

  type Marker = {
    x: number;
    y: number;
    label: string;
    radius?: number;
    index: number;
    color: string;
  };

  const markers: Marker[] = [];
  if (mode === "fixed" && fixed) {
    const live = liveDrag?.index === 0 ? liveDrag : null;
    markers.push({
      x: live?.x ?? fixed.x,
      y: live?.y ?? fixed.y,
      label: "1",
      index: 0,
      color: "#3b82f6",
    });
  } else if (mode === "sequence") {
    points.forEach((p, i) => {
      const live = liveDrag?.index === i ? liveDrag : null;
      markers.push({
        x: live?.x ?? p.x,
        y: live?.y ?? p.y,
        label: String(i + 1),
        radius: p.radius > 0 ? p.radius : undefined,
        index: i,
        color: CUSTOM_ZONE_PALETTE[i % CUSTOM_ZONE_PALETTE.length]!,
      });
    });
  }

  function beginDrag(
    ev: ReactPointerEvent<HTMLElement>,
    index: number,
  ) {
    if (!editable || mode === "cursor") return;
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (mode === "sequence") onSelectPoint?.(index);
    dragRef.current = {
      index,
      pointerId: ev.pointerId,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      moved: false,
    };
    setDragging(true);
    ev.currentTarget.setPointerCapture(ev.pointerId);
  }

  function onMarkerMove(ev: ReactPointerEvent<HTMLElement>) {
    const d = dragRef.current;
    const el = canvasRef.current;
    if (!d || !el || d.pointerId !== ev.pointerId) return;
    if (
      Math.abs(ev.clientX - d.startClientX) +
        Math.abs(ev.clientY - d.startClientY) >
      3
    ) {
      d.moved = true;
    }
    if (!d.moved) return;
    const next = clientToScreen(ev.clientX, ev.clientY, el, g);
    setLiveDrag({ index: d.index, x: next.x, y: next.y });
  }

  function endDrag(ev: ReactPointerEvent<HTMLElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== ev.pointerId) return;
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    }
    const live = liveDrag;
    dragRef.current = null;
    setDragging(false);
    setLiveDrag(null);

    if (!editable) return;

    if (d.moved && live) {
      if (mode === "sequence") {
        onMovePoint?.(live.index, live.x, live.y);
      } else if (mode === "fixed") {
        onPlaceFixed?.(live.x, live.y);
      }
      return;
    }

    if (!d.moved && mode === "sequence") {
      onSelectPoint?.(d.index);
    }
  }

  function onCanvasPointerDown(ev: ReactPointerEvent<HTMLDivElement>) {
    if (!editable || mode !== "sequence") return;
    if (ev.button !== 0) return;
    // Empty canvas click clears selection.
    onSelectPoint?.(null);
  }

  function handleCanvasContextMenu(ev: ReactMouseEvent<HTMLDivElement>) {
    if (!editable) return;
    ev.preventDefault();
    const el = canvasRef.current;
    if (!el) return;
    const screen = clientToScreen(ev.clientX, ev.clientY, el, g);
    onCanvasContextMenu?.(screen, ev.clientX, ev.clientY);
  }

  function onMarkerContextMenu(
    ev: ReactMouseEvent<HTMLElement>,
    index: number,
  ) {
    if (!editable || mode !== "sequence") return;
    ev.preventDefault();
    ev.stopPropagation();
    onSelectPoint?.(index);
    onPointContextMenu?.(index, ev.clientX, ev.clientY);
  }

  return (
    <div className="screen-preview-frame caster-clicker-zone-frame caster-bg-canvas">
      <div className="screen-preview" style={aspectStyle}>
        <div
          ref={canvasRef}
          className={[
            "caster-clicker-target-map-canvas",
            editable && mode !== "cursor" ? "editable" : "",
            dragging ? "dragging" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onPointerDown={onCanvasPointerDown}
          onContextMenu={handleCanvasContextMenu}
        >
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
          {markers.map((m) => {
            const left = ((m.x - g.x) / g.width) * 100;
            const top = ((m.y - g.y) / g.height) * 100;
            const rPct =
              m.radius != null
                ? (m.radius / Math.min(g.width, g.height)) * 100
                : 0;
            const selected =
              mode === "sequence" && selectedIndex === m.index;
            return (
              <span
                key={m.index}
                className={[
                  "caster-clicker-target-marker",
                  selected ? "selected" : "",
                  editable ? "interactive" : "",
                  dragging && liveDrag?.index === m.index ? "dragging" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  left: `${Math.min(100, Math.max(0, left))}%`,
                  top: `${Math.min(100, Math.max(0, top))}%`,
                  ["--target-fill" as string]: m.color,
                }}
                title={`${m.x}, ${m.y}`}
                onPointerDown={(ev) => beginDrag(ev, m.index)}
                onPointerMove={onMarkerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onContextMenu={(ev) => onMarkerContextMenu(ev, m.index)}
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
                <span className="caster-clicker-target-marker-dot">
                  {m.label}
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
