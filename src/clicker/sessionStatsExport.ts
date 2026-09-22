import type { LimitMode } from "./clickerTypes";
import type { ClickerMetrics } from "./useClickerEditor";

export type CpsSample = { t: number; cps: number };

export type SessionLimitCaps = {
  enabled: boolean;
  mode: LimitMode;
  maxClicks: number | null;
  maxDurationSec: number | null;
};

export type SessionStatsSnapshot = {
  exportedAt: string;
  paused: boolean;
  running: boolean;
  metrics: {
    clicksEmitted: number;
    targetCps: number;
    measuredCps: number;
    elapsedMs: number;
    filterBlockedTicks: number;
    cumulativeDeadlineErrorMs: number;
  };
  limits: SessionLimitCaps | null;
  samples: CpsSample[];
};

export function buildSessionStatsSnapshot(opts: {
  metrics: ClickerMetrics | null;
  samples: CpsSample[];
  running: boolean;
  paused: boolean;
  limits?: SessionLimitCaps | null;
}): SessionStatsSnapshot {
  const m = opts.metrics;
  return {
    exportedAt: new Date().toISOString(),
    paused: opts.paused,
    running: opts.running,
    metrics: {
      clicksEmitted: m?.clicksEmitted ?? 0,
      targetCps: m?.targetCps ?? 0,
      measuredCps: m?.measuredCps ?? 0,
      elapsedMs: m?.elapsedMs ?? 0,
      filterBlockedTicks: m?.filterBlockedTicks ?? 0,
      cumulativeDeadlineErrorMs: m?.cumulativeDeadlineErrorMs ?? 0,
    },
    limits: opts.limits
      ? {
          enabled: opts.limits.enabled,
          mode: opts.limits.mode,
          maxClicks: opts.limits.maxClicks,
          maxDurationSec: opts.limits.maxDurationSec,
        }
      : null,
    samples: opts.samples.map((s) => ({ t: s.t, cps: s.cps })),
  };
}

export function sessionStatsToJson(snapshot: SessionStatsSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function sessionStatsToCsv(snapshot: SessionStatsSnapshot): string {
  const lines = [
    "t,cps",
    ...snapshot.samples.map((s) => `${s.t},${s.cps.toFixed(4)}`),
  ];
  return `${lines.join("\n")}\n`;
}
