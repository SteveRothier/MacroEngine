import { describe, expect, it } from "vitest";
import { tStatic } from "../i18n";
import {
  formatDuration,
  formatLastRunSummary,
  formatLastRunTooltip,
} from "./relativeTime";
import type { RecentEntry } from "../quickAccess";

const t = (key: string, vars?: Record<string, string | number>) =>
  tStatic("fr", key, vars);

describe("last-run formatting", () => {
  const now = Date.parse("2026-08-27T12:00:00.000Z");

  it("formats duration", () => {
    expect(formatDuration(420, t)).toBe("420 ms");
    expect(formatDuration(1500, t)).toBe("1,5 s");
    expect(formatDuration(65_000, t)).toBe("1 min 5 s");
  });

  it("builds summary and tooltip with status + duration", () => {
    const entry: RecentEntry = {
      kind: "macro",
      id: "Demo",
      at: now - 120_000,
      status: "ok",
      durationMs: 1500,
    };
    expect(formatLastRunSummary(entry, t, now)).toBe(
      "il y a 2 min · 1,5 s · OK",
    );
    expect(formatLastRunTooltip(entry, t, now)).toBe(
      "OK · 1,5 s · il y a 2 min",
    );
  });
});
