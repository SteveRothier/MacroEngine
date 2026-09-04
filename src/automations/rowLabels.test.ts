import { describe, expect, it } from "vitest";
import {
  favoriteTooltip,
  filterPillTooltip,
  kindTooltip,
  metaTooltip,
  sortByLabel,
  statusTooltip,
} from "./rowLabels";
import type { AutomationRow } from "./types";

const baseRow: AutomationRow = {
  id: "test-macro",
  name: "Test Macro",
  kind: "macro",
  triggerLabel: "F6",
  folderLabel: "Albion",
  folderId: "f1",
  status: "healthy",
  lastRunLabel: "hier",
  favorite: false,
  locked: false,
  dirty: false,
};

describe("rowLabels", () => {
  it("kindTooltip includes folder when present", () => {
    expect(kindTooltip(baseRow)).toBe("Macro · Dossier : Albion");
    expect(kindTooltip({ ...baseRow, kind: "clicker", folderLabel: "—" })).toBe(
      "Clicker preset",
    );
  });

  it("metaTooltip joins trigger folder and last run", () => {
    expect(metaTooltip(baseRow)).toBe("F6 · Albion · hier");
    expect(metaTooltip({ ...baseRow, folderLabel: "—" })).toBe("F6 · hier");
  });

  it("status and favorite tooltips", () => {
    expect(statusTooltip("attention")).toBe("Modifications non enregistrées");
    expect(favoriteTooltip(true)).toBe("Retirer des favoris");
    expect(favoriteTooltip(false)).toBe("Ajouter aux favoris");
  });

  it("toolbar label helpers", () => {
    expect(sortByLabel("name")).toBe("Nom");
    expect(filterPillTooltip("recent")).toBe(
      "Afficher les dernières exécutions",
    );
  });
});
