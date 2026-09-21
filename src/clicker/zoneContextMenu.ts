import type { TFunction } from "../i18n/t";
import type { MenuItemDef } from "../ui/shell";
import type { CustomZone } from "./clickerTypes";
import type { ClickerEditor } from "./useClickerEditor";

export function customZoneContextItems(
  t: TFunction,
  zone: CustomZone | undefined,
  editDisabled: boolean,
): MenuItemDef[] {
  if (!zone) return [];
  const kindItem: MenuItemDef =
    zone.kind === "click"
      ? { id: "makeSafety", label: t("clicker.zones.makeSafety") }
      : { id: "makeClick", label: t("clicker.zones.makeClick") };
  if (editDisabled) {
    return [{ id: "edit", label: t("clicker.zones.edit") }];
  }
  return [
    { id: "duplicate", label: t("clicker.zones.duplicate") },
    { id: "bringFront", label: t("clicker.zones.bringFront") },
    { id: "sendBack", label: t("clicker.zones.sendBack") },
    kindItem,
    {
      id: "delete",
      label: t("clicker.zones.delete"),
      danger: true,
    },
  ];
}

export function runCustomZoneContextAction(
  e: ClickerEditor,
  zoneId: string,
  actionId: string,
) {
  switch (actionId) {
    case "edit":
      e.setZoneSelection({ kind: "custom", id: zoneId });
      break;
    case "duplicate":
      e.duplicateCustomZone(zoneId);
      break;
    case "bringFront":
      e.moveCustomZoneOrder(zoneId, "front");
      break;
    case "sendBack":
      e.moveCustomZoneOrder(zoneId, "back");
      break;
    case "makeSafety":
      e.updateCustomZone(zoneId, { kind: "safety" });
      break;
    case "makeClick":
      e.updateCustomZone(zoneId, { kind: "click" });
      break;
    case "delete":
      e.removeCustomZone(zoneId);
      break;
    default:
      break;
  }
}
