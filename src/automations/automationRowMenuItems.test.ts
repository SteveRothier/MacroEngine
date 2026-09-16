import { describe, expect, it, vi } from "vitest";
import { tStatic } from "../i18n";
import { buildAutomationRowMenuItems } from "./automationRowMenuItems";
import type { AutomationRow } from "./types";

const t = (key: string, vars?: Record<string, string | number>) =>
  tStatic("fr", key, vars);

function baseRow(
  partial: Partial<AutomationRow> & Pick<AutomationRow, "kind" | "id" | "name">,
): AutomationRow {
  return {
    triggerLabel: "",
    folderLabel: "—",
    folderId: null,
    status: "healthy",
    lastRunLabel: "—",
    favorite: false,
    locked: false,
    dirty: false,
    sortOrder: 0,
    ...partial,
  };
}

describe("buildAutomationRowMenuItems", () => {
  it("labels trash for macro/clicker and delete for script", () => {
    const actions = {
      onOpen: vi.fn(),
      onLaunch: vi.fn(),
      onDelete: vi.fn(),
    };
    const macroItems = buildAutomationRowMenuItems(
      baseRow({ kind: "macro", id: "M", name: "M" }),
      t,
      actions,
    );
    const scriptItems = buildAutomationRowMenuItems(
      baseRow({ kind: "script", id: "S", name: "S" }),
      t,
      actions,
    );
    expect(macroItems.find((i) => i.id === "delete")?.label).toBe(
      "Mettre à la corbeille",
    );
    expect(scriptItems.find((i) => i.id === "delete")?.label).toBe(
      "Supprimer",
    );
    expect(scriptItems.find((i) => i.id === "launch")?.label).toBe("Exécuter");
  });

  it("omits current folder and root when already unfiled", () => {
    const onMove = vi.fn();
    const folders = [
      { id: "albion", name: "Albion" },
      { id: "other", name: "Other" },
    ];
    const unfiled = buildAutomationRowMenuItems(
      baseRow({ kind: "macro", id: "M", name: "M", folderId: null }),
      t,
      { onMoveToFolder: onMove, moveFolders: folders },
    );
    const moveUnfiled = unfiled.find((i) => i.id === "move");
    expect(moveUnfiled?.submenu?.map((s) => s.id)).toEqual([
      "move-albion",
      "move-other",
    ]);

    const inAlbion = buildAutomationRowMenuItems(
      baseRow({
        kind: "macro",
        id: "M",
        name: "M",
        folderId: "albion",
        folderLabel: "Albion",
      }),
      t,
      { onMoveToFolder: onMove, moveFolders: folders },
    );
    const moveIn = inAlbion.find((i) => i.id === "move");
    expect(moveIn?.submenu?.map((s) => s.id)).toEqual([
      "move-root",
      "move-other",
    ]);
  });
});
