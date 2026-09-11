import { describe, expect, it } from "vitest";
import {
  duplicateAtPath,
  getAtPath,
  insertAtPath,
  type MacroAction,
} from "./types";

const click = (id: string): MacroAction => ({
  id,
  type: "mouse.click",
  button: "left",
});

const delay = (id: string, ms: number): MacroAction => ({
  id,
  type: "delay",
  ms,
});

describe("insertAtPath / duplicateAtPath", () => {
  it("inserts at root index", () => {
    const actions = [click("a"), click("b")];
    const next = insertAtPath(actions, [1], delay("d", 50));
    expect(next.map((a) => a.id)).toEqual(["a", "d", "b"]);
  });

  it("duplicates after source with new ids", () => {
    const actions = [click("a"), delay("b", 100)];
    const result = duplicateAtPath(actions, [0]);
    expect(result).not.toBeNull();
    expect(result!.newPath).toEqual([1]);
    expect(result!.actions).toHaveLength(3);
    expect(result!.actions[0]!.id).toBe("a");
    expect(result!.actions[1]!.id).not.toBe("a");
    expect(result!.actions[1]!.type).toBe("mouse.click");
    expect(result!.actions[2]!.id).toBe("b");
  });

  it("duplicates inside if then branch", () => {
    const actions: MacroAction[] = [
      {
        id: "if1",
        type: "control.if",
        condition: { left: { var: "n" }, op: "gt", right: 0 },
        then: [click("t0"), delay("t1", 10)],
        else: [],
      },
    ];
    const result = duplicateAtPath(actions, [0, 0, 0]);
    expect(result).not.toBeNull();
    const parent = getAtPath(result!.actions, [0]);
    expect(parent?.type).toBe("control.if");
    if (parent?.type === "control.if") {
      expect(parent.then).toHaveLength(3);
      expect(parent.then![0]!.id).toBe("t0");
      expect(parent.then![1]!.id).not.toBe("t0");
      expect(parent.then![2]!.id).toBe("t1");
    }
  });
});
