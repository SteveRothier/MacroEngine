import { describe, expect, it } from "vitest";
import {
  formatDurationFr,
  formatLastRunSummary,
  formatLastRunTooltip,
} from "./relativeTime";
import type { RecentEntry } from "../quickAccess";

describe("last-run formatting", () => {
  const now = Date.parse("2026-08-27T12:00:00.000Z");

  it("formats duration", () => {
    expect(formatDurationFr(420)).toBe("420 ms");
    expect(formatDurationFr(1500)).toBe("1,5 s");
    expect(formatDurationFr(65_000)).toBe("1 min 5 s");
  });

  it("builds summary and tooltip with status + duration", () => {
    const entry: RecentEntry = {
      kind: "macro",
      id: "Demo",
      at: now - 120_000,
      status: "ok",
      durationMs: 1500,
    };
    expect(formatLastRunSummary(entry, now)).toBe("il y a 2 min · 1,5 s · OK");
    expect(formatLastRunTooltip(entry, now)).toBe("OK · 1,5 s · il y a 2 min");
  });
});
