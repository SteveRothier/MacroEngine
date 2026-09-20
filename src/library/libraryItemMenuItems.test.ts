import { describe, expect, it, vi } from "vitest";
import { tStatic } from "../i18n";
import { buildLibraryItemMenuItems } from "../library/libraryItemMenuItems";
import type { LibraryItemView } from "../library/types";

const t = (key: string, vars?: Record<string, string | number>) =>
  tStatic("fr", key, vars);

const item: LibraryItemView = {
  id: "Demo",
  name: "Demo",
  folderId: null,
  locked: false,
  trashed: false,
  sortOrder: 0,
  favorite: false,
};

describe("buildLibraryItemMenuItems", () => {
  it("offers trash when not in trash view", () => {
    const onTrash = vi.fn();
    const items = buildLibraryItemMenuItems(item, {
      t,
      folders: [],
      trashed: false,
      onMove: vi.fn(),
      onToggleLock: vi.fn(),
      onTrash,
      onRestore: vi.fn(),
    });
    expect(items.find((i) => i.id === "trash")?.label).toBe(
      "Mettre à la corbeille",
    );
  });

  it("offers restore when trashed", () => {
    const items = buildLibraryItemMenuItems(
      { ...item, trashed: true },
      {
        t,
        folders: [],
        trashed: true,
        onMove: vi.fn(),
        onToggleLock: vi.fn(),
        onTrash: vi.fn(),
        onRestore: vi.fn(),
        onDelete: vi.fn(),
      },
    );
    expect(items.some((i) => i.id === "restore")).toBe(true);
    expect(items.some((i) => i.id === "delete")).toBe(true);
  });
});
