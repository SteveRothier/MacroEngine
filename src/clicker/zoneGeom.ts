import {
  FALLBACK_SCREEN_GEOM,
  type Corner,
  type CustomZone,
  type Edge,
  type ScreenGeomDto,
  type StopZone,
  type ZoneAction,
} from "./clickerTypes";

export type ZoneModel = {
  corners: Record<Corner, boolean>;
  cornerWidth: Record<Corner, number>;
  cornerHeight: Record<Corner, number>;
  cornerColor: string;
  edges: Record<Edge, boolean>;
  edgeMargin: Record<Edge, number>;
  customZones: CustomZone[];
};

export const DEFAULT_CORNER_SIZE = 80;
export const DEFAULT_EDGE_MARGIN = 40;
export const DEFAULT_CORNER_COLOR = "#7c5cbf";
export const CUSTOM_ZONE_PALETTE = [
  "#e11d48",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
  "#84cc16",
];

export function nextCustomZoneColor(used: string[]): string {
  const lower = used.map((c) => c.toLowerCase());
  return (
    CUSTOM_ZONE_PALETTE.find((c) => !lower.includes(c.toLowerCase())) ??
    CUSTOM_ZONE_PALETTE[used.length % CUSTOM_ZONE_PALETTE.length]
  );
}

export const EMPTY_ZONE_MODEL: ZoneModel = {
  corners: {
    topLeft: false,
    topRight: false,
    bottomLeft: false,
    bottomRight: false,
  },
  cornerWidth: {
    topLeft: DEFAULT_CORNER_SIZE,
    topRight: DEFAULT_CORNER_SIZE,
    bottomLeft: DEFAULT_CORNER_SIZE,
    bottomRight: DEFAULT_CORNER_SIZE,
  },
  cornerHeight: {
    topLeft: DEFAULT_CORNER_SIZE,
    topRight: DEFAULT_CORNER_SIZE,
    bottomLeft: DEFAULT_CORNER_SIZE,
    bottomRight: DEFAULT_CORNER_SIZE,
  },
  cornerColor: DEFAULT_CORNER_COLOR,
  edges: { left: false, right: false, top: false, bottom: false },
  edgeMargin: {
    left: DEFAULT_EDGE_MARGIN,
    right: DEFAULT_EDGE_MARGIN,
    top: DEFAULT_EDGE_MARGIN,
    bottom: DEFAULT_EDGE_MARGIN,
  },
  customZones: [],
};

const CORNERS: Corner[] = ["topLeft", "topRight", "bottomLeft", "bottomRight"];
const EDGE_IDS: Edge[] = ["left", "right", "top", "bottom"];

export function stopZonesFromModel(model: ZoneModel): StopZone[] {
  const zones: StopZone[] = [];
  for (const corner of CORNERS) {
    if (!model.corners[corner]) continue;
    zones.push({
      type: "corner",
      corner,
      widthPx: model.cornerWidth[corner],
      heightPx: model.cornerHeight[corner],
      color: model.cornerColor,
    });
  }
  for (const edge of EDGE_IDS) {
    if (!model.edges[edge]) continue;
    zones.push({
      type: "edge",
      edge,
      marginPx: model.edgeMargin[edge],
    });
  }
  for (const z of model.customZones) {
    zones.push({
      type: "custom",
      id: z.id,
      x: z.x,
      y: z.y,
      width: z.width,
      height: z.height,
      action: z.action,
      kind: z.kind,
      color: z.color,
      clickMode: z.kind === "click" ? z.clickMode : undefined,
    });
  }
  return zones;
}

export type ZoneBand = {
  key: string;
  kind: "corner" | "edge" | "custom" | "draft";
  id: string;
  action: ZoneAction;
  color?: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function pct(px: number, total: number) {
  if (total <= 0) return 0;
  return clamp((px / total) * 100, 0, 100);
}

/** Scale factor to display in the UI; never used to convert coordinates. */
export function geomScaleFactor(geom: ScreenGeomDto): number {
  const s = geom.scaleFactor;
  return s != null && Number.isFinite(s) && s > 0 ? s : 1;
}

/**
 * Map a pointer position inside `rect` to virtual-desktop pixels.
 *
 * The client rect is normalized to 0–1 and then projected onto `geom`, which is
 * already the physical rect of the active display (origin can be negative on a
 * left/top secondary monitor). DPI cancels out in the normalization, so
 * `geom.scaleFactor` is informational only and is not applied here.
 */
export function clientToScreen(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  geom: ScreenGeomDto,
) {
  const g = geom.width > 0 && geom.height > 0 ? geom : FALLBACK_SCREEN_GEOM;
  const nx = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  const ny = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1);
  return {
    x: Math.round(g.x + nx * g.width),
    y: Math.round(g.y + ny * g.height),
  };
}

export function deltaToScreen(
  dx: number,
  dy: number,
  rect: DOMRect,
  geom: ScreenGeomDto,
) {
  const g = geom.width > 0 && geom.height > 0 ? geom : FALLBACK_SCREEN_GEOM;
  return {
    dx: (dx / Math.max(1, rect.width)) * g.width,
    dy: (dy / Math.max(1, rect.height)) * g.height,
  };
}

export function normalizeRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(1, Math.round(Math.abs(x1 - x0))),
    height: Math.max(1, Math.round(Math.abs(y1 - y0))),
  };
}

export function modelFromStopZones(zones: StopZone[]): ZoneModel {
  const next = {
    corners: { ...EMPTY_ZONE_MODEL.corners },
    cornerWidth: { ...EMPTY_ZONE_MODEL.cornerWidth },
    cornerHeight: { ...EMPTY_ZONE_MODEL.cornerHeight },
    cornerColor: EMPTY_ZONE_MODEL.cornerColor,
    edges: { ...EMPTY_ZONE_MODEL.edges },
    edgeMargin: { ...EMPTY_ZONE_MODEL.edgeMargin },
    customZones: [] as CustomZone[],
  };
  for (const z of zones) {
    if (z.type === "corner") {
      next.corners[z.corner] = true;
      const legacy = z.sizePx ?? DEFAULT_CORNER_SIZE;
      next.cornerWidth[z.corner] = z.widthPx ?? legacy;
      next.cornerHeight[z.corner] = z.heightPx ?? legacy;
      if (z.color) next.cornerColor = z.color;
    } else if (z.type === "edge") {
      next.edges[z.edge] = true;
      if (z.marginPx != null) next.edgeMargin[z.edge] = z.marginPx;
    } else if (z.type === "custom") {
      next.customZones.push({
        id: z.id,
        x: z.x,
        y: z.y,
        width: z.width,
        height: z.height,
        action: z.action ?? "stop",
        kind: z.kind ?? "safety",
        color: z.color || nextCustomZoneColor(next.customZones.map((c) => c.color)),
        clickMode: z.clickMode ?? "random",
      });
    } else if (z.type === "rect") {
      next.customZones.push({
        id: `rect-${z.x}-${z.y}`,
        x: z.x,
        y: z.y,
        width: z.width,
        height: z.height,
        action: "stop",
        kind: "safety",
        color: nextCustomZoneColor(next.customZones.map((c) => c.color)),
        clickMode: "random",
      });
    }
  }
  return next;
}

export function edgeAxisSize(edge: Edge, geom: ScreenGeomDto): number {
  const g = geom.width > 0 && geom.height > 0 ? geom : FALLBACK_SCREEN_GEOM;
  return Math.max(1, edge === "left" || edge === "right" ? g.width : g.height);
}

export function clampEdgeMargin(
  edge: Edge,
  margin: number,
  geom: ScreenGeomDto,
): number {
  return clamp(Math.round(margin), 1, edgeAxisSize(edge, geom));
}

export function clampCornerWidth(size: number, geom: ScreenGeomDto): number {
  const g = geom.width > 0 && geom.height > 0 ? geom : FALLBACK_SCREEN_GEOM;
  return clamp(Math.round(size), 1, g.width);
}

export function clampCornerHeight(size: number, geom: ScreenGeomDto): number {
  const g = geom.width > 0 && geom.height > 0 ? geom : FALLBACK_SCREEN_GEOM;
  return clamp(Math.round(size), 1, g.height);
}

export function clampCornerSize(size: number, geom: ScreenGeomDto): number {
  const g = geom.width > 0 && geom.height > 0 ? geom : FALLBACK_SCREEN_GEOM;
  const max = Math.max(1, Math.min(g.width, g.height));
  return clamp(Math.round(size), 1, max);
}

export function cornerExtentFromPointer(
  corner: Corner,
  handle: "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se",
  clientX: number,
  clientY: number,
  rect: DOMRect,
  geom: ScreenGeomDto,
  currentW: number,
  currentH: number,
) {
  const g = geom.width > 0 && geom.height > 0 ? geom : FALLBACK_SCREEN_GEOM;
  const xPct = clamp(
    ((clientX - rect.left) / Math.max(1, rect.width)) * 100,
    0,
    100,
  );
  const yPct = clamp(
    ((clientY - rect.top) / Math.max(1, rect.height)) * 100,
    0,
    100,
  );
  const pxX =
    corner === "topLeft" || corner === "bottomLeft"
      ? (xPct / 100) * g.width
      : ((100 - xPct) / 100) * g.width;
  const pxY =
    corner === "topLeft" || corner === "topRight"
      ? (yPct / 100) * g.height
      : ((100 - yPct) / 100) * g.height;
  let w = currentW;
  let h = currentH;
  if (handle.includes("e") || handle.includes("w")) {
    w = clampCornerWidth(pxX, g);
  }
  if (handle.includes("n") || handle.includes("s")) {
    h = clampCornerHeight(pxY, g);
  }
  return { w, h };
}

export function marginFromPreviewPointer(
  edge: Edge,
  clientX: number,
  clientY: number,
  rect: DOMRect,
  geom: ScreenGeomDto,
) {
  const xPct = clamp(
    ((clientX - rect.left) / Math.max(1, rect.width)) * 100,
    0,
    100,
  );
  const yPct = clamp(
    ((clientY - rect.top) / Math.max(1, rect.height)) * 100,
    0,
    100,
  );
  const visual =
    edge === "left"
      ? xPct
      : edge === "right"
        ? 100 - xPct
        : edge === "top"
          ? yPct
          : 100 - yPct;
  const axis = edgeAxisSize(edge, geom);
  return clampEdgeMargin(edge, (visual / 100) * axis, geom);
}

export function buildZoneBands(
  geom: ScreenGeomDto,
  model: ZoneModel,
  draft?: { x: number; y: number; width: number; height: number } | null,
  opts?: { previewInactive?: boolean },
): ZoneBand[] {
  const g = geom.width > 0 && geom.height > 0 ? geom : FALLBACK_SCREEN_GEOM;
  const previewInactive = opts?.previewInactive === true;
  const bands: ZoneBand[] = [];

  const edgePct = (edge: Edge, margin: number) => {
    const m = Math.max(1, margin);
    const w = pct(m, g.width);
    const h = pct(m, g.height);
    if (edge === "left") {
      return { left: 0, top: 0, width: w, height: 100 };
    }
    if (edge === "right") {
      return { left: 100 - w, top: 0, width: w, height: 100 };
    }
    if (edge === "top") {
      return { left: 0, top: 0, width: 100, height: h };
    }
    return { left: 0, top: 100 - h, width: 100, height: h };
  };

  (["left", "right", "top", "bottom"] as Edge[]).forEach((edge) => {
    if (!previewInactive && !model.edges[edge]) return;
    bands.push({
      key: `edge-${edge}`,
      kind: "edge",
      id: edge,
      action: "stop",
      ...edgePct(edge, clampEdgeMargin(edge, model.edgeMargin[edge], g)),
    });
  });

  const cornerPct = (corner: Corner, width: number, height: number) => {
    const w = pct(Math.max(1, width), g.width);
    const h = pct(Math.max(1, height), g.height);
    if (corner === "topLeft") return { left: 0, top: 0, width: w, height: h };
    if (corner === "topRight") {
      return { left: 100 - w, top: 0, width: w, height: h };
    }
    if (corner === "bottomLeft") {
      return { left: 0, top: 100 - h, width: w, height: h };
    }
    return { left: 100 - w, top: 100 - h, width: w, height: h };
  };

  (["topLeft", "topRight", "bottomLeft", "bottomRight"] as Corner[]).forEach(
    (corner) => {
      const on = model.corners[corner];
      if (!previewInactive && !on) return;
      bands.push({
        key: `corner-${corner}`,
        kind: "corner",
        id: corner,
        action: "stop",
        color: model.cornerColor,
        ...cornerPct(
          corner,
          clampCornerWidth(model.cornerWidth[corner], g),
          clampCornerHeight(model.cornerHeight[corner], g),
        ),
      });
    },
  );

  for (const z of model.customZones) {
    bands.push({
      key: `custom-${z.id}`,
      kind: "custom",
      id: z.id,
      action: z.action,
      color: z.color,
      left: pct(z.x - g.x, g.width),
      top: pct(z.y - g.y, g.height),
      width: pct(z.width, g.width),
      height: pct(z.height, g.height),
    });
  }

  if (draft) {
    bands.push({
      key: "draft",
      kind: "draft",
      id: "draft",
      action: "stop",
      left: pct(draft.x - g.x, g.width),
      top: pct(draft.y - g.y, g.height),
      width: pct(draft.width, g.width),
      height: pct(draft.height, g.height),
    });
  }

  return bands;
}

export function moveCustom(
  z: CustomZone,
  dx: number,
  dy: number,
  geom: ScreenGeomDto,
): CustomZone {
  const g = geom.width > 0 && geom.height > 0 ? geom : FALLBACK_SCREEN_GEOM;
  const maxX = g.x + g.width - z.width;
  const maxY = g.y + g.height - z.height;
  return {
    ...z,
    x: clamp(Math.round(z.x + dx), g.x, Math.max(g.x, maxX)),
    y: clamp(Math.round(z.y + dy), g.y, Math.max(g.y, maxY)),
  };
}

export function clampCustomExtent(
  z: CustomZone,
  next: { x?: number; y?: number; width?: number; height?: number },
  geom: ScreenGeomDto,
): CustomZone {
  const g = geom.width > 0 && geom.height > 0 ? geom : FALLBACK_SCREEN_GEOM;
  const width = clamp(Math.round(next.width ?? z.width), 8, g.width);
  const height = clamp(Math.round(next.height ?? z.height), 8, g.height);
  const x = clamp(
    Math.round(next.x ?? z.x),
    g.x,
    Math.max(g.x, g.x + g.width - width),
  );
  const y = clamp(
    Math.round(next.y ?? z.y),
    g.y,
    Math.max(g.y, g.y + g.height - height),
  );
  return { ...z, x, y, width, height };
}

/** Clamp every edge/corner/custom extent into the active display. */
export function clampZoneModel(model: ZoneModel, geom: ScreenGeomDto): ZoneModel {
  const g = geom.width > 0 && geom.height > 0 ? geom : FALLBACK_SCREEN_GEOM;
  const edgeMargin = { ...model.edgeMargin };
  for (const edge of EDGE_IDS) {
    edgeMargin[edge] = clampEdgeMargin(edge, edgeMargin[edge], g);
  }
  const cornerWidth = { ...model.cornerWidth };
  const cornerHeight = { ...model.cornerHeight };
  for (const corner of CORNERS) {
    cornerWidth[corner] = clampCornerWidth(cornerWidth[corner], g);
    cornerHeight[corner] = clampCornerHeight(cornerHeight[corner], g);
  }
  const customZones = model.customZones.map((z) =>
    clampCustomExtent(z, {}, g),
  );
  return {
    ...model,
    edgeMargin,
    cornerWidth,
    cornerHeight,
    customZones,
  };
}
