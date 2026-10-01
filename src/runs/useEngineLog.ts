import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Default / exported journal line cap (prefs clamp to 40–500). */
export const DEFAULT_JOURNAL_MAX_LINES = 80;

export type JournalLogLevel = "debug" | "info" | "warn" | "error";

export type JournalLine = {
  text: string;
  level: JournalLogLevel;
};

function stampLine(message: string): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `[${hh}:${mm}:${ss}] ${message}`;
}

function parseLevel(raw: unknown): JournalLogLevel {
  if (typeof raw !== "string") return "info";
  const v = raw.toLowerCase();
  if (v === "debug" || v === "info" || v === "warn" || v === "error") return v;
  return "info";
}

export function useEngineLog(maxLines: number = DEFAULT_JOURNAL_MAX_LINES) {
  const [lines, setLines] = useState<JournalLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const cap = Math.min(500, Math.max(40, Math.round(maxLines) || DEFAULT_JOURNAL_MAX_LINES));

  useEffect(() => {
    let cancelled = false;
    void invoke<{ text: string; level: string }[]>("load_journal_log_cmd")
      .then((rows) => {
        if (cancelled) return;
        const mapped = rows.map((r) => ({
          text: r.text,
          level: parseLevel(r.level),
        }));
        setLines(mapped.length > cap ? mapped.slice(-cap) : mapped);
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cap]);

  const push = useCallback(
    (message: string, level: JournalLogLevel = "info") => {
      if (/^hotkeys\b/i.test(message)) return;
      const stamped = /^\[[\d]{2}:[\d]{2}:[\d]{2}\]/.test(message)
        ? message
        : stampLine(message);
      setLines((prev) => {
        const next = [...prev, { text: stamped, level }];
        return next.length > cap ? next.slice(-cap) : next;
      });
    },
    [cap],
  );

  const clear = useCallback(() => {
    setLines([]);
    void invoke("clear_journal_log_cmd").catch(() => {
      /* ignore */
    });
  }, []);

  useEffect(() => {
    setLines((prev) => (prev.length > cap ? prev.slice(-cap) : prev));
  }, [cap]);

  useEffect(() => {
    if (!hydrated) return;
    let un: (() => void) | undefined;
    void listen<{ message?: string | null; level?: string } | string>(
      "engine://log",
      (e) => {
        const payload = e.payload;
        if (typeof payload === "string") {
          if (payload.trim()) push(payload, "info");
          return;
        }
        const msg = payload?.message?.trim() ?? "";
        if (!msg) return;
        push(msg, parseLevel(payload?.level));
      },
    ).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, [push, hydrated]);

  return { lines, clear };
}
