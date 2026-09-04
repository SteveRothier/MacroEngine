import {
  DEFAULT_CLICKER,
  type ClickerConfigPayload,
  type ClickPoint,
  type StopZone,
} from "./clickerTypes";

export type ClickerTemplateId =
  | "cps-cursor"
  | "grid-3-points"
  | "edge-zones";

export type ClickerTemplate = {
  id: ClickerTemplateId;
  label: string;
  description: string;
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

/** Local front patches — no new file format. */
export const CLICKER_TEMPLATES: readonly ClickerTemplate[] = [
  {
    id: "cps-cursor",
    label: "CPS fixe · curseur",
    description: "10 CPS, bouton gauche, cible curseur, sans zones.",
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
    label: "Grille 3 points",
    description: "Séquence de 3 points fixes, arrêt à la fin.",
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
    label: "Zones bords seuls",
    description: "Curseur + bords écran en zone d’arrêt (sécurité).",
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
] as const;
