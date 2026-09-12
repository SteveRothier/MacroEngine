import type { AutomationRow } from "./types";

export const ACCUEIL_ORDER_KEY = "caster.accueil.manualOrder";

export function rowOrderKey(
  r: Pick<AutomationRow, "kind" | "id">,
): string {
  return `${r.kind}:${r.id}`;
}

export function loadAccueilOrder(): string[] {
  try {
    const raw = localStorage.getItem(ACCUEIL_ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function saveAccueilOrder(keys: string[]): void {
  try {
    localStorage.setItem(ACCUEIL_ORDER_KEY, JSON.stringify(keys));
  } catch {
    /* ignore quota */
  }
}

/** Keep saved order for still-present keys; append newcomers in `presentKeys` order. */
export function mergeAccueilOrder(
  saved: string[],
  presentKeys: string[],
): string[] {
  const present = new Set(presentKeys);
  const out = saved.filter((k) => present.has(k));
  const seen = new Set(out);
  for (const k of presentKeys) {
    if (!seen.has(k)) {
      out.push(k);
      seen.add(k);
    }
  }
  return out;
}

export function applyAccueilOrder<T extends Pick<AutomationRow, "kind" | "id">>(
  rows: T[],
  order: string[],
): T[] {
  if (order.length === 0) return rows;
  const rank = new Map(order.map((k, i) => [k, i]));
  return [...rows].sort((a, b) => {
    const ka = rowOrderKey(a);
    const kb = rowOrderKey(b);
    const ra = rank.get(ka);
    const rb = rank.get(kb);
    if (ra == null && rb == null) return 0;
    if (ra == null) return 1;
    if (rb == null) return -1;
    return ra - rb;
  });
}

/**
 * Move `fromKey` so it sits before `beforeKey` (null = append at end).
 * Returns null on no-op / invalid.
 */
export function reorderAccueilKeys(
  keys: string[],
  fromKey: string,
  beforeKey: string | null,
): string[] | null {
  const fromIdx = keys.indexOf(fromKey);
  if (fromIdx < 0) return null;
  if (beforeKey === fromKey) return null;
  const nextAfter = keys[fromIdx + 1] ?? null;
  if (beforeKey === nextAfter) return null;

  const next = keys.slice();
  next.splice(fromIdx, 1);
  let insertAt = next.length;
  if (beforeKey != null) {
    insertAt = next.indexOf(beforeKey);
    if (insertAt < 0) return null;
  }
  next.splice(insertAt, 0, fromKey);
  return next;
}
