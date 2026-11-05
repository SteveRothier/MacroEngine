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
} from "./workspaces";

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
    let ws = initialWorkspace();
    ws = openDocTab(ws, "macro", "A", "A");
    ws = openDocTab(ws, "macro", "B", "B");
    ws = openDocTab(ws, "clicker", "C", "C");
    ws = toggleTabPin(ws, docTabId("clicker", "C"));
    const keepId = docTabId("macro", "B");
    const next = closeOtherDocTabs(ws, keepId);
    expect(next.tabs.map((t) => t.resourceId).sort()).toEqual(["B", "C"]);
  });

  it("closeDocTabsToRight removes tabs after anchor except pinned", () => {
    let ws = initialWorkspace();
    ws = openDocTab(ws, "macro", "A", "A");
    ws = openDocTab(ws, "macro", "B", "B");
    ws = openDocTab(ws, "clicker", "C", "C");
    ws = openDocTab(ws, "macro", "D", "D");
    ws = toggleTabPin(ws, docTabId("clicker", "C"));
    const anchor = docTabId("macro", "B");
    const next = closeDocTabsToRight(ws, anchor);
    expect(next.tabs.map((t) => t.resourceId)).toEqual(["C", "A", "B"]);
  });

  it("closeAllDocTabs keeps pinned only", () => {
    let ws = initialWorkspace();
    ws = openDocTab(ws, "macro", "A", "A");
    ws = openDocTab(ws, "clicker", "B", "B");
    ws = toggleTabPin(ws, docTabId("macro", "A"));
    const next = closeAllDocTabs(ws);
    expect(next.tabs).toHaveLength(1);
    expect(next.tabs[0]?.resourceId).toBe("A");
  });

  it("toggleTabPin moves tab into pinned section", () => {
    let ws = initialWorkspace();
    ws = openDocTab(ws, "macro", "A", "A");
    ws = openDocTab(ws, "macro", "B", "B");
    ws = toggleTabPin(ws, docTabId("macro", "B"));
    expect(ws.tabs[0]?.resourceId).toBe("B");
    expect(ws.tabs[0]?.pinned).toBe(true);
  });

  it("reorderDocTabs moves within pin group", () => {
    let ws = initialWorkspace();
    ws = openDocTab(ws, "macro", "A", "A");
    ws = openDocTab(ws, "macro", "B", "B");
    ws = openDocTab(ws, "macro", "C", "C");
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
    let ws = initialWorkspace();
    ws = openDocTab(ws, "macro", "A", "A");
    ws = openDocTab(ws, "macro", "B", "B");
    const a = docTabId("macro", "A");
    const b = docTabId("macro", "B");
    expect(nextDocTabId(ws, a)).toBe(b);
    expect(prevDocTabId(ws, a)).toBe(b);
  });

  it("tabsClosedBy lists removed tabs", () => {
    let before = initialWorkspace();
    before = openDocTab(before, "macro", "A", "A");
    before = openDocTab(before, "macro", "B", "B");
    const after = closeDocTab(before, docTabId("macro", "A"));
    expect(tabsClosedBy(before, after).map((t) => t.resourceId)).toEqual(["A"]);
  });
});
