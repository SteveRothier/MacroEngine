import type { SettingsSection } from "./types";

const SETTINGS_SECTIONS: SettingsSection[] = [
  "application",
  "hotkeys",
  "security",
  "data",
];

const LEGACY_SETTINGS_SECTIONS: Record<string, SettingsSection> = {
  accueil: "application",
  general: "application",
  appearance: "application",
  process: "security",
  displays: "security",
  maintenance: "data",
};

export function normalizeSettingsSection(section: unknown): SettingsSection {
  if (typeof section !== "string") return "application";
  if ((SETTINGS_SECTIONS as string[]).includes(section)) {
    return section as SettingsSection;
  }
  return LEGACY_SETTINGS_SECTIONS[section] ?? "application";
}

export const HOME_TAB_ID = "home";

export type DocTabKind = "macro" | "clicker" | "script";

export type DocTab = {
  id: string;
  kind: DocTabKind;
  resourceId: string;
  label: string;
  dirty?: boolean;
  pinned?: boolean;
};

export type ShellView =
  | { type: "home" }
  | { type: "library" }
  | { type: "doc"; tabId: string }
  | { type: "settings"; section?: SettingsSection; returnTabId?: string };

export type WorkspaceState = {
  tabs: DocTab[];
  shellView: ShellView;
};

const STORAGE_KEY = "caster-workspace-tabs";
const LEGACY_STORAGE_KEY = "v2-workspace-tabs";

function readStorageRaw(): string | null {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw && !localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, raw);
    }
    return raw;
  } catch {
    return null;
  }
}

type Persisted = {
  tabs: DocTab[];
  activeTabId: string;
  shellView: ShellView["type"];
  settingsSection?: SettingsSection;
};

export function docTabId(kind: DocTabKind, resourceId: string): string {
  return `${kind}:${resourceId}`;
}

export function parseDocTabId(id: string): { kind: DocTabKind; resourceId: string } | null {
  const i = id.indexOf(":");
  if (i <= 0) return null;
  const kind = id.slice(0, i);
  if (kind !== "macro" && kind !== "clicker" && kind !== "script") return null;
  return { kind, resourceId: id.slice(i + 1) };
}

export function sortTabsForDisplay(tabs: DocTab[]): DocTab[] {
  const pinned = tabs.filter((t) => t.pinned);
  const rest = tabs.filter((t) => !t.pinned);
  return [...pinned, ...rest];
}

export function initialWorkspace(): WorkspaceState {
  return {
    tabs: [],
    shellView: { type: "home" },
  };
}

export function loadWorkspace(): WorkspaceState {
  try {
    const raw = readStorageRaw();
    if (!raw) return initialWorkspace();
    const data = JSON.parse(raw) as Persisted;
    const tabs = Array.isArray(data.tabs) ? data.tabs.filter(isValidTab) : [];
    if (data.shellView === "settings") {
      const returnTabId =
        typeof data.activeTabId === "string" &&
        data.activeTabId !== HOME_TAB_ID &&
        tabs.some((t) => t.id === data.activeTabId)
          ? data.activeTabId
          : HOME_TAB_ID;
      return {
        tabs,
        shellView: {
          type: "settings",
          section: normalizeSettingsSection(data.settingsSection),
          returnTabId,
        },
      };
    }
    if (data.shellView === "doc" && data.activeTabId && tabs.some((t) => t.id === data.activeTabId)) {
      return { tabs, shellView: { type: "doc", tabId: data.activeTabId } };
    }
    if (data.shellView === "library") {
      return { tabs, shellView: { type: "library" } };
    }
    return { tabs, shellView: { type: "home" } };
  } catch {
    return initialWorkspace();
  }
}

function isValidTab(t: DocTab): t is DocTab {
  return (
    typeof t.id === "string" &&
    (t.kind === "macro" || t.kind === "clicker" || t.kind === "script") &&
    typeof t.resourceId === "string" &&
    typeof t.label === "string"
  );
}

export function persistWorkspace(state: WorkspaceState): void {
  try {
    const payload: Persisted = {
      tabs: state.tabs.map(({ id, kind, resourceId, label, pinned }) => ({
        id,
        kind,
        resourceId,
        label,
        pinned: pinned || undefined,
      })),
      activeTabId:
        state.shellView.type === "doc"
          ? state.shellView.tabId
          : state.shellView.type === "settings"
            ? (state.shellView.returnTabId ?? HOME_TAB_ID)
            : HOME_TAB_ID,
      shellView: state.shellView.type,
      settingsSection:
        state.shellView.type === "settings" ? state.shellView.section : undefined,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function openDocTab(
  state: WorkspaceState,
  kind: DocTabKind,
  resourceId: string,
  label: string,
): WorkspaceState {
  const id = docTabId(kind, resourceId);
  const exists = state.tabs.find((t) => t.id === id);
  const tabs = exists
    ? state.tabs
    : [...state.tabs, { id, kind, resourceId, label, dirty: false }];
  return {
    tabs,
    shellView: { type: "doc", tabId: id },
  };
}

export function selectHome(state: WorkspaceState): WorkspaceState {
  return { ...state, shellView: { type: "home" } };
}

export function selectLibrary(state: WorkspaceState): WorkspaceState {
  return { ...state, shellView: { type: "library" } };
}

export function selectDocTab(state: WorkspaceState, tabId: string): WorkspaceState {
  if (tabId === HOME_TAB_ID) return selectHome(state);
  if (!state.tabs.some((t) => t.id === tabId)) return state;
  return { ...state, shellView: { type: "doc", tabId } };
}

export function openSettings(
  state: WorkspaceState,
  section: SettingsSection = "application",
): WorkspaceState {
  return {
    ...state,
    shellView: {
      type: "settings",
      section: normalizeSettingsSection(section),
      returnTabId: titleBarActiveTabId(state),
    },
  };
}

function resolveShellAfterClose(
  state: WorkspaceState,
  tabs: DocTab[],
  closedTabId: string,
): ShellView {
  if (state.shellView.type !== "doc" || state.shellView.tabId !== closedTabId) {
    return state.shellView;
  }
  const idx = state.tabs.findIndex((t) => t.id === closedTabId);
  const next = tabs[idx] ?? tabs[idx - 1] ?? tabs[0];
  return next ? { type: "doc", tabId: next.id } : { type: "home" };
}

export function closeDocTab(state: WorkspaceState, tabId: string): WorkspaceState {
  if (tabId === HOME_TAB_ID) return state;
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab || tab.pinned) return state;
  const idx = state.tabs.findIndex((t) => t.id === tabId);
  if (idx < 0) return state;
  const tabs = state.tabs.filter((t) => t.id !== tabId);
  return { tabs, shellView: resolveShellAfterClose(state, tabs, tabId) };
}

export function closeOtherDocTabs(state: WorkspaceState, keepTabId: string): WorkspaceState {
  if (!state.tabs.some((t) => t.id === keepTabId)) return state;
  const tabs = state.tabs.filter((t) => t.id === keepTabId || t.pinned);
  let shellView = state.shellView;
  if (state.shellView.type === "doc") {
    const activeTabId = state.shellView.tabId;
    if (!tabs.some((t) => t.id === activeTabId)) {
      shellView = { type: "doc", tabId: keepTabId };
    }
  }
  return { tabs, shellView };
}

export function closeDocTabsToRight(state: WorkspaceState, fromTabId: string): WorkspaceState {
  const idx = state.tabs.findIndex((t) => t.id === fromTabId);
  if (idx < 0) return state;
  const tabs = state.tabs.filter((t, i) => i <= idx || t.pinned);
  let shellView = state.shellView;
  if (state.shellView.type === "doc") {
    const activeId = state.shellView.tabId;
    if (!tabs.some((t) => t.id === activeId)) {
      shellView = { type: "doc", tabId: fromTabId };
    }
  }
  return { tabs, shellView };
}

export function closeAllDocTabs(state: WorkspaceState): WorkspaceState {
  const tabs = state.tabs.filter((t) => t.pinned);
  if (tabs.length === state.tabs.length && state.shellView.type === "home") return state;
  let shellView: ShellView = { type: "home" };
  if (state.shellView.type === "doc") {
    const activeTabId = state.shellView.tabId;
    const active = state.tabs.find((t) => t.id === activeTabId);
    if (active?.pinned) {
      shellView = { type: "doc", tabId: active.id };
    } else if (tabs.length > 0) {
      shellView = { type: "doc", tabId: tabs[tabs.length - 1]!.id };
    }
  }
  return { tabs, shellView };
}

export function tabsClosedBy(
  before: WorkspaceState,
  after: WorkspaceState,
): DocTab[] {
  const afterIds = new Set(after.tabs.map((t) => t.id));
  return before.tabs.filter((t) => !afterIds.has(t.id));
}

export function toggleTabPin(state: WorkspaceState, tabId: string): WorkspaceState {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab) return state;
  const pinned = !tab.pinned;
  const updated = { ...tab, pinned };
  const rest = state.tabs.filter((t) => t.id !== tabId);
  if (pinned) {
    let insertAt = 0;
    for (let i = rest.length - 1; i >= 0; i--) {
      if (rest[i]!.pinned) {
        insertAt = i + 1;
        break;
      }
    }
    rest.splice(insertAt, 0, updated);
  } else {
    const insertAt = rest.findIndex((t) => !t.pinned);
    rest.splice(insertAt >= 0 ? insertAt : rest.length, 0, updated);
  }
  return { ...state, tabs: rest };
}

export function reorderDocTabs(
  state: WorkspaceState,
  fromTabId: string,
  insertBeforeTabId: string | null,
): WorkspaceState {
  const from = state.tabs.find((t) => t.id === fromTabId);
  if (!from) return state;
  const pinGroup = Boolean(from.pinned);

  if (insertBeforeTabId != null) {
    const before = state.tabs.find((t) => t.id === insertBeforeTabId);
    if (!before || Boolean(before.pinned) !== pinGroup) return state;
    if (fromTabId === insertBeforeTabId) return state;
  }

  const tabs = [...state.tabs];
  const fromIdx = tabs.findIndex((t) => t.id === fromTabId);
  if (fromIdx < 0) return state;

  let insertAt: number;
  if (insertBeforeTabId == null) {
    let lastInGroup = -1;
    for (let i = 0; i < tabs.length; i++) {
      if (Boolean(tabs[i]!.pinned) === pinGroup) lastInGroup = i;
    }
    insertAt = lastInGroup + 1;
  } else {
    insertAt = tabs.findIndex((t) => t.id === insertBeforeTabId);
    if (insertAt < 0) return state;
  }

  if (fromIdx === insertAt || fromIdx + 1 === insertAt) return state;

  const [item] = tabs.splice(fromIdx, 1);
  const adjusted = fromIdx < insertAt ? insertAt - 1 : insertAt;
  tabs.splice(adjusted, 0, item!);
  return { ...state, tabs };
}

export function renameDocTab(
  state: WorkspaceState,
  tabId: string,
  newResourceId: string,
  newLabel: string,
): WorkspaceState {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab) return state;
  const newId = docTabId(tab.kind, newResourceId);
  let shellView = state.shellView;
  if (state.shellView.type === "doc" && state.shellView.tabId === tabId) {
    shellView = { type: "doc", tabId: newId };
  }
  return {
    ...state,
    shellView,
    tabs: state.tabs.map((t) =>
      t.id === tabId
        ? { ...t, id: newId, resourceId: newResourceId, label: newLabel }
        : t,
    ),
  };
}

export function nextDocTabId(state: WorkspaceState, currentId: string | null): string | null {
  const ordered = sortTabsForDisplay(state.tabs);
  if (ordered.length === 0) return null;
  if (!currentId || currentId === HOME_TAB_ID) return ordered[0]!.id;
  const idx = ordered.findIndex((t) => t.id === currentId);
  if (idx < 0) return ordered[0]!.id;
  return ordered[(idx + 1) % ordered.length]!.id;
}

export function prevDocTabId(state: WorkspaceState, currentId: string | null): string | null {
  const ordered = sortTabsForDisplay(state.tabs);
  if (ordered.length === 0) return null;
  if (!currentId || currentId === HOME_TAB_ID) return ordered[ordered.length - 1]!.id;
  const idx = ordered.findIndex((t) => t.id === currentId);
  if (idx < 0) return ordered[ordered.length - 1]!.id;
  return ordered[(idx - 1 + ordered.length) % ordered.length]!.id;
}

export function setTabDirty(
  state: WorkspaceState,
  tabId: string,
  dirty: boolean,
): WorkspaceState {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab || Boolean(tab.dirty) === dirty) return state;
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, dirty } : t)),
  };
}

export function setTabLabel(
  state: WorkspaceState,
  tabId: string,
  label: string,
): WorkspaceState {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab || tab.label === label) return state;
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, label } : t)),
  };
}

export function activeDocTab(state: WorkspaceState): DocTab | null {
  const view = state.shellView;
  if (view.type !== "doc") return null;
  return state.tabs.find((t) => t.id === view.tabId) ?? null;
}

export function titleBarActiveTabId(state: WorkspaceState): string {
  if (state.shellView.type === "doc") return state.shellView.tabId;
  return HOME_TAB_ID;
}

export function titleBarHighlightTabId(state: WorkspaceState): string {
  if (state.shellView.type === "settings") {
    const id = state.shellView.returnTabId ?? HOME_TAB_ID;
    if (id !== HOME_TAB_ID && state.tabs.some((t) => t.id === id)) return id;
    return HOME_TAB_ID;
  }
  return titleBarActiveTabId(state);
}
