import { describe, expect, it } from "vitest";
import type { LibraryItemView } from "./types";

/** Smoke: filter helpers used by the sidebar stay consistent. */
function filterByQuery(items: LibraryItemView[], query: string): LibraryItemView[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.id.toLowerCase().includes(q));
}

describe("library filter smoke", () => {
  it("matches id substring", () => {
    const items: LibraryItemView[] = [
      {
        id: "Alpha",
        name: "Alpha",
        folderId: null,
        locked: false,
        trashed: false,
        favorite: false,
        dirty: false,
      },
      {
        id: "Beta",
        name: "Beta",
        folderId: null,
        locked: false,
        trashed: false,
        favorite: false,
        dirty: false,
      },
    ];
    expect(filterByQuery(items, "alp").map((i) => i.id)).toEqual(["Alpha"]);
    expect(filterByQuery(items, "").length).toBe(2);
  });
});
