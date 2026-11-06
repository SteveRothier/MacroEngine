import type { HotkeyBindings, KeyMods } from "../macros/types";
import type { AutomationKind, AutomationRow } from "./types";

export type HotkeyChordKey = string;

export function chordKey(vk: number, mods?: KeyMods | null): HotkeyChordKey {
  const c = mods?.ctrl ? "1" : "0";
  const a = mods?.alt ? "1" : "0";
  const s = mods?.shift ? "1" : "0";
  return `${vk}:${c}${a}${s}`;
}

export function parseTriggerChord(
  triggerKey?: string | null,
  mods?: KeyMods | null,
): HotkeyChordKey | null {
  const key = triggerKey?.trim();
  if (!key || key === "0") return null;
  const n = Number(key);
  if (!Number.isFinite(n) || n <= 0) return null;
  return chordKey(n, mods);
}

export function reservedChords(hk: HotkeyBindings | null): Set<HotkeyChordKey> {
  const out = new Set<HotkeyChordKey>();
  if (!hk) return out;
  out.add(chordKey(hk.actionVk, {
    ctrl: hk.actionCtrl,
    alt: hk.actionAlt,
    shift: hk.actionShift,
  }));
  out.add(chordKey(hk.macroVk));
  out.add(chordKey(hk.emergencyVk));
  if (hk.pauseVk) out.add(chordKey(hk.pauseVk));
  if (hk.scriptVk) out.add(chordKey(hk.scriptVk));
  return out;
}

type ChordOwner = { kind: AutomationKind; id: string; name: string };

/** Attach conflictWith on rows that share a hotkey chord (or hit a reserved key). */
export function applyHotkeyConflicts(
  rows: AutomationRow[],
  chords: Map<string, HotkeyChordKey | null>,
  hotkeys: HotkeyBindings | null,
): AutomationRow[] {
  const reserved = reservedChords(hotkeys);
  const byChord = new Map<HotkeyChordKey, ChordOwner[]>();
  for (const r of rows) {
    if (r.enabled === false) continue;
    const ch = chords.get(`${r.kind}:${r.id}`);
    if (!ch) continue;
    const list = byChord.get(ch) ?? [];
    list.push({ kind: r.kind, id: r.id, name: r.name });
    byChord.set(ch, list);
  }
  return rows.map((r) => {
    const ch = chords.get(`${r.kind}:${r.id}`);
    if (!ch) return { ...r, conflictWith: null };
    if (reserved.has(ch)) {
      return {
        ...r,
        conflictWith: {
          kind: r.kind,
          id: "__reserved__",
          name: "",
        },
      };
    }
    const owners = byChord.get(ch) ?? [];
    const other = owners.find((o) => !(o.kind === r.kind && o.id === r.id));
    return { ...r, conflictWith: other ?? null };
  });
}
