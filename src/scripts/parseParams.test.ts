import { describe, expect, it } from "vitest";
import { parseParamDefs } from "./parseParams";

describe("parseParamDefs", () => {
  it("parses //@param and //@param with space", () => {
    const defs = parseParamDefs(`
//@param clicks number 10
// @param label string hello
`);
    expect(defs).toEqual([
      { name: "clicks", type: "number", default: 10 },
      { name: "label", type: "string", default: "hello" },
    ]);
  });

  it("parses hash #@param", () => {
    const defs = parseParamDefs(`
#@param pycount number 3
# @param enabled boolean true
`);
    expect(defs).toEqual([
      { name: "pycount", type: "number", default: 3 },
      { name: "enabled", type: "boolean", default: true },
    ]);
  });
});
