import type { TFunction } from "../i18n";
import type { ClickerEditor } from "./useClickerEditor";

export type ReadyItemId = "trigger" | "where" | "pace" | "safety";

export type ReadyTabId = "entry" | "target" | "zones" | "limits";

export type ReadyItem = {
  id: ReadyItemId;
  ok: boolean;
  optional?: boolean;
  label: string;
  /** Studio tab to open when the chip is clicked. */
  blockId: ReadyTabId;
};

export function buildReadyItems(e: ClickerEditor, t: TFunction): ReadyItem[] {
  const sequenceEmpty = e.pointsEnabled && e.points.length === 0;
  const hasWhere = !sequenceEmpty;

  const hasSafetyZone =
    e.zoneModel.corners.topLeft ||
    e.zoneModel.corners.topRight ||
    e.zoneModel.corners.bottomLeft ||
    e.zoneModel.corners.bottomRight ||
    e.zoneModel.edges.left ||
    e.zoneModel.edges.right ||
    e.zoneModel.edges.top ||
    e.zoneModel.edges.bottom ||
    e.zoneModel.customZones.some((z) => z.kind === "safety");

  return [
    {
      id: "trigger",
      ok: e.trigger.type === "hotkey",
      optional: true,
      label: t("clicker.scenario.readyTrigger"),
      blockId: "entry",
    },
    {
      id: "where",
      ok: hasWhere,
      label: sequenceEmpty
        ? t("clicker.scenario.readyWherePoints")
        : t("clicker.scenario.readyWhere"),
      blockId: "target",
    },
    {
      id: "pace",
      ok: (e.timingMode === "rate" ? e.cps : e.intervalMs) > 0,
      label: t("clicker.scenario.readyPace"),
      blockId: "entry",
    },
    {
      id: "safety",
      ok: hasSafetyZone || e.limitsEnabled,
      optional: true,
      label: t("clicker.scenario.readySafety"),
      blockId: hasSafetyZone || !e.limitsEnabled ? "zones" : "limits",
    },
  ];
}
