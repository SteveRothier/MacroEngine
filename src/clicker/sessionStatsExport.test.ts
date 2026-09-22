import { describe, expect, it } from "vitest";
import {
  buildSessionStatsSnapshot,
  sessionStatsToCsv,
  sessionStatsToJson,
} from "./sessionStatsExport";

describe("sessionStatsExport", () => {
  it("builds a snapshot and serializes JSON/CSV", () => {
    const snap = buildSessionStatsSnapshot({
      running: true,
      paused: false,
      metrics: {
        clicksEmitted: 12,
        targetCps: 10,
        measuredCps: 9.5,
        cumulativeDeadlineErrorMs: 1,
        elapsedMs: 1500,
        running: true,
        filterBlockedTicks: 2,
      },
      samples: [
        { t: 0, cps: 8 },
        { t: 500, cps: 9.5 },
      ],
      limits: {
        enabled: true,
        mode: "both",
        maxClicks: 100,
        maxDurationSec: 60,
      },
    });
    expect(snap.metrics.clicksEmitted).toBe(12);
    expect(snap.metrics.filterBlockedTicks).toBe(2);
    expect(snap.samples).toHaveLength(2);

    const json = sessionStatsToJson(snap);
    expect(json).toContain('"clicksEmitted": 12');
    expect(json).toContain('"maxClicks": 100');

    const csv = sessionStatsToCsv(snap);
    expect(csv.split("\n")[0]).toBe("t,cps");
    expect(csv).toContain("500,9.5000");
  });
});
