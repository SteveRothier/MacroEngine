import { describe, expect, it } from "vitest";
import {
  HOME_TAB_ID,
  closeAllDocTabs,
  closeDocTab,
  closeDocTabsToRight,
  closeOtherDocTabs,
  docTabId,
  initialWorkspace,
  nextDocTabId,
  openDocTab,
  openSettings,
  prevDocTabId,
  reorderDocTabs,
  selectHome,
  selectLibrary,
  setTabDirty,
  tabsClosedBy,
  titleBarActiveTabId,
  titleBarHighlightTabId,
  toggleTabPin,
} from "./workspaces";

describe("workspaces", () => {
  it("opens and closes doc tabs", () => {
    let ws = initialWorkspace();
    ws = openDocTab(ws, "macro", "Test", "Test");
    expect(ws.tabs).toHaveLength(1);
    expect(ws.shellView).toEqual({ type: "doc", tabId: docTabId("macro", "Test") });
    ws = setTabDirty(ws, docTabId("macro", "Test"), true);
    expect(ws.tabs[0]?.dirty).toBe(true);
    const again = setTabDirty(ws, docTabId("macro", "Test"), true);
    expect(again).toBe(ws);
    ws = closeDocTab(ws, docTabId("macro", "Test"));
    expect(ws.tabs).toHaveLength(0);
    expect(ws.shellView).toEqual({ type: "home" });
  });

  it("titleBarActiveTabId uses home on home view", () => {
    const ws = selectHome(initialWorkspace());
    expect(titleBarActiveTabId(ws)).toBe(HOME_TAB_ID);
  });

  it("selectLibrary switches shell view", () => {
    const ws = selectLibrary(selectHome(initialWorkspace()));
    expect(ws.shellView).toEqual({ type: "library" });
    expect(titleBarActiveTabId(ws)).toBe(HOME_TAB_ID);
  });

  it("titleBarHighlightTabId keeps underlying tab in settings", () => {
    let ws = initialWorkspace();
    ws = openDocTab(ws, "macro", "A", "A");
    const tabId = docTabId("macro", "A");
    ws = openSettings(ws, "general");
    expect(titleBarHighlightTabId(ws)).toBe(tabId);
    expect(ws.shellView).toMatchObject({ type: "settings", returnTabId: tabId });
  });

  it("titleBarHighlightTabId falls back to home in settings from home", () => {
    let ws = selectHome(initialWorkspace());
    ws = openSettings(ws, "general");
    expect(titleBarHighlightTabId(ws)).toBe(HOME_TAB_ID);
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

  it("reorderDocTabs moves within same pin group", () => {
    let ws = initialWorkspace();
    ws = openDocTab(ws, "macro", "A", "A");
    ws = openDocTab(ws, "macro", "B", "B");
    ws = reorderDocTabs(ws, docTabId("macro", "B"), docTabId("macro", "A"));
    expect(ws.tabs.map((t) => t.resourceId)).toEqual(["B", "A"]);
  });

  it("reorderDocTabs inserts before target with three tabs", () => {
    let ws = initialWorkspace();
    ws = openDocTab(ws, "macro", "A", "A");
    ws = openDocTab(ws, "macro", "B", "B");
    ws = openDocTab(ws, "macro", "C", "C");
    ws = reorderDocTabs(ws, docTabId("macro", "A"), docTabId("macro", "C"));
    expect(ws.tabs.map((t) => t.resourceId)).toEqual(["B", "A", "C"]);
  });

  it("reorderDocTabs appends to pin group end", () => {
    let ws = initialWorkspace();
    ws = openDocTab(ws, "macro", "A", "A");
    ws = openDocTab(ws, "macro", "B", "B");
    ws = openDocTab(ws, "macro", "C", "C");
    ws = reorderDocTabs(ws, docTabId("macro", "A"), null);
    expect(ws.tabs.map((t) => t.resourceId)).toEqual(["B", "C", "A"]);
  });

  it("reorderDocTabs ignores cross pin groups", () => {
    let ws = initialWorkspace();
    ws = openDocTab(ws, "macro", "A", "A");
    ws = openDocTab(ws, "macro", "B", "B");
    ws = toggleTabPin(ws, docTabId("macro", "A"));
    const before = ws.tabs.map((t) => t.id);
    ws = reorderDocTabs(ws, docTabId("macro", "B"), docTabId("macro", "A"));
    expect(ws.tabs.map((t) => t.id)).toEqual(before);
  });

  it("next and prev doc tab ids cycle", () => {
    let ws = initialWorkspace();
    ws = openDocTab(ws, "macro", "A", "A");
    ws = openDocTab(ws, "macro", "B", "B");
    const a = docTabId("macro", "A");
    const b = docTabId("macro", "B");
    expect(nextDocTabId(ws, a)).toBe(b);
    expect(nextDocTabId(ws, b)).toBe(a);
    expect(prevDocTabId(ws, b)).toBe(a);
  });

  it("tabsClosedBy lists removed tabs", () => {
    let ws = initialWorkspace();
    ws = openDocTab(ws, "macro", "A", "A");
    ws = openDocTab(ws, "macro", "B", "B");
    const before = ws;
    ws = closeOtherDocTabs(ws, docTabId("macro", "A"));
    expect(tabsClosedBy(before, ws).map((t) => t.resourceId)).toEqual(["B"]);
  });

  it("closeDocTab refuses pinned tabs", () => {
    let ws = initialWorkspace();
    ws = openDocTab(ws, "macro", "A", "A");
    ws = toggleTabPin(ws, docTabId("macro", "A"));
    const next = closeDocTab(ws, docTabId("macro", "A"));
    expect(next.tabs).toHaveLength(1);
  });
});
