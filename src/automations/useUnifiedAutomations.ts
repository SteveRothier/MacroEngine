import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  formatKeyChord,
  vkLabel,
  type HotkeyBindings,
} from "../macros/types";
import type { LibraryFolder, LibraryIndexDto } from "../library/types";
import type { QuickAccess, RecentRunStatus } from "../quickAccess";
import type { ScriptDoc } from "../scripts/types";
import { activePermissionLabels } from "../scripts/ScriptPermissionsMenu";
import { useLocale, useT, type TFunction } from "../i18n";
import type {
  AutomationFilter,
  AutomationFolderOption,
  AutomationRow,
  AutomationStatus,
  FilterCounts,
} from "./types";
import {
  lastRunLabelMap,
  lastRunStatusMap,
  lastRunTooltipMap,
  rowKey,
} from "./relativeTime";

function rowEditorStatus(
  locked: boolean,
  dirty: boolean,
  lastRun: RecentRunStatus | undefined,
): AutomationStatus {
  if (locked) return "locked";
  if (dirty) return "attention";
  if (lastRun === "error") return "failed";
  return "healthy";
}

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

function folderName(
  folders: LibraryFolder[],
  id: string | null,
  t: TFunction,
): string {
  if (!id) return t("common.empty");
  return folders.find((f) => f.id === id)?.name ?? t("common.empty");
}

function toFolderOptions(folders: LibraryFolder[]): AutomationFolderOption[] {
  const seen = new Set<string>();
  const out: AutomationFolderOption[] = [];
  for (const f of folders) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push({ id: f.id, name: f.name });
  }
  return out;
}

function macroTriggerLabel(m: MacroSummary, t: TFunction): string {
  const key = m.triggerKey?.trim();
  if (!key) return t("automations.trigger.manual");
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
  setQuery?: (q: string) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [rows, setRows] = useState<AutomationRow[]>([]);
  const [recentOrder, setRecentOrder] = useState<string[]>([]);
  const [folders, setFolders] = useState<AutomationFolderOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [internalQuery, setInternalQuery] = useState("");
  const query = options.query ?? internalQuery;
  const filter = options.filter ?? "all";
  const setQuery = options.setQuery ?? setInternalQuery;
  const [hotkeys, setHotkeys] = useState<HotkeyBindings | null>(null);
  const hasLoadedRef = useRef(false);
  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true || hasLoadedRef.current;
    if (!silent) setLoading(true);
    try {
      const home = await invoke<{
        macros: LibraryIndexDto;
        clickers: LibraryIndexDto;
        scriptsLibrary: LibraryIndexDto;
        macroSummaries: MacroSummary[];
        clickerSummaries: ClickerSummary[];
        scripts: ScriptDoc[];
        quickAccess: QuickAccess;
        hotkeys: HotkeyBindings;
      }>("get_automations_home_cmd");
      const macroIndex = home.macros;
      const clickerIndex = home.clickers;
      const scriptsLibrary = home.scriptsLibrary ?? {
        folders: [],
        items: [],
        trash: [],
      };
      const macros = home.macroSummaries;
      const clickers = home.clickerSummaries;
      const scripts = home.scripts ?? [];
      const qa = home.quickAccess;
      const hk = home.hotkeys;
      setHotkeys(hk);
      const favMacros = qa.favorites.macros ?? [];
      const favClickers = qa.favorites.clickerPresets ?? [];
      setRecentOrder(qa.recent.map((r) => rowKey(r.kind, r.id)));
      const runLabels = lastRunLabelMap(qa.recent, t, locale);
      const runTooltips = lastRunTooltipMap(qa.recent, t, locale);
      const runStatuses = lastRunStatusMap(qa.recent);
      const allFolders = [
        ...macroIndex.folders,
        ...clickerIndex.folders,
        ...scriptsLibrary.folders,
      ];
      setFolders(toFolderOptions(allFolders));

      const macroMap = new Map(macros.map((m) => [m.name, m]));
      const clickerMap = new Map(clickers.map((c) => [c.name, c]));
      const scriptLibById = new Map(
        scriptsLibrary.items.map((it) => [it.id, it]),
      );
      const empty = t("common.empty");

      const next: AutomationRow[] = [];

      for (const it of macroIndex.items) {
        if (it.trashed) continue;
        const m = macroMap.get(it.id);
        next.push({
          id: it.id,
          name: it.name,
          kind: "macro",
          triggerLabel: m
            ? macroTriggerLabel(m, t)
            : t("automations.trigger.manual"),
          folderLabel: folderName(allFolders, it.folderId ?? null, t),
          folderId: it.folderId ?? null,
          status: rowEditorStatus(
            !!it.locked,
            options.dirtyMacroId === it.id,
            runStatuses.get(rowKey("macro", it.id)),
          ),
          lastRunLabel: runLabels.get(rowKey("macro", it.id)) ?? empty,
          lastRunTooltip: runTooltips.get(rowKey("macro", it.id)),
          favorite: favMacros.includes(it.id),
          locked: it.locked,
          dirty: options.dirtyMacroId === it.id,
          meta: m
            ? t("automations.row.metaActions", { count: m.actionCount })
            : undefined,
          sortOrder: it.sortOrder ?? 0,
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
          folderLabel: folderName(allFolders, it.folderId ?? null, t),
          folderId: it.folderId ?? null,
          status: rowEditorStatus(
            !!it.locked,
            options.dirtyClickerId === it.id,
            runStatuses.get(rowKey("clicker", it.id)),
          ),
          lastRunLabel: runLabels.get(rowKey("clicker", it.id)) ?? empty,
          lastRunTooltip: runTooltips.get(rowKey("clicker", it.id)),
          favorite: favClickers.includes(it.id),
          locked: it.locked,
          dirty: options.dirtyClickerId === it.id,
          meta: c
            ? t("automations.row.metaCps", { cps: c.cps.toFixed(0) })
            : undefined,
          sortOrder: it.sortOrder ?? 0,
        });
      }

      for (const s of scripts) {
        const lib = scriptLibById.get(s.id);
        if (lib?.trashed) continue;
        const folderId = lib?.folderId ?? null;
        const permLabels = activePermissionLabels(s, t);
        next.push({
          id: s.id,
          name: s.name,
          kind: "script",
          triggerLabel: t("automations.trigger.script"),
          folderLabel: folderName(allFolders, folderId, t),
          folderId,
          status: rowEditorStatus(
            !!lib?.locked,
            options.dirtyScriptId === s.id,
            runStatuses.get(rowKey("script", s.id)),
          ),
          lastRunLabel: runLabels.get(rowKey("script", s.id)) ?? empty,
          lastRunTooltip: runTooltips.get(rowKey("script", s.id)),
          favorite: false,
          locked: lib?.locked ?? false,
          dirty: options.dirtyScriptId === s.id,
          meta: undefined,
          sortOrder: lib?.sortOrder ?? 0,
          permLabels,
        });
      }

      setRows(next);
      hasLoadedRef.current = true;
    } catch {
      if (!silent) {
        setRows([]);
        setRecentOrder([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [
    options.dirtyMacroId,
    options.dirtyClickerId,
    options.dirtyScriptId,
    t,
    locale,
  ]);

  useEffect(() => {
    // refreshKey bumps (sidebar / post-DnD) must stay silent once loaded —
    // a loading skeleton mid-session breaks subsequent Accueil DnD gestures.
    void refresh({ silent: hasLoadedRef.current });
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
  }, [rows, query, filter, recentOrder]);

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
