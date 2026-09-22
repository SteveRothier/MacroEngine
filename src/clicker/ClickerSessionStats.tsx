import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useT } from "../i18n";
import { useToast } from "../ui/shell";
import type { ClickerMetrics } from "./useClickerEditor";
import {
  buildSessionStatsSnapshot,
  sessionStatsToCsv,
  sessionStatsToJson,
  type SessionLimitCaps,
} from "./sessionStatsExport";

type Sample = { t: number; cps: number };

export type { SessionLimitCaps };

type Props = {
  samples: Sample[];
  metrics: ClickerMetrics | null;
  running: boolean;
  paused: boolean;
  limits?: SessionLimitCaps | null;
};

export function ClickerSessionStats({
  samples,
  metrics,
  running,
  paused,
  limits,
}: Props) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const path = useMemo(() => sparklinePath(samples.map((s) => s.cps)), [samples]);
  const latest = samples.length > 0 ? samples[samples.length - 1]!.cps : 0;
  const blocked = metrics?.filterBlockedTicks ?? 0;

  const showClicksLimit =
    !!limits?.enabled &&
    (limits.mode === "clicks" || limits.mode === "both") &&
    limits.maxClicks != null &&
    limits.maxClicks > 0;
  const showTimeLimit =
    !!limits?.enabled &&
    (limits.mode === "time" || limits.mode === "both") &&
    limits.maxDurationSec != null &&
    limits.maxDurationSec > 0;

  const snapshot = () =>
    buildSessionStatsSnapshot({ metrics, samples, running, paused, limits });

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(sessionStatsToJson(snapshot()));
      toast.success(t("clicker.session.statsCopied"));
    } catch {
      toast.error(t("clicker.session.statsCopyFailed"));
    }
  };

  const onSave = async (format: "json" | "csv") => {
    try {
      const snap = snapshot();
      const body =
        format === "json" ? sessionStatsToJson(snap) : sessionStatsToCsv(snap);
      const filePath = await save({
        defaultPath:
          format === "json"
            ? "clicker-session-stats.json"
            : "clicker-session-stats.csv",
        filters: [
          format === "json"
            ? { name: "JSON", extensions: ["json"] }
            : { name: "CSV", extensions: ["csv"] },
        ],
      });
      if (!filePath) return;
      await invoke("write_text_file", { path: filePath, contents: body });
      toast.success(t("clicker.session.statsExported"));
    } catch {
      toast.error(t("clicker.session.statsExportFailed"));
    }
  };

  const idle = !running && samples.length === 0;
  const canExport = !idle;

  return (
    <div className="caster-clicker-session-stats">
      <div className="caster-clicker-session-stats-header">
        <button
          type="button"
          className="caster-clicker-session-stats-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {t("clicker.session.stats")} {open ? "▾" : "▸"}
          {paused ? t("clicker.session.paused") : ""}
        </button>
        <div className="caster-clicker-session-stats-actions">
          <button
            type="button"
            className="caster-btn caster-btn-ghost caster-clicker-session-stats-btn"
            disabled={!canExport}
            onClick={() => void onCopy()}
          >
            {t("clicker.session.copyStats")}
          </button>
          <button
            type="button"
            className="caster-btn caster-btn-ghost caster-clicker-session-stats-btn"
            disabled={!canExport}
            onClick={() => void onSave("json")}
          >
            {t("clicker.session.exportJson")}
          </button>
          <button
            type="button"
            className="caster-btn caster-btn-ghost caster-clicker-session-stats-btn"
            disabled={!canExport}
            onClick={() => void onSave("csv")}
          >
            {t("clicker.session.exportCsv")}
          </button>
        </div>
      </div>
      {open ? (
        <div className="caster-clicker-session-stats-body">
          {idle ? (
            <p className="caster-clicker-session-stats-empty">
              {t("clicker.session.empty")}
            </p>
          ) : (
            <>
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
            <span>{formatDurationMs(metrics?.elapsedMs ?? 0)}</span>
            {showClicksLimit ? (
              <span className="caster-clicker-session-limit">
                {t("clicker.limits.progressClicks", {
                  done: metrics?.clicksEmitted ?? 0,
                  max: limits!.maxClicks!,
                })}
              </span>
            ) : null}
            {showTimeLimit ? (
              <span className="caster-clicker-session-limit">
                {t("clicker.limits.progressTime", {
                  elapsed: formatClock(metrics?.elapsedMs ?? 0),
                  max: formatClock((limits!.maxDurationSec ?? 0) * 1000),
                })}
              </span>
            ) : null}
            {blocked > 0 ? (
              <span className="caster-clicker-session-blocked">
                {t("clicker.session.filterBlocked", { n: blocked })}
              </span>
            ) : null}
          </div>
            </>
          )}
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

function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
