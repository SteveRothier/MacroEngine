import {
  DEFAULT_CLICKER,
  type ClickerConfigPayload,
  type ClickPoint,
  type StopZone,
} from "./clickerTypes";
import type { TFunction } from "../i18n";

export type ClickerTemplateId =
  | "cps-cursor"
  | "grid-3-points"
  | "edge-zones"
  | "high-cps-pulse"
  | "corner-safety";

export type ClickerTemplate = {
  id: ClickerTemplateId;
  build: () => ClickerConfigPayload;
};

function gridPoints(): ClickPoint[] {
  return [
    { x: 400, y: 300, clicks: 1, radius: 0 },
    { x: 960, y: 540, clicks: 1, radius: 0 },
    { x: 1520, y: 780, clicks: 1, radius: 0 },
  ];
}

function edgeSafetyZones(): StopZone[] {
  return [
    { type: "edge", edge: "left", marginPx: 24 },
    { type: "edge", edge: "right", marginPx: 24 },
    { type: "edge", edge: "top", marginPx: 24 },
    { type: "edge", edge: "bottom", marginPx: 24 },
  ];
}

/** Corner-relative stop zones — safe on any display (no absolute coords). */
function cornerSafetyZones(): StopZone[] {
  return (["topLeft", "topRight", "bottomLeft", "bottomRight"] as const).map(
    (corner) => ({
      type: "corner" as const,
      corner,
      widthPx: 96,
      heightPx: 96,
      color: "#7c5cbf",
    }),
  );
}

/** Local front patches — no new file format. Labels via clicker.templates.* */
export const CLICKER_TEMPLATES: readonly ClickerTemplate[] = [
  {
    id: "cps-cursor",
    build: () => ({
      ...DEFAULT_CLICKER,
      cps: 10,
      mode: "toggle",
      target: { type: "currentCursor" },
      pointsEnabled: false,
      points: [],
      stopZones: [],
      stopWhenComplete: false,
    }),
  },
  {
    id: "grid-3-points",
    build: () => ({
      ...DEFAULT_CLICKER,
      cps: 8,
      mode: "toggle",
      target: { type: "currentCursor" },
      pointsEnabled: true,
      points: gridPoints(),
      stopWhenComplete: true,
      stopZones: [],
    }),
  },
  {
    id: "edge-zones",
    build: () => ({
      ...DEFAULT_CLICKER,
      cps: 10,
      mode: "toggle",
      target: { type: "currentCursor" },
      pointsEnabled: false,
      points: [],
      stopWhenComplete: false,
      stopZones: edgeSafetyZones(),
      clickZoneOrder: "random",
    }),
  },
  {
    id: "high-cps-pulse",
    build: () => ({
      ...DEFAULT_CLICKER,
      cps: 50,
      cpsMin: 45,
      cpsMax: 55,
      mode: "hold",
      target: { type: "currentCursor" },
      dutyMode: "pulse",
      dutyCycle: 0.5,
      randomEnabled: true,
      randomPct: 15,
      pointsEnabled: false,
      points: [],
      stopWhenComplete: false,
      stopZones: edgeSafetyZones(),
    }),
  },
  {
    id: "corner-safety",
    build: () => ({
      ...DEFAULT_CLICKER,
      cps: 12,
      mode: "toggle",
      target: { type: "currentCursor" },
      pointsEnabled: false,
      points: [],
      stopWhenComplete: false,
      stopZones: cornerSafetyZones(),
    }),
  },
] as const;

export function clickerTemplateLabel(
  t: TFunction,
  id: ClickerTemplateId,
): string {
  return t(`clicker.templates.${id}.label`);
}

export function clickerTemplateDescription(
  t: TFunction,
  id: ClickerTemplateId,
): string {
  return t(`clicker.templates.${id}.description`);
}
