export type QuickKind = "clicker" | "macro";

export type RecentEntry = {
  kind: QuickKind;
  id: string;
  at: number;
};

export type QuickAccess = {
  favorites: {
    clickerPresets: string[];
    macros: string[];
  };
  recent: RecentEntry[];
};

export const EMPTY_QUICK_ACCESS: QuickAccess = {
  favorites: { clickerPresets: [], macros: [] },
  recent: [],
};

/** Recent clicker run without a named preset (must match engine `note_recent_clicker`). */
export const CURRENT_CLICKER_ID = "Config actuelle";
