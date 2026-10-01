import { describe, expect, it } from "vitest";
import { buildReadyItems } from "./ClickerReadyChecklist";
import type { ClickerEditor } from "./useClickerEditor";

function t(key: string, vars?: Record<string, string | number>) {
  if (!vars) return key;
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(`{${k}}`, String(v)),
    key,
  );
}

function stubEditor(partial: Partial<ClickerEditor>): ClickerEditor {
  return {
    pointsEnabled: false,
    points: [],
    targetFixed: false,
    trigger: { type: "manual" },
    timingMode: "rate",
    cps: 10,
    intervalMs: 100,
    limitsEnabled: false,
    zoneModel: {
      corners: {
        topLeft: false,
        topRight: false,
        bottomLeft: false,
        bottomRight: false,
      },
      edges: { left: false, right: false, top: false, bottom: false },
      cornerSize: { w: 40, h: 40 },
      edgeMargin: 20,
      customZones: [],
    },
    ...partial,
  } as ClickerEditor;
}

describe("buildReadyItems", () => {
  it("flags empty point sequence as not ready", () => {
    const items = buildReadyItems(
      stubEditor({ pointsEnabled: true, points: [] }),
      t as never,
    );
    const where = items.find((i) => i.id === "where");
    expect(where?.ok).toBe(false);
    expect(where?.blockId).toBe("target");
  });

  it("treats cursor mode as a valid where target", () => {
    const items = buildReadyItems(stubEditor({}), t as never);
    expect(items.find((i) => i.id === "where")?.ok).toBe(true);
    expect(items.find((i) => i.id === "pace")?.ok).toBe(true);
  });

  it("maps chips to studio tabs", () => {
    const items = buildReadyItems(stubEditor({}), t as never);
    expect(items.find((i) => i.id === "trigger")?.blockId).toBe("entry");
    expect(items.find((i) => i.id === "pace")?.blockId).toBe("entry");
    expect(items.find((i) => i.id === "where")?.blockId).toBe("target");
    expect(items.find((i) => i.id === "safety")?.blockId).toBe("zones");
  });
});
