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
});
