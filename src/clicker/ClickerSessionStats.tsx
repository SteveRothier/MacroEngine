import { useMemo, useState } from "react";
import { useT } from "../i18n";
import type { ClickerMetrics } from "./useClickerEditor";

type Sample = { t: number; cps: number };

type Props = {
  samples: Sample[];
  metrics: ClickerMetrics | null;
  running: boolean;
  paused: boolean;
};

export function ClickerSessionStats({
  samples,
  metrics,
  running,
  paused,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(true);
  const path = useMemo(() => sparklinePath(samples.map((s) => s.cps)), [samples]);
  const latest = samples.length > 0 ? samples[samples.length - 1]!.cps : 0;
  const blocked = metrics?.filterBlockedTicks ?? 0;

  if (!running && samples.length === 0) return null;

  return (
    <div className="caster-clicker-session-stats">
      <button
        type="button"
        className="caster-clicker-session-stats-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {t("clicker.session.stats")} {open ? "▾" : "▸"}
        {paused ? t("clicker.session.paused") : ""}
      </button>
      {open ? (
        <div className="caster-clicker-session-stats-body">
          <svg
            className="caster-clicker-sparkline"
            viewBox="0 0 120 28"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <div className="caster-clicker-session-stats-meta">
            <span>
              <strong>{latest.toFixed(1)}</strong> cps
            </span>
            <span>
              {t("clicker.session.clicks", {
                n: metrics?.clicksEmitted ?? 0,
              })}
            </span>
            <span>
              {formatDurationMs(metrics?.elapsedMs ?? 0)}
            </span>
            {blocked > 0 ? (
              <span className="caster-clicker-session-blocked">
                {t("clicker.session.filterBlocked", { n: blocked })}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function sparklinePath(values: number[]): string {
  if (values.length === 0) return "";
  const w = 120;
  const h = 28;
  const max = Math.max(1, ...values);
  const n = values.length;
  return values
    .map((v, i) => {
      const x = n === 1 ? 0 : (i / (n - 1)) * w;
      const y = h - (v / max) * (h - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function formatDurationMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
}
