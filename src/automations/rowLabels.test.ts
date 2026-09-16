import { describe, expect, it } from "vitest";
import { tStatic } from "../i18n";
import {
  favoriteTooltip,
  filterPillTooltip,
  kindTooltip,
  metaTooltip,
  rowSubtitle,
  sortByLabel,
  statusTooltip,
} from "./rowLabels";
import type { AutomationRow } from "./types";

const t = (key: string, vars?: Record<string, string | number>) =>
  tStatic("fr", key, vars);

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
  meta: "28 actions",
};

describe("rowLabels", () => {
  it("kindTooltip includes folder when present", () => {
    expect(kindTooltip(baseRow, t)).toBe("Macro · Dossier : Albion");
    expect(
      kindTooltip({ ...baseRow, kind: "clicker", folderLabel: "—" }, t),
    ).toBe("Clicker preset");
  });

  it("metaTooltip joins trigger folder and last run", () => {
    expect(metaTooltip(baseRow, t)).toBe("F6 · Albion · hier");
    expect(metaTooltip({ ...baseRow, folderLabel: "—" }, t)).toBe("F6 · hier");
  });

  it("rowSubtitle prefers meta and folder over type", () => {
    expect(rowSubtitle(baseRow, t)).toBe("28 actions · Albion");
    expect(
      rowSubtitle(
        {
          ...baseRow,
          kind: "clicker",
          meta: "117 CPS",
          folderLabel: "—",
        },
        t,
      ),
    ).toBe("117 CPS");
    expect(
      rowSubtitle(
        {
          ...baseRow,
          kind: "script",
          meta: undefined,
          folderLabel: "—",
          permLabels: ["réseau"],
        },
        t,
      ),
    ).toBe("1 accès");
    expect(rowSubtitle(baseRow, t, { running: true })).toBe("En cours");
  });

  it("status and favorite tooltips", () => {
    expect(statusTooltip("attention", t)).toBe(
      "Modifications non enregistrées",
    );
    expect(favoriteTooltip(true, t)).toBe("Retirer des favoris");
    expect(favoriteTooltip(false, t)).toBe("Ajouter aux favoris");
  });

  it("toolbar label helpers", () => {
    expect(sortByLabel("name", t)).toBe("Nom");
    expect(filterPillTooltip("recent", t)).toBe("Dernières exécutions");
    expect(filterPillTooltip("favorites", t)).toBe("Favoris uniquement");
  });
});
