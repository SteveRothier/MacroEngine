import { describe, expect, it } from "vitest";
import {
  closeAllDocTabs,
  closeDocTab,
  closeDocTabsToRight,
  closeOtherDocTabs,
  docTabId,
  initialWorkspace,
  nextDocTabId,
  openDocTab,
  openSettings,
  normalizeSettingsSection,
  prevDocTabId,
  reorderDocTabs,
  renameDocTab,
  selectEmpty,
  setTabDirty,
  tabsClosedBy,
  titleBarActiveTabId,
  titleBarHighlightTabId,
  toggleTabPin,
  type DocTab,
  type WorkspaceState,
} from "./workspaces";

function wsFromTabs(
  tabs: DocTab[],
  activeId?: string,
): WorkspaceState {
  const tabId = activeId ?? tabs[0]?.id;
  return {
    tabs,
    shellView: tabId
      ? { type: "doc", tabId }
      : { type: "empty" },
  };
}

function tab(
  kind: DocTab["kind"],
  resourceId: string,
  extras?: Partial<DocTab>,
): DocTab {
  return {
    id: docTabId(kind, resourceId),
    kind,
    resourceId,
    label: resourceId,
    dirty: false,
    ...extras,
  };
}

describe("workspaces", () => {
  it("opens and closes doc tabs", () => {
    let ws = initialWorkspace();
    expect(ws.shellView).toEqual({ type: "empty" });
    ws = openDocTab(ws, "macro", "Test", "Test");
    expect(ws.tabs).toHaveLength(1);
    expect(ws.shellView).toEqual({ type: "doc", tabId: docTabId("macro", "Test") });
    ws = setTabDirty(ws, docTabId("macro", "Test"), true);
    expect(ws.tabs[0]?.dirty).toBe(true);
    const again = setTabDirty(ws, docTabId("macro", "Test"), true);
    expect(again).toBe(ws);
    ws = closeDocTab(ws, docTabId("macro", "Test"));
    expect(ws.tabs).toHaveLength(0);
    expect(ws.shellView).toEqual({ type: "empty" });
  });

  it("openDocTab replaces any previous document", () => {
    let ws = openDocTab(initialWorkspace(), "macro", "A", "A");
    ws = openDocTab(ws, "macro", "B", "B");
    expect(ws.tabs.map((t) => t.resourceId)).toEqual(["B"]);
    expect(ws.shellView).toEqual({ type: "doc", tabId: docTabId("macro", "B") });
  });

  it("titleBarActiveTabId is null on empty view", () => {
    const ws = selectEmpty(initialWorkspace());
    expect(titleBarActiveTabId(ws)).toBeNull();
  });

  it("titleBarHighlightTabId keeps underlying tab in settings", () => {
    let ws = initialWorkspace();
    ws = openDocTab(ws, "macro", "A", "A");
    const tabId = docTabId("macro", "A");
    ws = openSettings(ws, "application");
    expect(titleBarHighlightTabId(ws)).toBe(tabId);
    expect(ws.shellView).toMatchObject({ type: "settings", returnTabId: tabId });
  });

  it("titleBarHighlightTabId is null in settings from empty", () => {
    let ws = selectEmpty(initialWorkspace());
    ws = openSettings(ws, "application");
    expect(titleBarHighlightTabId(ws)).toBeNull();
  });

  it("normalizeSettingsSection maps legacy section ids", () => {
    expect(normalizeSettingsSection("general")).toBe("application");
    expect(normalizeSettingsSection("appearance")).toBe("application");
    expect(normalizeSettingsSection("accueil")).toBe("application");
    expect(normalizeSettingsSection("process")).toBe("security");
    expect(normalizeSettingsSection("displays")).toBe("security");
    expect(normalizeSettingsSection("maintenance")).toBe("data");
    expect(normalizeSettingsSection("hotkeys")).toBe("hotkeys");
    expect(normalizeSettingsSection("security")).toBe("security");
    expect(normalizeSettingsSection("unknown")).toBe("application");
  });

  it("openSettings normalizes legacy section ids", () => {
    const ws = openSettings(initialWorkspace(), "process" as never);
    expect(ws.shellView).toMatchObject({ type: "settings", section: "security" });
  });

  it("closeOtherDocTabs keeps pinned tabs", () => {
    const keepId = docTabId("macro", "B");
    const ws = wsFromTabs([
      tab("macro", "A"),
      tab("macro", "B"),
      tab("clicker", "C", { pinned: true }),
    ], keepId);
    const next = closeOtherDocTabs(ws, keepId);
    expect(next.tabs.map((t) => t.resourceId).sort()).toEqual(["B", "C"]);
  });

  it("closeDocTabsToRight removes tabs after anchor except pinned", () => {
    const anchor = docTabId("macro", "B");
    // Pinned tabs sit first (same order as toggleTabPin).
    const ws = wsFromTabs(
      [
        tab("clicker", "C", { pinned: true }),
        tab("macro", "A"),
        tab("macro", "B"),
        tab("macro", "D"),
      ],
      anchor,
    );
    const next = closeDocTabsToRight(ws, anchor);
    expect(next.tabs.map((t) => t.resourceId)).toEqual(["C", "A", "B"]);
  });

  it("closeAllDocTabs keeps pinned only", () => {
    const ws = wsFromTabs([
      tab("macro", "A", { pinned: true }),
      tab("clicker", "B"),
    ]);
    const next = closeAllDocTabs(ws);
    expect(next.tabs).toHaveLength(1);
    expect(next.tabs[0]?.resourceId).toBe("A");
  });

  it("toggleTabPin moves tab into pinned section", () => {
    let ws = wsFromTabs([tab("macro", "A"), tab("macro", "B")]);
    ws = toggleTabPin(ws, docTabId("macro", "B"));
    expect(ws.tabs[0]?.resourceId).toBe("B");
    expect(ws.tabs[0]?.pinned).toBe(true);
  });

  it("reorderDocTabs moves within pin group", () => {
    let ws = wsFromTabs([
      tab("macro", "A"),
      tab("macro", "B"),
      tab("macro", "C"),
    ]);
    ws = reorderDocTabs(ws, docTabId("macro", "C"), docTabId("macro", "A"));
    expect(ws.tabs.map((t) => t.resourceId)).toEqual(["C", "A", "B"]);
  });

  it("renameDocTab updates id and active shell", () => {
    let ws = openDocTab(initialWorkspace(), "macro", "Old", "Old");
    const oldId = docTabId("macro", "Old");
    ws = renameDocTab(ws, oldId, "New", "New");
    expect(ws.tabs[0]?.id).toBe(docTabId("macro", "New"));
    expect(ws.shellView).toEqual({ type: "doc", tabId: docTabId("macro", "New") });
  });

  it("next/prev cycle doc tabs", () => {
    const a = docTabId("macro", "A");
    const b = docTabId("macro", "B");
    const ws = wsFromTabs([tab("macro", "A"), tab("macro", "B")], a);
    expect(nextDocTabId(ws, a)).toBe(b);
    expect(prevDocTabId(ws, a)).toBe(b);
  });

  it("tabsClosedBy lists removed tabs", () => {
    const before = wsFromTabs([tab("macro", "A"), tab("macro", "B")]);
    const after = closeDocTab(before, docTabId("macro", "A"));
    expect(tabsClosedBy(before, after).map((t) => t.resourceId)).toEqual(["A"]);
  });
});
