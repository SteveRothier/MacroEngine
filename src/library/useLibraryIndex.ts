import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { resolveLocale, tStatic, type AppLocale } from "../i18n";
import { vkLabel, formatKeyChord } from "../macros/types";
import { mergeShellPrefs } from "../settings/settingsTypes";
import type {
  LibraryFilterId,
  LibraryFolder,
  LibraryIndexDto,
  LibraryItemView,
  LibraryKind,
} from "./types";

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

function libraryLocale(): AppLocale {
  return resolveLocale(mergeShellPrefs().uiLocale);
}

function macroMetaLabel(m: MacroSummary, locale: AppLocale): string {
  const count = tStatic(locale, "library.meta.actionsCount", { n: m.actionCount });
  const key = m.triggerKey?.trim();
  if (!key) return count;
  const n = Number(key);
  const label =
    !Number.isNaN(n) && n > 0
      ? formatKeyChord(vkLabel(n), m.triggerMods ?? undefined)
      : formatKeyChord(key, m.triggerMods ?? undefined);
  return `${count} · ${label}`;
}

function clickerModeLabel(mode: string, locale: AppLocale): string {
  const m = mode.toLowerCase();
  if (m === "hold") return tStatic(locale, "library.meta.hold");
  if (m === "toggle") return tStatic(locale, "library.meta.toggle");
  return mode;
}

function clickerMetaLabel(p: ClickerSummary, locale: AppLocale): string {
  return `${p.cps.toFixed(0)} CPS · ${clickerModeLabel(p.mode, locale)}`;
}

export function useLibraryIndex(
  kind: LibraryKind,
  options: {
    activeId: string | null;
    favoriteIds: string[];
    dirtyId?: string | null;
    refreshKey?: number;
  },
) {
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [items, setItems] = useState<LibraryItemView[]>([]);
  const [filterId, setFilterId] = useState<LibraryFilterId>("__all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 150);
    return () => window.clearTimeout(t);
  }, [query]);

  const refreshKey = options.refreshKey ?? 0;
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const includeTrash = filterId === "__trash";
      const favoritesOnly = filterId === "__favorites";
      const folderId =
        filterId === "__all" || filterId === "__favorites" || filterId === "__trash"
          ? filterId
          : filterId;

      const index = await invoke<LibraryIndexDto>("list_library_items_cmd", {
        kind,
        folderId: includeTrash || favoritesOnly || filterId === "__all" ? null : folderId,
        query: debouncedQuery || null,
        includeTrash,
        favoritesOnly,
        favoriteIds: favoritesOnly ? options.favoriteIds : [],
      });

      const locale = libraryLocale();
      let metaMap = new Map<string, string>();
      if (kind === "macro") {
        const macros = await invoke<MacroSummary[]>("list_macro_library");
        for (const m of macros) {
          metaMap.set(m.name, macroMetaLabel(m, locale));
        }
      } else {
        const presets = await invoke<ClickerSummary[]>("list_clicker_library");
        for (const p of presets) {
          metaMap.set(p.name, clickerMetaLabel(p, locale));
        }
      }

      setFolders(index.folders);
      setItems(
        index.items.map((it) => ({
          id: it.id,
          name: it.name,
          locked: it.locked,
          folderId: it.folderId ?? null,
          favorite: options.favoriteIds.includes(it.id),
          trashed: it.trashed,
          meta: metaMap.get(it.id) ?? it.meta ?? undefined,
          active: it.id === options.activeId,
          dirty: it.id === options.dirtyId,
          sortOrder: it.sortOrder ?? 0,
        })),
      );
    } catch {
      setFolders([]);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [kind, filterId, debouncedQuery, options.activeId, options.dirtyId, options.favoriteIds, refreshKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createFolder = useCallback(
    async (name: string) => {
      await invoke("create_library_folder_cmd", { kind, name, parentId: null });
      await refresh();
    },
    [kind, refresh],
  );

  const moveItem = useCallback(
    async (id: string, folderId: string | null, beforeId?: string | null) => {
      await invoke("move_library_item_cmd", {
        kind,
        id,
        folderId,
        beforeId: beforeId ?? null,
      });
      await refresh();
    },
    [kind, refresh],
  );

  const setLocked = useCallback(
    async (id: string, locked: boolean) => {
      await invoke("set_library_item_locked_cmd", { kind, id, locked });
      await refresh();
    },
    [kind, refresh],
  );

  const trashItem = useCallback(
    async (id: string) => {
      await invoke("trash_library_item_cmd", { kind, id });
      await refresh();
    },
    [kind, refresh],
  );

  const restoreItem = useCallback(
    async (id: string) => {
      await invoke("restore_library_item_cmd", { kind, id });
      await refresh();
    },
    [kind, refresh],
  );

  const visibleFolders = useMemo(() => folders, [folders]);

  return {
    folders: visibleFolders,
    items,
    filterId,
    setFilterId,
    query,
    setQuery,
    loading,
    refresh,
    createFolder,
    moveItem,
    setLocked,
    trashItem,
    restoreItem,
  };
}
