import { describe, expect, it } from "vitest";
import { findMenuItem, type MenuItemDef } from "./MenuItemsList";

describe("findMenuItem", () => {
  const items: MenuItemDef[] = [
    { id: "copy", label: "Copier" },
    {
      id: "ajout",
      label: "Ajout",
      submenu: [
        {
          id: "insert-before",
          label: "Insérer avant",
          submenu: [
            { id: "before-click", label: "Clic" },
            { id: "before-delay", label: "Délai" },
          ],
        },
        { id: "insert-after", label: "Insérer après" },
      ],
    },
  ];

  it("finds top-level items", () => {
    expect(findMenuItem(items, "copy")?.label).toBe("Copier");
  });

  it("finds nested submenu leaves", () => {
    expect(findMenuItem(items, "before-delay")?.label).toBe("Délai");
    expect(findMenuItem(items, "insert-after")?.label).toBe("Insérer après");
  });

  it("returns undefined when missing", () => {
    expect(findMenuItem(items, "missing")).toBeUndefined();
  });
});
