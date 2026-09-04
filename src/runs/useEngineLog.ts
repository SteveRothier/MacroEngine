import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

const MAX_LINES = 80;

export function useEngineLog() {
  const [lines, setLines] = useState<string[]>([]);

  const push = useCallback((line: string) => {
    if (/^hotkeys\b/i.test(line)) return;
    setLines((prev) => {
      const next = [...prev, line];
      return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
    });
  }, []);

  const clear = useCallback(() => setLines([]), []);

  useEffect(() => {
    let un: (() => void) | undefined;
    void listen<string>("engine://log", (e) => {
      if (typeof e.payload === "string") push(e.payload);
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, [push]);

  return { lines, clear };
}
