import { invoke } from "@tauri-apps/api/core";
import type { AutomationRow } from "./types";

/** @deprecated localStorage key — migrated to engine `accueil-order.json` */
export const ACCUEIL_ORDER_KEY = "caster.accueil.manualOrder";

export function rowOrderKey(
  r: Pick<AutomationRow, "kind" | "id">,
): string {
  return `${r.kind}:${r.id}`;
}

export async function loadAccueilOrder(): Promise<string[]> {
  try {
    const keys = await invoke<string[]>("get_accueil_order_cmd");
    if (Array.isArray(keys) && keys.length > 0) {
      return keys.filter((x): x is string => typeof x === "string");
    }
    // One-shot migrate from localStorage if engine file is empty
    const legacy = loadLegacyLocalOrder();
    if (legacy.length > 0) {
      await saveAccueilOrder(legacy);
      try {
        localStorage.removeItem(ACCUEIL_ORDER_KEY);
      } catch {
        /* ignore */
      }
      return legacy;
    }
    return [];
  } catch {
    return loadLegacyLocalOrder();
  }
}

function loadLegacyLocalOrder(): string[] {
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

export async function saveAccueilOrder(keys: string[]): Promise<void> {
  try {
    await invoke("set_accueil_order_cmd", { keys });
  } catch {
    try {
      localStorage.setItem(ACCUEIL_ORDER_KEY, JSON.stringify(keys));
    } catch {
      /* ignore quota */
    }
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

/** Nearest same-kind sibling that should become `beforeId` for library move. */
export function nearestSameKindBeforeId(
  orderedKeys: string[],
  fromKey: string,
  kind: AutomationRow["kind"],
): string | null {
  const fromIdx = orderedKeys.indexOf(fromKey);
  if (fromIdx < 0) return null;
  const prefix = `${kind}:`;
  for (let i = fromIdx + 1; i < orderedKeys.length; i++) {
    const k = orderedKeys[i]!;
    if (k.startsWith(prefix) && k !== fromKey) {
      return k.slice(prefix.length);
    }
  }
  return null;
}

/**
 * Accueil `beforeKey` so `fromKey` lands at the end of `folderId`'s block
 * (after current members; empty folder → before the next section / unfiled).
 */
export function beforeKeyForEndOfFolder(
  orderedKeys: string[],
  rows: Pick<AutomationRow, "kind" | "id" | "folderId">[],
  fromKey: string,
  folderId: string,
  folderIdsInOrder: string[],
): string | null {
  const byKey = new Map(rows.map((r) => [rowOrderKey(r), r]));
  const folderRank = new Map(folderIdsInOrder.map((id, i) => [id, i]));
  const targetRank = folderRank.get(folderId) ?? 0;

  const inFolder: string[] = [];
  for (const k of orderedKeys) {
    if (k === fromKey) continue;
    const row = byKey.get(k);
    if (!row) continue;
    if (row.folderId === folderId) inFolder.push(k);
  }

  if (inFolder.length > 0) {
    const last = inFolder[inFolder.length - 1]!;
    const idx = orderedKeys.indexOf(last);
    for (let i = idx + 1; i < orderedKeys.length; i++) {
      if (orderedKeys[i] !== fromKey) return orderedKeys[i]!;
    }
    return null;
  }

  for (const k of orderedKeys) {
    if (k === fromKey) continue;
    const row = byKey.get(k);
    if (!row) continue;
    if (row.folderId == null) return k;
    const rank = folderRank.get(row.folderId);
    if (rank != null && rank > targetRank) return k;
  }
  return null;
}
