import { describe, expect, it } from "vitest";
import {
  pushHistEntry,
  redoHistStep,
  shouldCoalescePush,
  undoHistStep,
  type HistEntry,
} from "./clickerHist";
import type { ClickerConfigPayload } from "./clickerTypes";

function entry(id: number, labelKey: string): HistEntry {
  return {
    config: { id } as unknown as ClickerConfigPayload,
    labelKey,
  };
}

describe("clicker hist stack", () => {
  it("pushes with max and preserves labels through undo/redo", () => {
    let past = pushHistEntry([], entry(1, "clicker.history.zoneAdded"), 3);
    past = pushHistEntry(past, entry(2, "clicker.history.zoneMoved"), 3);
    past = pushHistEntry(past, entry(3, "clicker.history.zoneResized"), 3);
    past = pushHistEntry(past, entry(4, "clicker.history.zoneDeleted"), 3);
    expect(past.map((e) => (e.config as { id: number }).id)).toEqual([
      2, 3, 4,
    ]);
    expect(past.map((e) => e.labelKey)).toEqual([
      "clicker.history.zoneMoved",
      "clicker.history.zoneResized",
      "clicker.history.zoneDeleted",
    ]);

    const present = entry(5, "clicker.history.zoneSized");
    let future: HistEntry[] = [];
    const u = undoHistStep(past, present, future, 3)!;
    expect((u.present.config as { id: number }).id).toBe(4);
    expect(u.present.labelKey).toBe("clicker.history.zoneDeleted");
    expect(u.past.map((e) => (e.config as { id: number }).id)).toEqual([2, 3]);
    expect(u.future).toHaveLength(1);
    expect(u.future[0]!.labelKey).toBe("clicker.history.zoneSized");

    const r = redoHistStep(u.past, u.present, u.future, 3)!;
    expect((r.present.config as { id: number }).id).toBe(5);
    expect(r.present.labelKey).toBe("clicker.history.zoneSized");
    expect(r.future).toEqual([]);
  });

  it("coalesces wheel bursts for the same label", () => {
    const last = { labelKey: "clicker.history.zoneSized", until: 1_000 };
    expect(shouldCoalescePush(last, "clicker.history.zoneSized", 900)).toBe(
      true,
    );
    expect(shouldCoalescePush(last, "clicker.history.zoneSized", 1_100)).toBe(
      false,
    );
    expect(shouldCoalescePush(last, "clicker.history.zoneMoved", 900)).toBe(
      false,
    );
    expect(shouldCoalescePush(null, "clicker.history.zoneSized", 900)).toBe(
      false,
    );
  });
});
