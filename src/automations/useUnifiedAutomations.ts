import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  formatKeyChord,
  vkLabel,
  type HotkeyBindings,
} from "../macros/types";
import type { LibraryFolder, LibraryIndexDto } from "../library/types";
import type { QuickAccess } from "../quickAccess";
import type { ScriptDoc } from "../scripts/types";
import { activePermissionLabels } from "../scripts/ScriptPermissionsMenu";
import type {
  AutomationFilter,
  AutomationFolderOption,
  AutomationRow,
  FilterCounts,
} from "./types";
import { folderOptionKey } from "./types";
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

function toFolderOptions(
  kind: "macro" | "clicker",
  folders: LibraryFolder[],
): AutomationFolderOption[] {
  return folders.map((f) => ({ id: f.id, name: f.name, kind }));
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
  dirtyScriptId?: string | null;
  refreshKey?: number;
  query?: string;
  filter?: AutomationFilter;
  folderKey?: string | null;
  setQuery?: (q: string) => void;
}) {
  const [rows, setRows] = useState<AutomationRow[]>([]);
  const [recentOrder, setRecentOrder] = useState<string[]>([]);
  const [folders, setFolders] = useState<AutomationFolderOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [internalQuery, setInternalQuery] = useState("");
  const query = options.query ?? internalQuery;
  const filter = options.filter ?? "all";
  const folderKey = options.folderKey ?? null;
  const setQuery = options.setQuery ?? setInternalQuery;
  const [hotkeys, setHotkeys] = useState<HotkeyBindings | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [macroIndex, clickerIndex, macros, clickers, scripts, qa, hk] =
        await Promise.all([
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
          invoke<ScriptDoc[]>("list_scripts_cmd").catch(() => [] as ScriptDoc[]),
          invoke<QuickAccess>("get_quick_access"),
          invoke<HotkeyBindings>("get_hotkey_bindings"),
        ]);
      setHotkeys(hk);
      const favMacros = qa.favorites.macros ?? [];
      const favClickers = qa.favorites.clickerPresets ?? [];
      setRecentOrder(qa.recent.map((r) => rowKey(r.kind, r.id)));
      const runLabels = lastRunLabelMap(qa.recent);
      setFolders([
        ...toFolderOptions("macro", macroIndex.folders),
        ...toFolderOptions("clicker", clickerIndex.folders),
      ]);

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

      for (const s of scripts) {
        const permLabels = activePermissionLabels(s);
        next.push({
          id: s.id,
          name: s.name,
          kind: "script",
          triggerLabel: "Script",
          folderLabel: "—",
          folderId: null,
          status: options.dirtyScriptId === s.id ? "attention" : "healthy",
          lastRunLabel: runLabels.get(rowKey("script", s.id)) ?? "—",
          favorite: false,
          locked: false,
          dirty: options.dirtyScriptId === s.id,
          meta: undefined,
          permLabels,
        });
      }

      setRows(next);
    } catch {
      setRows([]);
      setRecentOrder([]);
    } finally {
      setLoading(false);
    }
  }, [options.dirtyMacroId, options.dirtyClickerId, options.dirtyScriptId]);

  useEffect(() => {
    void refresh();
  }, [refresh, options.refreshKey]);

  const counts: FilterCounts = useMemo(() => {
    const recentSet = new Set(recentOrder);
    return {
      all: rows.length,
      favorites: rows.filter((r) => r.favorite).length,
      recent: rows.filter((r) => recentSet.has(rowKey(r.kind, r.id))).length,
      scripts: rows.filter((r) => r.kind === "script").length,
    };
  }, [rows, recentOrder]);

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
    } else if (filter === "scripts") {
      list = list.filter((r) => r.kind === "script");
    }
    if (folderKey) {
      list = list.filter((r) => {
        if (r.kind === "script" || !r.folderId) return false;
        return folderOptionKey({ kind: r.kind, id: r.folderId }) === folderKey;
      });
    }
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.triggerLabel.toLowerCase().includes(q) ||
        r.folderLabel.toLowerCase().includes(q) ||
        (r.meta?.toLowerCase().includes(q) ?? false),
    );
  }, [rows, query, filter, folderKey, recentOrder]);

  return {
    rows: filtered,
    allRows: rows,
    folders,
    counts,
    loading,
    query,
    filter,
    setQuery,
    refresh,
    hotkeys,
  };
}
