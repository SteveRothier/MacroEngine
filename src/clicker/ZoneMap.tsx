import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Corner, CustomZone, Edge, ScreenGeomDto } from "./clickerTypes";
import {
  buildZoneBands,
  clamp,
  clampCornerHeight,
  clampCornerWidth,
  clampEdgeMargin,
  cornerExtentFromPointer,
  deltaToScreen,
  marginFromPreviewPointer,
  moveCustom,
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

const CUSTOM_HANDLES: Handle[] = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];

type Props = {
  geom: ScreenGeomDto;
  model: ZoneModel;
  variant?: "preview" | "overlay";
  editable?: boolean;
  selectedId?: string | null;
  draftRect?: { x: number; y: number; width: number; height: number } | null;
  onToggleCorner?: (corner: Corner) => void;
  onToggleEdge?: (edge: Edge) => void;
  onSelectCustom?: (id: string) => void;
  onResizeEdge?: (edge: Edge, marginPx: number) => void;
  onResizeCorner?: (corner: Corner, widthPx: number, heightPx: number) => void;
  onResizeCustom?: (id: string, next: CustomZone) => void;
  onLiveModel?: (model: ZoneModel) => void;
};

export function ZoneMap({
  geom,
  model,
  variant = "preview",
  editable = false,
  selectedId = null,
  draftRect = null,
  onToggleCorner,
  onToggleEdge,
  onSelectCustom,
  onResizeEdge,
  onResizeCorner,
  onResizeCustom,
  onLiveModel,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const drag = useRef<DragState | null>(null);
  const [live, setLive] = useState<LiveDraft | null>(null);
  const pendingRef = useRef<LiveDraft | null>(null);
  const rafRef = useRef(0);
  const onResizeEdgeRef = useRef(onResizeEdge);
  const onResizeCornerRef = useRef(onResizeCorner);
  const onResizeCustomRef = useRef(onResizeCustom);
  const onLiveModelRef = useRef(onLiveModel);
  const modelRef = useRef(model);
  const [pxEdit, setPxEdit] = useState<PxEdit | null>(null);
  const [pxDraft, setPxDraft] = useState("");
  const [resizingKey, setResizingKey] = useState<string | null>(null);
  const [resizingHandle, setResizingHandle] = useState<DragHandle | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  onResizeEdgeRef.current = onResizeEdge;
  onResizeCornerRef.current = onResizeCorner;
  onResizeCustomRef.current = onResizeCustom;
  onLiveModelRef.current = onLiveModel;
  modelRef.current = model;

  const paintModel = mergeLive(model, live);
  const bands = buildZoneBands(geom, paintModel, draftRect, {
    previewInactive: variant === "preview",
  });
  const canEdit = editable && variant === "preview";

  useEffect(() => {
    if (pxEdit) inputRef.current?.focus();
  }, [pxEdit]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function commitPx() {
    if (!pxEdit) return;
    applyPxValue(pxDraft);
    setPxEdit(null);
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
    onLiveModelRef.current?.(mergeLive(modelRef.current, next));
  }

  function flushParent(next: LiveDraft) {
    if (next.kind === "edge") {
      onResizeEdgeRef.current?.(next.edge, next.margin);
    } else if (next.kind === "corner") {
      onResizeCornerRef.current?.(next.corner, next.width, next.height);
    } else {
      onResizeCustomRef.current?.(next.id, next.zone);
    }
  }

  function scheduleLive(next: LiveDraft) {
    pendingRef.current = next;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const p = pendingRef.current;
      if (!p) return;
      onLiveModelRef.current?.(mergeLive(modelRef.current, p));
    });
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
        zone: resizeCustom(d.custom, d.handle, dx, dy),
      };
    }
    if (!next) return;
    setLive(next);
    scheduleLive(next);
  }

  function onHandleUp(e: ReactPointerEvent<HTMLElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    const pending = pendingRef.current;
    if (pending) {
      const merged = mergeLive(modelRef.current, pending);
      onLiveModelRef.current?.(merged);
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
    setPxEdit(next);
  }

  return (
    <div
      ref={rootRef}
      className={["zone-map", `zone-map-${variant}`].join(" ")}
    >
      {bands.map((band) => {
        const selected = band.kind === "custom" && band.id === selectedId;
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
              canEdit && band.kind === "custom" ? "is-movable" : "",
              flushW ? "is-flush-w" : "",
              flushE ? "is-flush-e" : "",
              flushN ? "is-flush-n" : "",
              flushS ? "is-flush-s" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              left: `${band.left}%`,
              top: `${band.top}%`,
              width: `${band.width}%`,
              height: `${band.height}%`,
              ...(band.color ? ({ ["--zone-fill"]: band.color } as CSSProperties) : {}),
            }}
            onPointerDown={(e) => {
              if (!canEdit || band.kind !== "custom") return;
              if ((e.target as HTMLElement).closest(".zone-handle")) return;
              const z = model.customZones.find((c) => c.id === band.id);
              if (!z) return;
              onHandleDown(e, {
                custom: z,
                handle: "move",
                bandKey: band.key,
              });
            }}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            onClick={(e) => {
              if (dragged.current) {
                dragged.current = false;
                return;
              }
              if (!canEdit) return;
              e.stopPropagation();
              if (band.kind === "corner") onToggleCorner?.(band.id as Corner);
              if (band.kind === "edge") onToggleEdge?.(band.id as Edge);
              if (band.kind === "custom") onSelectCustom?.(band.id);
            }}
            role={canEdit ? "button" : undefined}
            tabIndex={canEdit ? 0 : undefined}
            aria-label={
              band.kind === "corner"
                ? `Zone coin ${band.id}${showFill ? " active" : ""}`
                : band.kind === "edge"
                  ? `Zone bord ${band.id}${showFill ? " active" : ""}`
                  : `Zone personnalisée ${band.id}`
            }
            aria-pressed={
              canEdit && (band.kind === "corner" || band.kind === "edge")
                ? showFill
                : undefined
            }
          >
            {band.kind === "custom"
              ? (() => {
                  const z = model.customZones.find((c) => c.id === band.id);
                  if (!z) return null;
                  return (
                    <span className="zone-xy" aria-hidden>
                      {z.x},{z.y}
                    </span>
                  );
                })()
              : null}
            {canEdit && band.kind === "custom" ? (
              <div
                className="zone-move-hit"
                onPointerDown={(e) => {
                  const z = model.customZones.find((c) => c.id === band.id);
                  if (!z) return;
                  onHandleDown(e, {
                    custom: z,
                    handle: "move",
                    bandKey: band.key,
                  });
                }}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
              />
            ) : null}
            {canEdit && band.kind === "edge" && showFill ? (
              <HandleBtn
                handle={EDGE_HANDLES[band.id as Edge]}
                active={
                  resizingKey === band.key &&
                  resizingHandle === EDGE_HANDLES[band.id as Edge]
                }
                onPointerDown={(ev) =>
                  onHandleDown(ev, {
                    edge: band.id as Edge,
                    handle: EDGE_HANDLES[band.id as Edge],
                    bandKey: band.key,
                  })
                }
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onDoubleClick={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  openPxEdit({ kind: "edge", edge: band.id as Edge });
                }}
              />
            ) : null}
            {canEdit && band.kind === "corner" && showFill
              ? CORNER_INNER_HANDLES[band.id as Corner].map((h) => (
                  <HandleBtn
                    key={h}
                    handle={h}
                    active={
                      resizingKey === band.key &&
                      handleIsLit(h, resizingHandle)
                    }
                    onPointerDown={(ev) =>
                      onHandleDown(ev, {
                        corner: band.id as Corner,
                        handle: h,
                        bandKey: band.key,
                      })
                    }
                    onPointerMove={onHandleMove}
                    onPointerUp={onHandleUp}
                    onDoubleClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      if (h === "e" || h === "w") {
                        openPxEdit({
                          kind: "corner",
                          corner: band.id as Corner,
                          axis: "w",
                        });
                      } else if (h === "n" || h === "s") {
                        openPxEdit({
                          kind: "corner",
                          corner: band.id as Corner,
                          axis: "h",
                        });
                      }
                    }}
                  />
                ))
              : null}
            {canEdit && band.kind === "custom"
              ? CUSTOM_HANDLES.map((h) => (
                  <HandleBtn
                    key={h}
                    handle={h}
                    active={
                      resizingKey === band.key &&
                      handleIsLit(h, resizingHandle)
                    }
                    onPointerDown={(ev) => {
                      const z = model.customZones.find((c) => c.id === band.id);
                      if (!z) return;
                      onHandleDown(ev, {
                        custom: z,
                        handle: h,
                        bandKey: band.key,
                      });
                    }}
                    onPointerMove={onHandleMove}
                    onPointerUp={onHandleUp}
                    onDoubleClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      if (h === "n" || h === "s" || h === "e" || h === "w") {
                        openPxEdit({ kind: "custom", id: band.id, handle: h });
                      }
                    }}
                  />
                ))
              : null}
          </div>
        );
      })}
      <div className="zone-map-cross" aria-hidden />
      {pxEdit && canEdit ? (
        <form
          className="zone-px-edit"
          style={pxEditStyle(pxEdit, bands)}
          onSubmit={(e) => {
            e.preventDefault();
            commitPx();
          }}
        >
          <input
            ref={inputRef}
            type="number"
            min={1}
            value={pxDraft}
            aria-label="Taille en pixels"
            onChange={(e) => {
              setPxDraft(e.target.value);
              applyPxValue(e.target.value);
            }}
            onBlur={commitPx}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setPxEdit(null);
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

function handleIsLit(handle: Handle, active: DragHandle | null) {
  if (!active || active === "move") return false;
  if (handle === active) return true;
  return active.length === 2 && handle.length === 1 && active.includes(handle);
}

function HandleBtn({
  handle,
  active = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
}: {
  handle: Handle;
  active?: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onDoubleClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className={[
        "zone-handle",
        `zone-handle-${handle}`,
        active ? "is-active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`Redimensionner ${handle}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={onDoubleClick}
    />
  );
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

function resizeCustom(z: CustomZone, handle: Handle, dx: number, dy: number): CustomZone {
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
  const right = z.x + z.width;
  const bottom = z.y + z.height;
  if (handle === "e") {
    return { ...z, width: clamp(v, 8, geom.width) };
  }
  if (handle === "w") {
    const x = clamp(v, geom.x, right - 8);
    return { ...z, x, width: right - x };
  }
  if (handle === "s") {
    return { ...z, height: clamp(v, 8, geom.height) };
  }
  const y = clamp(v, geom.y, bottom - 8);
  return { ...z, y, height: bottom - y };
}

function pxEditStyle(
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
  return { left: `${left}%`, top: `${top}%` };
}
