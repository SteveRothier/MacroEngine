import { describe, expect, it } from "vitest";
import { tStatic } from "../../i18n";
import { emptyMacro } from "../types";
import { graphToMacro } from "./graphToMacro";
import { macroToGraph } from "./macroToGraph";

const tFr = (key: string, vars?: Record<string, string | number>) =>
  tStatic("fr", key, vars);

describe("macroToGraph roundtrip", () => {
  it("preserves linear actions", () => {
    const doc = {
      ...emptyMacro("test"),
      actions: [
        { id: "a1", type: "delay" as const, ms: 50 },
        { id: "a2", type: "key.tap" as const, key: "A" },
      ],
    };
    const graph = macroToGraph(doc, undefined, tFr);
    expect(graph.nodes.some((n) => n.id === "a1")).toBe(true);
    expect(graph.nodes.some((n) => n.id === "a2")).toBe(true);
    const back = graphToMacro(graph, doc);
    expect(back.actions).toHaveLength(2);
    expect(back.actions[0]?.id).toBe("a1");
  });

  it("includes trigger node", () => {
    const doc = emptyMacro("t");
    const graph = macroToGraph(doc, undefined, tFr);
    expect(graph.nodes.find((n) => n.kind === "trigger")).toBeTruthy();
    expect(graph.nodes.find((n) => n.kind === "trigger")?.label).toBe(
      tFr("macros.action.graph.triggerNode"),
    );
  });
});
