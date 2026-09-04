import type { ThemeMode } from "../theme";

export type ProcessFilterMode = "allow" | "deny";
export type ProcessFilter = {
  enabled: boolean;
  mode: ProcessFilterMode;
  names: string[];
};

export const DEFAULT_PROCESS_FILTER: ProcessFilter = {
  enabled: false,
  mode: "deny",
  names: [],
};

export function normalizeExeName(s: string): string {
  const t = s.trim().replace(/\\/g, "/");
  const base = t.split("/").pop() ?? t;
  return base.toLowerCase();
}

/** Whether the global process filter allows execution for the foreground exe. */
export function processFilterAllows(
  filter: ProcessFilter,
  foregroundExe: string | null | undefined,
): boolean {
  if (!filter.enabled) return true;
  const listed = filter.names.map(normalizeExeName).filter((n) => n.length > 0);
  if (listed.length === 0) {
    return filter.mode === "deny";
  }
  const exe = foregroundExe ? normalizeExeName(foregroundExe) : "";
  if (!exe) {
    return filter.mode === "deny";
  }
  const hit = listed.includes(exe);
  return filter.mode === "allow" ? hit : !hit;
}

export type MouseButton = "left" | "right" | "middle";
export type ClickMode = "hold" | "toggle";
export type ClickKind = "single" | "double";
export type InputKind = "mouse" | "keyboard";
export type RateUnit = "perSecond" | "perMinute" | "perHour" | "perDay";
export type TimingMode = "rate" | "interval";
export type DutyMode = "pulse" | "holdPct";
export type LimitMode = "clicks" | "time" | "both";
export type PixelConditionAction = "stop" | "pause";
export type PixelCondition = {
  enabled: boolean;
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  tolerance: number;
  action: PixelConditionAction;
};

export const DEFAULT_PIXEL_CONDITION: PixelCondition = {
  enabled: false,
  x: 0,
  y: 0,
  r: 0,
  g: 0,
  b: 0,
  tolerance: 12,
  action: "stop",
};
export type ZoneAction = "stop" | "pause" | "start";
export type ZoneKind = "safety" | "click";
export type ClickSampleMode = "random" | "center";
export type ClickZoneOrder = "random" | "sequence";
export type Corner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
export type Edge = "left" | "right" | "top" | "bottom";
export type ClickTarget =
  | { type: "currentCursor" }
  | { type: "fixed"; x: number; y: number };
export type StopZone =
  | {
      type: "corner";
      corner: Corner;
      sizePx?: number;
      widthPx?: number;
      heightPx?: number;
      color?: string;
    }
  | { type: "edge"; edge: Edge; marginPx?: number }
  | { type: "rect"; x: number; y: number; width: number; height: number }
  | {
      type: "custom";
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      action?: ZoneAction;
      kind?: ZoneKind;
      color?: string;
      clickMode?: ClickSampleMode;
    };

export type ClickPoint = { x: number; y: number; clicks: number; radius: number };

/** Same shape as macro triggers (manual | hotkey). */
export type ClickerTrigger =
  | { type: "manual" }
  | { type: "hotkey"; key: string; mods?: { ctrl?: boolean; alt?: boolean; shift?: boolean } };

export const MANUAL_TRIGGER: ClickerTrigger = { type: "manual" };

export type CustomZone = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  action: ZoneAction;
  kind: ZoneKind;
  color: string;
  clickMode: ClickSampleMode;
};

export type ScreenGeomDto = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const FALLBACK_SCREEN_GEOM: ScreenGeomDto = {
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
};

export const ZONE_ACTION_LABEL: Record<ZoneAction, string> = {
  stop: "Arrêt",
  pause: "Pause",
  start: "Reprendre",
};

/** Tooltip for zone action selects in the studio. */
export const ZONE_ACTION_HINT: Record<ZoneAction, string> = {
  stop: "Arrête la session clicker.",
  pause: "Met la session en pause tant que le curseur reste dans la zone.",
  start: "Annule la pause du tick en cours uniquement (ne démarre pas une session arrêtée).",
};

export const ZONE_KIND_LABEL: Record<ZoneKind, string> = {
  safety: "Sécurité",
  click: "Clic",
};

export type ClickerConfigPayload = {
  button: MouseButton;
  cps: number;
  mode: ClickMode;
  target: ClickTarget;
  cpsJitter: number;
  cpsMin: number;
  cpsMax: number;
  rateUnit: RateUnit;
  timingMode: TimingMode;
  intervalMs: number;
  inputKind: InputKind;
  key: string;
  keyShift: boolean;
  clickKind: ClickKind;
  dutyCycle: number;
  dutyMode: DutyMode;
  limitsEnabled: boolean;
  limitMode: LimitMode;
  maxClicks: number | null;
  maxDurationMs: number | null;
  onCompleteMacro?: string | null;
  pixelCondition?: PixelCondition | null;
  randomEnabled: boolean;
  randomPct: number;
  pointsEnabled: boolean;
  points: ClickPoint[];
  stopWhenComplete: boolean;
  stopZones: StopZone[];
  clickZoneOrder: ClickZoneOrder;
};

export type AppSettings = {
  clicker: ClickerConfigPayload;
  advancedUi: boolean;
  overlayVisible: boolean;
  overlayOpacity?: number;
  processFilter?: ProcessFilter;
  theme?: ThemeMode;
  displayId?: string | null;
  journalOpen?: boolean;
  closeToTray?: boolean;
  startWithWindows?: boolean;
  hotkeys: {
    actionVk: number;
    actionCtrl?: boolean;
    actionAlt?: boolean;
    actionShift?: boolean;
    macroVk: number;
    pauseVk?: number;
    emergencyVk: number;
  };
};

export type DisplayDto = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
  isPrimary: boolean;
};

export const DEFAULT_CLICKER: ClickerConfigPayload = {
  button: "left",
  cps: 10,
  mode: "toggle",
  target: { type: "currentCursor" },
  cpsJitter: 0,
  cpsMin: 0,
  cpsMax: 0,
  rateUnit: "perSecond",
  timingMode: "rate",
  intervalMs: 100,
  inputKind: "mouse",
  key: "A",
  keyShift: false,
  clickKind: "single",
  dutyCycle: 1,
  dutyMode: "pulse",
  limitsEnabled: false,
  limitMode: "clicks",
  maxClicks: null,
  maxDurationMs: null,
  onCompleteMacro: null,
  pixelCondition: null,
  randomEnabled: false,
  randomPct: 0,
  pointsEnabled: false,
  points: [],
  stopWhenComplete: false,
  stopZones: [],
  clickZoneOrder: "random",
};

export const CORNER_LABELS: { id: Corner; label: string; cls: string }[] = [
  { id: "topLeft", label: "Haut gauche", cls: "tl" },
  { id: "topRight", label: "Haut droit", cls: "tr" },
  { id: "bottomLeft", label: "Bas gauche", cls: "bl" },
  { id: "bottomRight", label: "Bas droit", cls: "br" },
];

export const EDGES: { id: Edge; label: string }[] = [
  { id: "left", label: "Gauche" },
  { id: "right", label: "Droite" },
  { id: "top", label: "Haut" },
  { id: "bottom", label: "Bas" },
];

export function newZoneId() {
  return `z${Math.random().toString(36).slice(2, 9)}`;
}
