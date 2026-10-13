import { describe, expect, it } from "vitest";
import {
  conditionFamily,
  formatCond,
  parseLit,
  setConditionFamily,
  switchOperandMode,
  operandMode,
} from "./conditionOps";

describe("formatCond", () => {
  it("uses comparison symbols instead of op codes", () => {
    expect(
      formatCond({
        left: { var: "n" },
        op: "gt",
        right: 0,
      }),
    ).toBe("$n > 0");
    expect(
      formatCond({
        left: { var: "x" },
        op: "eq",
        right: "ok",
      }),
    ).toBe('$x = "ok"');
    expect(
      formatCond({
        left: 1,
        op: "lte",
        right: { var: "max" },
      }),
    ).toBe("1 ≤ $max");
  });

  it("formats string ops and empty", () => {
    expect(
      formatCond({
        left: { var: "msg" },
        op: "contains",
        right: "hi",
      }),
    ).toBe('$msg ∋ "hi"');
    expect(
      formatCond({
        left: { var: "msg" },
        op: "empty",
        right: "",
      }),
    ).toBe("$msg ∅");
  });

  it("formats process predicates", () => {
    expect(
      formatCond({
        predicate: "process.eq",
        value: "notepad.exe",
        left: 0,
        op: "eq",
        right: 0,
      }),
    ).toBe("process = notepad.exe");
    expect(
      formatCond({
        predicate: "process.contains",
        value: "game",
        left: 0,
        op: "eq",
        right: 0,
      }),
    ).toBe("process ∋ game");
    expect(
      formatCond({
        predicate: "process.running",
        value: "chrome.exe",
        left: 0,
        op: "eq",
        right: 0,
      }),
    ).toBe("running chrome.exe");
  });

  it("formats new predicate families", () => {
    expect(
      formatCond({
        predicate: "window.title.contains",
        value: "Notes",
        left: 0,
        op: "eq",
        right: 0,
      }),
    ).toBe("title ∋ Notes");
    expect(
      formatCond({
        predicate: "pixel.color",
        left: 0,
        op: "eq",
        right: 0,
        params: { x: 10, y: 20, color: "#ff0000" },
      }),
    ).toBe("pixel(10,20) ≈ #ff0000");
    expect(
      formatCond({
        predicate: "mouse.inRect",
        left: 0,
        op: "eq",
        right: 0,
        params: { x1: 0, y1: 0, x2: 100, y2: 50 },
      }),
    ).toBe("mouse ∈ (0,0)–(100,50)");
    expect(
      formatCond({
        predicate: "key.down",
        left: 0,
        op: "eq",
        right: 0,
        params: { key: "F1", mods: { ctrl: true } },
      }),
    ).toBe("key Ctrl+F1");
    expect(
      formatCond({
        predicate: "time.compare",
        left: 0,
        op: "eq",
        right: 0,
        params: { unit: "hour", op: "gte", value: 14 },
      }),
    ).toBe("hour ≥ 14");
    expect(
      formatCond({
        predicate: "clipboard.contains",
        value: "ok",
        left: 0,
        op: "eq",
        right: 0,
      }),
    ).toBe("clip ∋ ok");
    expect(
      formatCond({
        predicate: "clipboard.empty",
        left: 0,
        op: "eq",
        right: 0,
      }),
    ).toBe("clip ∅");
    expect(
      formatCond({
        predicate: "var.defined",
        value: "score",
        left: 0,
        op: "eq",
        right: 0,
      }),
    ).toBe("var score?");
    expect(
      formatCond({
        predicate: "mouse.button.down",
        left: 0,
        op: "eq",
        right: 0,
        params: { button: "right" },
      }),
    ).toBe("mouse right down");
  });
});

describe("setConditionFamily", () => {
  it("clears predicate when switching to compare", () => {
    const next = setConditionFamily(
      {
        predicate: "process.eq",
        value: "x.exe",
        left: { var: "n" },
        op: "gt",
        right: 0,
      },
      "compare",
    );
    expect(conditionFamily(next)).toBe("compare");
    expect(next.predicate).toBeUndefined();
    expect(next.left).toEqual({ var: "n" });
  });

  it("seeds pixel params", () => {
    const next = setConditionFamily(
      { left: { var: "n" }, op: "gt", right: 0 },
      "pixel",
    );
    expect(next.predicate).toBe("pixel.color");
    expect(next.params?.color).toBe("#ffffff");
  });

  it("seeds key and time families", () => {
    expect(setConditionFamily({ left: 0, op: "eq", right: 0 }, "key").predicate).toBe(
      "key.down",
    );
    expect(
      setConditionFamily({ left: 0, op: "eq", right: 0 }, "time").predicate,
    ).toBe("time.compare");
  });

  it("seeds clipboard and variable families", () => {
    expect(
      setConditionFamily({ left: 0, op: "eq", right: 0 }, "clipboard").predicate,
    ).toBe("clipboard.contains");
    expect(
      setConditionFamily({ left: 0, op: "eq", right: 0 }, "variable").predicate,
    ).toBe("var.defined");
  });
});

describe("conditionFamily", () => {
  it("detects families from predicate", () => {
    expect(
      conditionFamily({
        predicate: "window.title.eq",
        left: 0,
        op: "eq",
        right: 0,
      }),
    ).toBe("window");
    expect(
      conditionFamily({
        predicate: "mouse.inRect",
        left: 0,
        op: "eq",
        right: 0,
      }),
    ).toBe("mouse");
  });
});

describe("switchOperandMode", () => {
  it("preserves literal text as var name", () => {
    expect(switchOperandMode(42, "var")).toEqual({ var: "42" });
    expect(switchOperandMode("score", "var")).toEqual({ var: "score" });
  });

  it("parses var name back to literal when possible", () => {
    expect(switchOperandMode({ var: "3.5" }, "lit")).toBe(3.5);
    expect(switchOperandMode({ var: "true" }, "lit")).toBe(true);
    expect(switchOperandMode({ var: "hello" }, "lit")).toBe("hello");
  });

  it("is a no-op when mode already matches", () => {
    expect(switchOperandMode({ var: "n" }, "var")).toEqual({ var: "n" });
    expect(switchOperandMode(0, "lit")).toBe(0);
  });
});

describe("parseLit / operandMode", () => {
  it("classifies operands", () => {
    expect(operandMode({ var: "n" })).toBe("var");
    expect(operandMode(0)).toBe("lit");
  });

  it("parses literals", () => {
    expect(parseLit("12")).toBe(12);
    expect(parseLit("false")).toBe(false);
    expect(parseLit("hi")).toBe("hi");
  });
});
