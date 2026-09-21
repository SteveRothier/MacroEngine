import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type {
  Corner,
  CustomZone,
  Edge,
  ScreenGeomDto,
  ZoneKind,
  ZoneSelection,
} from "./clickerTypes";
import { FALLBACK_SCREEN_GEOM, zoneSelectionEquals } from "./clickerTypes";
import { useT } from "../i18n";
import { useGlobalWheelNudge } from "../ui/useGlobalWheelNudge";
import {
  buildZoneBands,
  clamp,
  clampCornerHeight,
  clampCornerWidth,
  clampCustomExtent,
  clampEdgeMargin,
  clientToScreen,
  cornerExtentFromPointer,
  deltaToScreen,
  edgeAxisSize,
  marginFromPreviewPointer,
  moveCustom,
  normalizeRect,
  type ZoneModel,
} from "./zoneGeom";

type Handle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

type PxEdit =
  | { kind: "edge"; edge: Edge }
  | { kind: "corner"; corner: Corner; axis: "w" | "h" }
  | { kind: "custom"; id: string; handle: "n" | "s" | "e" | "w" };

type DragHandle = Handle | "move";

type DragState = {
  startX: number;
  startY: number;
  edge?: Edge;
  edgeMargin?: number;
  corner?: Corner;
  custom?: CustomZone;
  handle?: DragHandle;
};

type LiveDraft =
  | { kind: "edge"; edge: Edge; margin: number }
  | { kind: "corner"; corner: Corner; width: number; height: number }
  | { kind: "custom"; id: string; zone: CustomZone };

const EDGE_HANDLES: Record<Edge, Handle> = {
  left: "e",
  right: "w",
  top: "s",
  bottom: "n",
};

const CORNER_INNER_HANDLES: Record<Corner, Handle[]> = {
  topLeft: ["e", "s", "se"],
  topRight: ["w", "s", "sw"],
  bottomLeft: ["e", "n", "ne"],
  bottomRight: ["w", "n", "nw"],
};

const CUSTOM_EDGE_HIT_PX = 10;
/** Minimum grab size for thin anchored edges/corners (screen-edge strips). */
const MIN_EDGE_HIT_PX = 14;

type Props = {
  geom: ScreenGeomDto;
  model: ZoneModel;
  variant?: "preview" | "overlay";
  editable?: boolean;
  selection?: ZoneSelection | null;
  draftRect?: { x: number; y: number; width: number; height: number } | null;
  /** When set, LMB drag on the map creates a new custom zone. */
  drawingKind?: ZoneKind | null;
  onSelect?: (sel: ZoneSelection) => void;
  onResizeEdge?: (edge: Edge, marginPx: number) => void;
  onResizeCorner?: (corner: Corner, widthPx: number, heightPx: number) => void;
  onResizeCustom?: (id: string, next: CustomZone) => void;
  onDrawComplete?: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  onCancelDraw?: () => void;
  onClearSelection?: () => void;
  onCustomContextMenu?: (id: string, clientX: number, clientY: number) => void;
};

export function ZoneMap({
  geom,
  model,
  variant = "preview",
  editable = false,
  selection = null,
  draftRect = null,
  drawingKind = null,
  onSelect,
  onResizeEdge,
  onResizeCorner,
  onResizeCustom,
  onDrawComplete,
  onCancelDraw,
  onClearSelection,
  onCustomContextMenu,
}: Props) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const drag = useRef<DragState | null>(null);
  const [live, setLive] = useState<LiveDraft | null>(null);
  const pendingRef = useRef<LiveDraft | null>(null);
  const onResizeEdgeRef = useRef(onResizeEdge);
  const onResizeCornerRef = useRef(onResizeCorner);
  const onResizeCustomRef = useRef(onResizeCustom);
  const onDrawCompleteRef = useRef(onDrawComplete);
  const onCancelDrawRef = useRef(onCancelDraw);
  const modelRef = useRef(model);
  const [pxEdit, setPxEdit] = useState<PxEdit | null>(null);
  const [pxDraft, setPxDraft] = useState("");
  const [pxEditAnchor, setPxEditAnchor] = useState<CSSProperties | null>(null);
  const [resizingKey, setResizingKey] = useState<string | null>(null);
  const [resizingHandle, setResizingHandle] = useState<DragHandle | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const drawOrigin = useRef<{ x: number; y: number } | null>(null);
  const [hoverBandCursor, setHoverBandCursor] = useState<string | null>(null);
  const [localDraft, setLocalDraft] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  onResizeEdgeRef.current = onResizeEdge;
  onResizeCornerRef.current = onResizeCorner;
  onResizeCustomRef.current = onResizeCustom;
  onDrawCompleteRef.current = onDrawComplete;
  onCancelDrawRef.current = onCancelDraw;
  modelRef.current = model;

  const paintModel = mergeLive(model, live);
  const effectiveDraft = localDraft ?? draftRect;
  const bands = buildZoneBands(geom, paintModel, effectiveDraft, {
    previewInactive: variant === "preview",
  });
  const canEdit = editable && variant === "preview";
  const isDrawing = canEdit && drawingKind != null;

  useEffect(() => {
    if (pxEdit) inputRef.current?.focus();
  }, [pxEdit]);

  useEffect(() => {
    if (!drawingKind) {
      drawOrigin.current = null;
      setLocalDraft(null);
    }
  }, [drawingKind]);

  useEffect(() => {
    if (!isDrawing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      drawOrigin.current = null;
      setLocalDraft(null);
      onCancelDrawRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDrawing]);

  function screenPointFromClient(clientX: number, clientY: number) {
    const el = rootRef.current;
    if (!el) return { x: geom.x, y: geom.y };
    return clientToScreen(clientX, clientY, el.getBoundingClientRect(), geom);
  }

  function onDrawPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isDrawing || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const p = screenPointFromClient(e.clientX, e.clientY);
    drawOrigin.current = p;
    setLocalDraft({ x: p.x, y: p.y, width: 1, height: 1 });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onDrawPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isDrawing || !drawOrigin.current) return;
    const p = screenPointFromClient(e.clientX, e.clientY);
    setLocalDraft(
      normalizeRect(
        drawOrigin.current.x,
        drawOrigin.current.y,
        p.x,
        p.y,
      ),
    );
  }

  function onDrawPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isDrawing || !drawOrigin.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const p = screenPointFromClient(e.clientX, e.clientY);
    const rect = normalizeRect(
      drawOrigin.current.x,
      drawOrigin.current.y,
      p.x,
      p.y,
    );
    drawOrigin.current = null;
    setLocalDraft(null);
    if (rect.width < 8 || rect.height < 8) {
      onCancelDrawRef.current?.();
      return;
    }
    onDrawCompleteRef.current?.(rect);
  }

  function onDrawContextMenu(e: ReactMouseEvent<HTMLDivElement>) {
    if (!isDrawing) return;
    e.preventDefault();
    drawOrigin.current = null;
    setLocalDraft(null);
    onCancelDrawRef.current?.();
  }

  function commitPx() {
    if (!pxEdit) return;
    applyPxValue(pxDraft);
    setPxEdit(null);
    setPxEditAnchor(null);
    setLive(null);
  }

  function applyPxValue(raw: string) {
    if (!pxEdit) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || raw.trim() === "") return;
    let next: LiveDraft;
    if (pxEdit.kind === "edge") {
      next = {
        kind: "edge",
        edge: pxEdit.edge,
        margin: clampEdgeMargin(pxEdit.edge, n, geom),
      };
    } else if (pxEdit.kind === "corner") {
      const w = paintModel.cornerWidth[pxEdit.corner];
      const h = paintModel.cornerHeight[pxEdit.corner];
      next = {
        kind: "corner",
        corner: pxEdit.corner,
        width:
          pxEdit.axis === "w" ? clampCornerWidth(n, geom) : w,
        height:
          pxEdit.axis === "h" ? clampCornerHeight(n, geom) : h,
      };
    } else {
      const z = paintModel.customZones.find((c) => c.id === pxEdit.id);
      if (!z) return;
      next = {
        kind: "custom",
        id: pxEdit.id,
        zone: applyCustomPx(z, pxEdit.handle, n, geom),
      };
    }
    setLive(next);
    flushParent(next);
  }

  function nudgeSelected(delta: number, shiftKey: boolean) {
    if (!selection || !canEdit || isDrawing) return;
    const m = paintModel;
    let next: LiveDraft | null = null;
    let draftStr: string | null = null;
    if (selection.kind === "edge" && m.edges[selection.id]) {
      const margin = clampEdgeMargin(
        selection.id,
        m.edgeMargin[selection.id] + delta,
        geom,
      );
      next = { kind: "edge", edge: selection.id, margin };
      draftStr = String(margin);
    } else if (selection.kind === "corner" && m.corners[selection.id]) {
      if (shiftKey) {
        const height = clampCornerHeight(
          m.cornerHeight[selection.id] + delta,
          geom,
        );
        next = {
          kind: "corner",
          corner: selection.id,
          width: m.cornerWidth[selection.id],
          height,
        };
        draftStr = String(height);
      } else {
        const width = clampCornerWidth(
          m.cornerWidth[selection.id] + delta,
          geom,
        );
        next = {
          kind: "corner",
          corner: selection.id,
          width,
          height: m.cornerHeight[selection.id],
        };
        draftStr = String(width);
      }
    } else if (selection.kind === "custom") {
      const z = m.customZones.find((c) => c.id === selection.id);
      if (!z) return;
      const zone = shiftKey
        ? clampCustomExtent(z, { height: z.height + delta }, geom)
        : clampCustomExtent(z, { width: z.width + delta }, geom);
      next = { kind: "custom", id: z.id, zone };
      draftStr = String(shiftKey ? zone.height : zone.width);
    }
    if (!next) return;
    setLive(next);
    flushParent(next);
    if (pxEdit && draftStr != null) setPxDraft(draftStr);
  }

  function onMapWheel(e: ReactWheelEvent<HTMLDivElement>) {
    if (!canEdit || isDrawing || !selection) return;
    e.preventDefault();
    e.stopPropagation();
    const step = e.altKey ? 1 : e.shiftKey ? 10 : 1;
    const delta = e.deltaY < 0 ? step : -step;
    // Prefer the open px-edit axis; otherwise Ctrl/Cmd switches W↔H.
    const axisAlt =
      pxEdit?.kind === "corner"
        ? pxEdit.axis === "h"
        : pxEdit?.kind === "custom"
          ? pxEdit.handle === "n" || pxEdit.handle === "s"
          : e.ctrlKey || e.metaKey;
    nudgeSelected(delta, axisAlt);
  }

  useGlobalWheelNudge(!!pxEdit && canEdit && !isDrawing, (delta, ev) => {
    const axisAlt =
      pxEdit?.kind === "corner"
        ? pxEdit.axis === "h"
        : pxEdit?.kind === "custom"
          ? pxEdit.handle === "n" || pxEdit.handle === "s"
          : ev.ctrlKey || ev.metaKey;
    nudgeSelected(delta, axisAlt);
  });

  function flushParent(next: LiveDraft) {
    if (next.kind === "edge") {
      onResizeEdgeRef.current?.(next.edge, next.margin);
    } else if (next.kind === "corner") {
      onResizeCornerRef.current?.(next.corner, next.width, next.height);
    } else {
      onResizeCustomRef.current?.(next.id, next.zone);
    }
  }

  /** Keep latest draft for commit on pointerup — no parent notify during drag. */
  function trackPending(next: LiveDraft) {
    pendingRef.current = next;
  }

  function onHandleDown(
    e: ReactPointerEvent<HTMLElement>,
    opts: {
      edge?: Edge;
      corner?: Corner;
      custom?: CustomZone;
      handle: DragHandle;
      bandKey: string;
    },
  ) {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    dragged.current = false;
    setResizingKey(opts.bandKey);
    setResizingHandle(opts.handle);
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      edge: opts.edge,
      edgeMargin: opts.edge ? model.edgeMargin[opts.edge] : undefined,
      corner: opts.corner,
      custom: opts.custom ? { ...opts.custom } : undefined,
      handle: opts.handle,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onHandleMove(e: ReactPointerEvent<HTMLElement>) {
    const d = drag.current;
    const el = rootRef.current;
    if (!d || !el) return;
    const rect = el.getBoundingClientRect();
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 3) {
      dragged.current = true;
    }
    let next: LiveDraft | null = null;
    if (d.edge != null) {
      if (variant === "preview") {
        next = {
          kind: "edge",
          edge: d.edge,
          margin: marginFromPreviewPointer(
            d.edge,
            e.clientX,
            e.clientY,
            rect,
            geom,
          ),
        };
      } else if (d.edgeMargin != null) {
        const { dx, dy } = deltaToScreen(
          e.clientX - d.startX,
          e.clientY - d.startY,
          rect,
          geom,
        );
        next = {
          kind: "edge",
          edge: d.edge,
          margin: marginFromDelta(d.edge, d.edgeMargin, dx, dy, geom),
        };
      }
    } else if (d.corner != null && d.handle && d.handle !== "move") {
      const m = modelRef.current;
      const { w, h } = cornerExtentFromPointer(
        d.corner,
        d.handle,
        e.clientX,
        e.clientY,
        rect,
        geom,
        m.cornerWidth[d.corner],
        m.cornerHeight[d.corner],
      );
      next = { kind: "corner", corner: d.corner, width: w, height: h };
    } else if (d.custom && d.handle === "move") {
      const { dx, dy } = deltaToScreen(
        e.clientX - d.startX,
        e.clientY - d.startY,
        rect,
        geom,
      );
      next = {
        kind: "custom",
        id: d.custom.id,
        zone: moveCustom(d.custom, dx, dy, geom),
      };
    } else if (d.custom && d.handle && d.handle !== "move") {
      const { dx, dy } = deltaToScreen(
        e.clientX - d.startX,
        e.clientY - d.startY,
        rect,
        geom,
      );
      next = {
        kind: "custom",
        id: d.custom.id,
        zone: resizeCustom(d.custom, d.handle, dx, dy, geom),
      };
    }
    if (!next) return;
    setLive(next);
    trackPending(next);
  }

  function onHandleUp(e: ReactPointerEvent<HTMLElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const pending = pendingRef.current;
    if (pending) {
      flushParent(pending);
      pendingRef.current = null;
    }
    drag.current = null;
    setLive(null);
    setResizingKey(null);
    setResizingHandle(null);
  }

  function openPxEdit(next: PxEdit) {
    if (next.kind === "edge") {
      setPxDraft(String(model.edgeMargin[next.edge]));
    } else if (next.kind === "corner") {
      setPxDraft(
        String(
          next.axis === "w"
            ? model.cornerWidth[next.corner]
            : model.cornerHeight[next.corner],
        ),
      );
    } else {
      const z = model.customZones.find((c) => c.id === next.id);
      setPxDraft(z ? String(customPxValue(z, next.handle)) : "");
    }
    // Freeze position so live resize doesn't shift the form (décalage).
    setPxEditAnchor(stablePxEditStyle(next, bands));
    setPxEdit(next);
  }

  return (
    <div
      ref={rootRef}
      className={[
        "zone-map",
        `zone-map-${variant}`,
        isDrawing ? "is-drawing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerDown={isDrawing ? onDrawPointerDown : undefined}
      onPointerMove={isDrawing ? onDrawPointerMove : undefined}
      onPointerUp={isDrawing ? onDrawPointerUp : undefined}
      onPointerCancel={isDrawing ? onDrawPointerUp : undefined}
      onContextMenu={isDrawing ? onDrawContextMenu : undefined}
      onWheel={canEdit && !isDrawing ? onMapWheel : undefined}
      onClick={(e) => {
        if (isDrawing || !canEdit) return;
        const target = e.target as HTMLElement;
        if (target.closest(".zone-band")) return;
        if (target.closest(".zone-px-edit")) return;
        onClearSelection?.();
      }}
    >
      {bands.map((band) => {
        const selected =
          (band.kind === "custom" ||
            band.kind === "edge" ||
            band.kind === "corner") &&
          zoneSelectionEquals(selection, {
            kind: band.kind,
            id: band.id,
          } as ZoneSelection);
        const showFill =
          band.kind === "corner"
            ? paintModel.corners[band.id as Corner]
            : band.kind === "edge"
              ? paintModel.edges[band.id as Edge]
              : true;
        const previewHit =
          variant === "preview" &&
          (band.kind === "corner" || band.kind === "edge") &&
          !showFill;
        const flushW = band.left <= 0.4;
        const flushN = band.top <= 0.4;
        const flushE = band.left + band.width >= 99.6;
        const flushS = band.top + band.height >= 99.6;
        // If placing the label outside the band would leave the map, keep it inside.
        const spaceBelow = 100 - (band.top + band.height);
        const spaceAbove = band.top;
        const spaceRight = 100 - (band.left + band.width);
        const spaceLeft = band.left;
        const LABEL_SPACE_PCT = 4;
        let labelInside: "n" | "s" | "e" | "w" | null = null;
        if (band.kind === "edge") {
          if (band.id === "top" && spaceBelow < LABEL_SPACE_PCT) labelInside = "s";
          if (band.id === "bottom" && spaceAbove < LABEL_SPACE_PCT) labelInside = "n";
          if (band.id === "left" && spaceRight < LABEL_SPACE_PCT) labelInside = "e";
          if (band.id === "right" && spaceLeft < LABEL_SPACE_PCT) labelInside = "w";
        }
        const showResizeChrome =
          canEdit && selected && showFill && !isDrawing;
        const bandCursor =
          showResizeChrome
            ? resizingKey === band.key && resizingHandle
              ? cursorForHandle(resizingHandle)
              : (hoverBandCursor ?? undefined)
            : undefined;

        function resolveResizeHandle(
          clientX: number,
          clientY: number,
          el: HTMLElement,
        ): DragHandle | null {
          if (band.kind === "custom") {
            return hitBandHandle(clientX, clientY, el);
          }
          if (band.kind === "edge") {
            return hitAnchoredEdge(
              band.id as Edge,
              clientX,
              clientY,
              el,
            );
          }
          if (band.kind === "corner") {
            return hitAnchoredCorner(
              band.id as Corner,
              clientX,
              clientY,
              el,
            );
          }
          return null;
        }

        return (
          <div
            key={band.key}
            className={[
              "zone-band",
              `zone-${band.kind}`,
              previewHit ? "" : `zone-action-${band.action}`,
              showFill ? "on" : "",
              selected ? "selected" : "",
              resizingKey === band.key ? "is-resizing" : "",
              canEdit && band.kind === "custom" && selected
                ? "is-movable"
                : "",
              flushW ? "is-flush-w" : "",
              flushE ? "is-flush-e" : "",
              flushN ? "is-flush-n" : "",
              flushS ? "is-flush-s" : "",
              labelInside ? `label-inside-${labelInside}` : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              left: `${band.left}%`,
              top: `${band.top}%`,
              width: `${band.width}%`,
              height: `${band.height}%`,
              ...(bandCursor ? { cursor: bandCursor } : {}),
              ...(band.color
                ? ({ ["--zone-fill"]: band.color } as CSSProperties)
                : {}),
            }}
            onPointerDown={(e) => {
              if (isDrawing || !canEdit || !selected || !showFill) return;
              const handle = resolveResizeHandle(
                e.clientX,
                e.clientY,
                e.currentTarget,
              );
              if (!handle) return;
              if (band.kind === "custom") {
                const z = model.customZones.find((c) => c.id === band.id);
                if (!z) return;
                onHandleDown(e, {
                  custom: z,
                  handle,
                  bandKey: band.key,
                });
                return;
              }
              if (band.kind === "edge") {
                onHandleDown(e, {
                  edge: band.id as Edge,
                  handle,
                  bandKey: band.key,
                });
                return;
              }
              if (band.kind === "corner") {
                onHandleDown(e, {
                  corner: band.id as Corner,
                  handle,
                  bandKey: band.key,
                });
              }
            }}
            onPointerMove={(e) => {
              if (isDrawing) return;
              if (drag.current) {
                onHandleMove(e);
                return;
              }
              if (!showResizeChrome) return;
              const h = resolveResizeHandle(
                e.clientX,
                e.clientY,
                e.currentTarget,
              );
              setHoverBandCursor(h ? cursorForHandle(h) : "default");
            }}
            onPointerLeave={() => {
              if (!drag.current) setHoverBandCursor(null);
            }}
            onPointerUp={isDrawing ? undefined : onHandleUp}
            onPointerCancel={isDrawing ? undefined : onHandleUp}
            onDoubleClick={(e) => {
              if (isDrawing || !canEdit || !selected || !showFill) return;
              const h = resolveResizeHandle(
                e.clientX,
                e.clientY,
                e.currentTarget,
              );
              if (!h || h === "move") return;
              e.preventDefault();
              e.stopPropagation();
              if (band.kind === "edge") {
                openPxEdit({ kind: "edge", edge: band.id as Edge });
                return;
              }
              if (band.kind === "corner") {
                const axis: "w" | "h" =
                  h === "n" || h === "s" ? "h" : "w";
                openPxEdit({
                  kind: "corner",
                  corner: band.id as Corner,
                  axis,
                });
                return;
              }
              if (
                band.kind === "custom" &&
                (h === "n" || h === "s" || h === "e" || h === "w")
              ) {
                openPxEdit({
                  kind: "custom",
                  id: band.id,
                  handle: h,
                });
              }
            }}
            onClick={(e) => {
              if (isDrawing) return;
              if (dragged.current) {
                dragged.current = false;
                return;
              }
              if (!canEdit) return;
              e.stopPropagation();
              if (band.kind === "corner") {
                onSelect?.({ kind: "corner", id: band.id as Corner });
                return;
              }
              if (band.kind === "edge") {
                onSelect?.({ kind: "edge", id: band.id as Edge });
                return;
              }
              if (band.kind === "custom") {
                onSelect?.({ kind: "custom", id: band.id });
              }
            }}
            onContextMenu={(e) => {
              if (isDrawing || !canEdit || band.kind !== "custom") return;
              e.preventDefault();
              e.stopPropagation();
              if (!selected) {
                onSelect?.({ kind: "custom", id: band.id });
                return;
              }
              onCustomContextMenu?.(band.id, e.clientX, e.clientY);
            }}
            role={canEdit && !isDrawing ? "button" : undefined}
            tabIndex={canEdit && !isDrawing ? 0 : undefined}
            aria-label={
              band.kind === "corner"
                ? t("clicker.zones.cornerAria", {
                    id: band.id,
                    active: showFill ? t("clicker.zones.activeSuffix") : "",
                  })
                : band.kind === "edge"
                  ? t("clicker.zones.edgeAria", {
                      id: band.id,
                      active: showFill ? t("clicker.zones.activeSuffix") : "",
                    })
                  : t("clicker.zones.customAria", { id: band.id })
            }
            aria-pressed={
              canEdit && (band.kind === "corner" || band.kind === "edge")
                ? showFill
                : undefined
            }
          >
            {(band.kind === "edge" || band.kind === "corner") && canEdit ? (
              <div className="zone-hit-extend" aria-hidden />
            ) : null}
            {selected && showFill ? (
              <span className="zone-xy" aria-hidden>
                {band.kind === "custom"
                  ? (() => {
                      const z = paintModel.customZones.find(
                        (c) => c.id === band.id,
                      );
                      return z
                        ? `${z.x},${z.y} · ${z.width}×${z.height}`
                        : null;
                    })()
                  : band.kind === "edge"
                    ? `${paintModel.edgeMargin[band.id as Edge]}px`
                    : `${paintModel.cornerWidth[band.id as Corner]}×${paintModel.cornerHeight[band.id as Corner]}`}
              </span>
            ) : null}
          </div>
        );
      })}
      {variant === "overlay" ? (
        <div className="zone-map-cross" aria-hidden />
      ) : null}
      {pxEdit && canEdit && !isDrawing ? (
        <form
          className="zone-px-edit"
          style={pxEditAnchor ?? undefined}
          onSubmit={(e) => {
            e.preventDefault();
            commitPx();
          }}
          onWheel={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const step = e.altKey ? 1 : e.shiftKey ? 10 : 1;
            const delta = e.deltaY < 0 ? step : -step;
            const axisAlt =
              pxEdit.kind === "corner"
                ? pxEdit.axis === "h"
                : pxEdit.kind === "custom"
                  ? pxEdit.handle === "n" || pxEdit.handle === "s"
                  : e.ctrlKey || e.metaKey;
            nudgeSelected(delta, axisAlt);
          }}
        >
          <input
            ref={inputRef}
            type="number"
            min={1}
            max={
              pxEdit.kind === "edge"
                ? edgeAxisSize(pxEdit.edge, geom)
                : pxEdit.kind === "corner"
                  ? pxEdit.axis === "w"
                    ? geom.width
                    : geom.height
                  : undefined
            }
            value={pxDraft}
            aria-label={t("clicker.zones.resizeAria")}
            onChange={(e) => {
              setPxDraft(e.target.value);
              applyPxValue(e.target.value);
            }}
            onBlur={commitPx}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setPxEdit(null);
                setPxEditAnchor(null);
              }
            }}
          />
          <span>px</span>
        </form>
      ) : null}
    </div>
  );
}

function mergeLive(model: ZoneModel, live: LiveDraft | null): ZoneModel {
  if (!live) return model;
  if (live.kind === "edge") {
    return {
      ...model,
      edgeMargin: { ...model.edgeMargin, [live.edge]: live.margin },
    };
  }
  if (live.kind === "corner") {
    return {
      ...model,
      cornerWidth: { ...model.cornerWidth, [live.corner]: live.width },
      cornerHeight: { ...model.cornerHeight, [live.corner]: live.height },
    };
  }
  return {
    ...model,
    customZones: model.customZones.map((z) =>
      z.id === live.id ? live.zone : z,
    ),
  };
}

function hitBandHandle(
  clientX: number,
  clientY: number,
  el: HTMLElement,
): DragHandle {
  const r = el.getBoundingClientRect();
  const x = clientX - r.left;
  const y = clientY - r.top;
  const w = Math.max(1, r.width);
  const h = Math.max(1, r.height);
  const edge = Math.max(
    4,
    Math.min(CUSTOM_EDGE_HIT_PX, Math.floor(Math.min(w, h) / 3) || CUSTOM_EDGE_HIT_PX),
  );
  const nearL = x <= edge;
  const nearR = x >= w - edge;
  const nearT = y <= edge;
  const nearB = y >= h - edge;
  if (nearT && nearL) return "nw";
  if (nearT && nearR) return "ne";
  if (nearB && nearL) return "sw";
  if (nearB && nearR) return "se";
  if (nearT) return "n";
  if (nearB) return "s";
  if (nearL) return "w";
  if (nearR) return "e";
  return "move";
}

/** Inflate a thin screen-edge strip toward the display interior for grab. */
function hitAnchoredEdge(
  edge: Edge,
  clientX: number,
  clientY: number,
  el: HTMLElement,
): Handle | null {
  const r = el.getBoundingClientRect();
  let left = r.left;
  let right = r.right;
  let top = r.top;
  let bottom = r.bottom;
  if (edge === "left") right = Math.max(right, left + MIN_EDGE_HIT_PX);
  if (edge === "right") left = Math.min(left, right - MIN_EDGE_HIT_PX);
  if (edge === "top") bottom = Math.max(bottom, top + MIN_EDGE_HIT_PX);
  if (edge === "bottom") top = Math.min(top, bottom - MIN_EDGE_HIT_PX);
  if (
    clientX < left ||
    clientX > right ||
    clientY < top ||
    clientY > bottom
  ) {
    return null;
  }
  return EDGE_HANDLES[edge];
}

/** Inflate a corner rect inward so inner handles stay grabbable when tiny. */
function hitAnchoredCorner(
  corner: Corner,
  clientX: number,
  clientY: number,
  el: HTMLElement,
): DragHandle | null {
  const r = el.getBoundingClientRect();
  let left = r.left;
  let right = r.right;
  let top = r.top;
  let bottom = r.bottom;
  if (corner === "topLeft" || corner === "bottomLeft") {
    right = Math.max(right, left + MIN_EDGE_HIT_PX);
  } else {
    left = Math.min(left, right - MIN_EDGE_HIT_PX);
  }
  if (corner === "topLeft" || corner === "topRight") {
    bottom = Math.max(bottom, top + MIN_EDGE_HIT_PX);
  } else {
    top = Math.min(top, bottom - MIN_EDGE_HIT_PX);
  }
  if (
    clientX < left ||
    clientX > right ||
    clientY < top ||
    clientY > bottom
  ) {
    return null;
  }
  const w = Math.max(1, right - left);
  const h = Math.max(1, bottom - top);
  const x = clientX - left;
  const y = clientY - top;
  const edge = Math.max(
    4,
    Math.min(CUSTOM_EDGE_HIT_PX, Math.floor(Math.min(w, h) / 3) || CUSTOM_EDGE_HIT_PX),
  );
  const nearL = x <= edge;
  const nearR = x >= w - edge;
  const nearT = y <= edge;
  const nearB = y >= h - edge;
  let raw: DragHandle = "move";
  if (nearT && nearL) raw = "nw";
  else if (nearT && nearR) raw = "ne";
  else if (nearB && nearL) raw = "sw";
  else if (nearB && nearR) raw = "se";
  else if (nearT) raw = "n";
  else if (nearB) raw = "s";
  else if (nearL) raw = "w";
  else if (nearR) raw = "e";
  if (raw === "move") return null;
  return CORNER_INNER_HANDLES[corner].includes(raw as Handle) ? raw : null;
}

function cursorForHandle(handle: DragHandle): string {
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  if (handle === "nw" || handle === "se") return "nwse-resize";
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  return "move";
}

function marginFromDelta(
  edge: Edge,
  start: number,
  dx: number,
  dy: number,
  geom: ScreenGeomDto,
) {
  let next = start;
  if (edge === "left") next = start + dx;
  if (edge === "right") next = start - dx;
  if (edge === "top") next = start + dy;
  if (edge === "bottom") next = start - dy;
  return clampEdgeMargin(edge, next, geom);
}

function resizeCustom(
  z: CustomZone,
  handle: Handle,
  dx: number,
  dy: number,
  geom: ScreenGeomDto,
): CustomZone {
  let { x, y, width, height } = z;
  const right = x + width;
  const bottom = y + height;
  if (handle.includes("w")) x = Math.round(x + dx);
  if (handle.includes("e")) width = Math.round(width + dx);
  if (handle.includes("n")) y = Math.round(y + dy);
  if (handle.includes("s")) height = Math.round(height + dy);
  if (handle.includes("w")) width = right - x;
  if (handle.includes("n")) height = bottom - y;
  if (width < 8) {
    if (handle.includes("w")) x = right - 8;
    width = 8;
  }
  if (height < 8) {
    if (handle.includes("n")) y = bottom - 8;
    height = 8;
  }

  const g = geom.width > 0 && geom.height > 0 ? geom : FALLBACK_SCREEN_GEOM;
  const maxX = g.x + g.width;
  const maxY = g.y + g.height;

  if (handle.includes("w")) {
    x = clamp(x, g.x, right - 8);
    width = right - x;
  }
  if (handle.includes("e")) {
    width = clamp(width, 8, Math.max(8, maxX - x));
  }
  if (handle.includes("n")) {
    y = clamp(y, g.y, bottom - 8);
    height = bottom - y;
  }
  if (handle.includes("s")) {
    height = clamp(height, 8, Math.max(8, maxY - y));
  }

  // Catch any remaining overhang (e.g. zone started outside the display).
  if (x < g.x) {
    width = Math.max(8, width - (g.x - x));
    x = g.x;
  }
  if (y < g.y) {
    height = Math.max(8, height - (g.y - y));
    y = g.y;
  }
  if (x + width > maxX) width = Math.max(8, maxX - x);
  if (y + height > maxY) height = Math.max(8, maxY - y);

  return { ...z, x, y, width, height };
}

function customPxValue(z: CustomZone, handle: "n" | "s" | "e" | "w") {
  if (handle === "e") return z.width;
  if (handle === "w") return z.x;
  if (handle === "s") return z.height;
  return z.y;
}

function applyCustomPx(
  z: CustomZone,
  handle: "n" | "s" | "e" | "w",
  value: number,
  geom: ScreenGeomDto,
): CustomZone {
  const v = Math.round(value);
  const g = geom.width > 0 && geom.height > 0 ? geom : FALLBACK_SCREEN_GEOM;
  const right = z.x + z.width;
  const bottom = z.y + z.height;
  if (handle === "e") {
    return { ...z, width: clamp(v, 8, Math.max(8, g.x + g.width - z.x)) };
  }
  if (handle === "w") {
    const x = clamp(v, g.x, right - 8);
    return { ...z, x, width: right - x };
  }
  if (handle === "s") {
    return { ...z, height: clamp(v, 8, Math.max(8, g.y + g.height - z.y)) };
  }
  const y = clamp(v, g.y, bottom - 8);
  return { ...z, y, height: bottom - y };
}

function stablePxEditStyle(
  edit: PxEdit,
  bands: { kind: string; id: string; left: number; top: number; width: number; height: number }[],
): CSSProperties {
  const band =
    edit.kind === "edge"
      ? bands.find((b) => b.kind === "edge" && b.id === edit.edge)
      : edit.kind === "corner"
        ? bands.find((b) => b.kind === "corner" && b.id === edit.corner)
        : bands.find((b) => b.kind === "custom" && b.id === edit.id);
  if (!band) return { left: "50%", top: "50%" };
  let left = band.left + band.width / 2;
  let top = band.top + band.height / 2;
  if (edit.kind === "edge") {
    if (edit.edge === "left") left = band.left + band.width;
    if (edit.edge === "right") left = band.left;
    if (edit.edge === "top") top = band.top + band.height;
    if (edit.edge === "bottom") top = band.top;
  } else if (edit.kind === "corner") {
    if (edit.corner === "topLeft") {
      left = band.left + band.width;
      top = band.top + band.height;
    }
    if (edit.corner === "topRight") {
      left = band.left;
      top = band.top + band.height;
    }
    if (edit.corner === "bottomLeft") {
      left = band.left + band.width;
      top = band.top;
    }
    if (edit.corner === "bottomRight") {
      left = band.left;
      top = band.top;
    }
  }
  // Keep the form on-screen despite translate(-50%, -50%).
  left = Math.min(92, Math.max(8, left));
  top = Math.min(92, Math.max(8, top));
  return { left: `${left}%`, top: `${top}%` };
}
