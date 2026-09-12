import type { AutomationRow } from "./types";
import { rowOrderKey } from "./accueilOrder";

export type AccueilDropEdge = "before" | "after";

export type AccueilReorderDrop = {
  kind: "reorder";
  fromKey: string;
  /** Insert before this row key; null = append at end of visible list. */
  beforeKey: string | null;
  targetKey: string;
  edge: AccueilDropEdge;
};

/**
 * Resolve a row reorder drop anywhere in the visible Accueil list
 * (cross-kind / scripts allowed).
 */
export function resolveAccueilReorderDrop(
  drag: Pick<AutomationRow, "id" | "kind">,
  target: Pick<AutomationRow, "id" | "kind">,
  edge: AccueilDropEdge,
  visibleRows: Array<Pick<AutomationRow, "id" | "kind">>,
): AccueilReorderDrop | null {
  const fromKey = rowOrderKey(drag);
  const targetKey = rowOrderKey(target);
  if (fromKey === targetKey) return null;

  const keys = visibleRows.map(rowOrderKey);
  const fromIdx = keys.indexOf(fromKey);
  const targetIdx = keys.indexOf(targetKey);
  if (fromIdx < 0 || targetIdx < 0) return null;

  const beforeKey =
    edge === "before" ? targetKey : (keys[targetIdx + 1] ?? null);

  if (beforeKey === fromKey) return null;
  const nextId = keys[fromIdx + 1] ?? null;
  if (beforeKey === nextId) return null;

  return {
    kind: "reorder",
    fromKey,
    beforeKey,
    targetKey,
    edge,
  };
}

/** Any two distinct Accueil rows can be reordered relative to each other. */
export function canReorderAccueilRows(
  a: Pick<AutomationRow, "id" | "kind">,
  b: Pick<AutomationRow, "id" | "kind">,
): boolean {
  return rowOrderKey(a) !== rowOrderKey(b);
}
