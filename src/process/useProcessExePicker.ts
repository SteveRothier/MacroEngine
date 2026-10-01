import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  normalizeExeName,
  type ProcessFilter,
} from "./types";

export type ProcessExeEntry = {
  name: string;
  path: string;
  iconDataUrl?: string | null;
};

export type ProcessExeRow = ProcessExeEntry & {
  foreground: boolean;
  inFilter: boolean;
};

const POLL_MS = 2000;

/** Live visible exes + foreground for the process filter picker. */
export function useProcessExePicker(listedNames: string[]) {
  const [liveEntries, setLiveEntries] = useState<ProcessExeEntry[]>([]);
  const [foregroundExe, setForegroundExe] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const listed = useMemo(
    () => new Set(listedNames.map((n) => normalizeExeName(n))),
    [listedNames],
  );

  const refresh = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    try {
      const [entries, fg] = await Promise.all([
        invoke<ProcessExeEntry[]>("list_process_exe_entries"),
        invoke<string | null>("get_foreground_exe").catch(() => null),
      ]);
      const byName = new Map<string, ProcessExeEntry>();
      for (const e of entries ?? []) {
        const name = normalizeExeName(e.name || e.path);
        if (!name || byName.has(name)) continue;
        byName.set(name, {
          name,
          path: e.path,
          iconDataUrl: e.iconDataUrl ?? null,
        });
      }
      setLiveEntries(
        [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setForegroundExe(fg ? normalizeExeName(fg) : null);
    } catch {
      setLiveEntries([]);
      setForegroundExe(null);
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh({ quiet: true }), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const rows = useMemo((): ProcessExeRow[] => {
    const mapped: ProcessExeRow[] = liveEntries.map((e) => ({
      ...e,
      foreground: e.name === foregroundExe,
      inFilter: listed.has(e.name),
    }));
    if (
      foregroundExe &&
      !mapped.some((r) => r.name === foregroundExe)
    ) {
      mapped.unshift({
        name: foregroundExe,
        path: foregroundExe,
        iconDataUrl: null,
        foreground: true,
        inFilter: listed.has(foregroundExe),
      });
    }
    mapped.sort((a, b) => {
      if (a.foreground !== b.foreground) return a.foreground ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return mapped;
  }, [liveEntries, listed, foregroundExe]);

  const iconsByName = useMemo(() => {
    const map = new Map<string, string | null | undefined>();
    for (const e of liveEntries) map.set(e.name, e.iconDataUrl);
    return map;
  }, [liveEntries]);

  return { rows, iconsByName, loading, refresh, listed };
}

export function addProcessName(
  localFilter: ProcessFilter,
  raw: string,
): ProcessFilter | null {
  const name = normalizeExeName(raw);
  if (!name || localFilter.names.some((n) => normalizeExeName(n) === name)) {
    return null;
  }
  return {
    ...localFilter,
    names: [...localFilter.names, name],
  };
}

export function removeProcessName(
  localFilter: ProcessFilter,
  raw: string,
): ProcessFilter {
  const name = normalizeExeName(raw);
  return {
    ...localFilter,
    names: localFilter.names.filter((n) => normalizeExeName(n) !== name),
  };
}

export function withLocalEnabled(filter: ProcessFilter): ProcessFilter {
  return filter.enabled ? filter : { ...filter, enabled: true };
}
