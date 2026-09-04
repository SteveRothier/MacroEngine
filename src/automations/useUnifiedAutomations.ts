import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  formatKeyChord,
  vkLabel,
  type HotkeyBindings,
} from "../macros/types";
import type { LibraryFolder, LibraryIndexDto } from "../library/types";
import type { QuickAccess } from "../quickAccess";
import type { AutomationFilter, AutomationRow } from "./types";
import { lastRunLabelMap, rowKey } from "./relativeTime";

type MacroSummary = {
  name: string;
  actionCount: number;
  triggerKey?: string | null;
  triggerMods?: { ctrl?: boolean; alt?: boolean; shift?: boolean } | null;
  folderId?: string | null;
  locked?: boolean;
};

type ClickerSummary = {
  name: string;
  cps: number;
  mode: string;
};

function folderName(folders: LibraryFolder[], id: string | null): string {
  if (!id) return "—";
  return folders.find((f) => f.id === id)?.name ?? "—";
}

function macroTriggerLabel(m: MacroSummary): string {
  const key = m.triggerKey?.trim();
  if (!key) return "Manuel";
  const n = Number(key);
  if (!Number.isNaN(n) && n > 0) {
    return formatKeyChord(vkLabel(n), m.triggerMods ?? undefined);
  }
  return key;
}

function clickerTriggerLabel(hotkeys: HotkeyBindings): string {
  const parts: string[] = [];
  if (hotkeys.actionCtrl) parts.push("Ctrl");
  if (hotkeys.actionAlt) parts.push("Alt");
  if (hotkeys.actionShift) parts.push("Shift");
  parts.push(vkLabel(hotkeys.actionVk));
  return parts.join("+");
}

export function useUnifiedAutomations(options: {
  dirtyMacroId?: string | null;
  dirtyClickerId?: string | null;
  refreshKey?: number;
  query?: string;
  filter?: AutomationFilter;
  setQuery?: (q: string) => void;
}) {
  const [rows, setRows] = useState<AutomationRow[]>([]);
  const [recentOrder, setRecentOrder] = useState<string[]>([]);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [internalQuery, setInternalQuery] = useState("");
  const query = options.query ?? internalQuery;
  const filter = options.filter ?? "all";
  const setQuery = options.setQuery ?? setInternalQuery;
  const [hotkeys, setHotkeys] = useState<HotkeyBindings | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [macroIndex, clickerIndex, macros, clickers, qa, hk] = await Promise.all([
        invoke<LibraryIndexDto>("list_library_items_cmd", {
          kind: "macro",
          folderId: null,
          query: null,
          includeTrash: false,
          favoritesOnly: false,
          favoriteIds: [],
        }),
        invoke<LibraryIndexDto>("list_library_items_cmd", {
          kind: "clicker",
          folderId: null,
          query: null,
          includeTrash: false,
          favoritesOnly: false,
          favoriteIds: [],
        }),
        invoke<MacroSummary[]>("list_macro_library"),
        invoke<ClickerSummary[]>("list_clicker_library"),
        invoke<QuickAccess>("get_quick_access"),
        invoke<HotkeyBindings>("get_hotkey_bindings"),
      ]);
      setHotkeys(hk);
      const favMacros = qa.favorites.macros ?? [];
      const favClickers = qa.favorites.clickerPresets ?? [];
      setRecentOrder(qa.recent.map((r) => rowKey(r.kind, r.id)));
      const runLabels = lastRunLabelMap(qa.recent);
      const allFolders = [...macroIndex.folders, ...clickerIndex.folders];
      setFolders(allFolders);

      const macroMap = new Map(macros.map((m) => [m.name, m]));
      const clickerMap = new Map(clickers.map((c) => [c.name, c]));

      const next: AutomationRow[] = [];

      for (const it of macroIndex.items) {
        if (it.trashed) continue;
        const m = macroMap.get(it.id);
        next.push({
          id: it.id,
          name: it.name,
          kind: "macro",
          triggerLabel: m ? macroTriggerLabel(m) : "Manuel",
          folderLabel: folderName(macroIndex.folders, it.folderId ?? null),
          folderId: it.folderId ?? null,
          status: it.locked
            ? "locked"
            : options.dirtyMacroId === it.id
              ? "attention"
              : "healthy",
          lastRunLabel: runLabels.get(rowKey("macro", it.id)) ?? "—",
          favorite: favMacros.includes(it.id),
          locked: it.locked,
          dirty: options.dirtyMacroId === it.id,
          meta: m ? `${m.actionCount} actions` : undefined,
        });
      }

      for (const it of clickerIndex.items) {
        if (it.trashed) continue;
        const c = clickerMap.get(it.id);
        next.push({
          id: it.id,
          name: it.name,
          kind: "clicker",
          triggerLabel: hk ? clickerTriggerLabel(hk) : "F6",
          folderLabel: folderName(clickerIndex.folders, it.folderId ?? null),
          folderId: it.folderId ?? null,
          status: it.locked
            ? "locked"
            : options.dirtyClickerId === it.id
              ? "attention"
              : "healthy",
          lastRunLabel: runLabels.get(rowKey("clicker", it.id)) ?? "—",
          favorite: favClickers.includes(it.id),
          locked: it.locked,
          dirty: options.dirtyClickerId === it.id,
          meta: c ? `${c.cps.toFixed(0)} CPS` : undefined,
        });
      }

      setRows(next);
    } catch {
      setRows([]);
      setRecentOrder([]);
    } finally {
      setLoading(false);
    }
  }, [options.dirtyMacroId, options.dirtyClickerId]);

  useEffect(() => {
    void refresh();
  }, [refresh, options.refreshKey]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter === "favorites") {
      list = list.filter((r) => r.favorite);
    } else if (filter === "recent") {
      const order = new Map(recentOrder.map((key, index) => [key, index]));
      list = list
        .filter((r) => order.has(rowKey(r.kind, r.id)))
        .sort(
          (a, b) =>
            (order.get(rowKey(a.kind, a.id)) ?? 0) -
            (order.get(rowKey(b.kind, b.id)) ?? 0),
        );
    }
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.triggerLabel.toLowerCase().includes(q) ||
        r.folderLabel.toLowerCase().includes(q),
    );
  }, [rows, query, filter, recentOrder]);

  return {
    rows: filtered,
    allRows: rows,
    folders,
    loading,
    query,
    filter,
    setQuery,
    refresh,
    hotkeys,
  };
}
