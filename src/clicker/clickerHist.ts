import type { ClickerConfigPayload } from "./clickerTypes";

export type HistEntry = {
  config: ClickerConfigPayload;
  labelKey: string;
};

export function pushHistEntry(
  past: HistEntry[],
  entry: HistEntry,
  max: number,
): HistEntry[] {
  return [...past, entry].slice(-max);
}

export function undoHistStep(
  past: HistEntry[],
  present: HistEntry,
  future: HistEntry[],
  max: number,
): { past: HistEntry[]; present: HistEntry; future: HistEntry[] } | null {
  if (past.length === 0) return null;
  const previous = past[past.length - 1]!;
  return {
    past: past.slice(0, -1),
    present: previous,
    future: [...future, present].slice(-max),
  };
}

export function redoHistStep(
  past: HistEntry[],
  present: HistEntry,
  future: HistEntry[],
  max: number,
): { past: HistEntry[]; present: HistEntry; future: HistEntry[] } | null {
  if (future.length === 0) return null;
  const next = future[future.length - 1]!;
  return {
    past: [...past, present].slice(-max),
    present: next,
    future: future.slice(0, -1),
  };
}

/** Whether a coalesce window still covers this label (burst of wheel/drag). */
export function shouldCoalescePush(
  last: { labelKey: string; until: number } | null,
  labelKey: string,
  now: number,
): boolean {
  return last != null && last.labelKey === labelKey && now < last.until;
}
