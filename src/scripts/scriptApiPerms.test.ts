import { describe, expect, it } from "vitest";
import {
  permissionForApi,
  permPatchForApi,
  permissionFromErrorMessage,
} from "./scriptApiPerms";

describe("scriptApiPerms", () => {
  it("maps caster APIs to permission flags", () => {
    expect(permissionForApi("caster.fetch")).toBe("allowNetwork");
    expect(permissionForApi("click")).toBe("allowInput");
    expect(permissionForApi("runProcess")).toBe("allowProcess");
    expect(permissionForApi("log")).toBeUndefined();
  });

  it("builds doc patches for missing perms", () => {
    expect(permPatchForApi("caster.clipboardRead")).toEqual({
      allowClipboard: true,
    });
    expect(permPatchForApi("log")).toBeUndefined();
  });

  it("detects permission from engine error messages", () => {
    expect(permissionFromErrorMessage("fetch failed: network")).toBe(
      "allowNetwork",
    );
    expect(
      permissionFromErrorMessage("caster.click disabled"),
    ).toBe("allowInput");
    expect(permissionFromErrorMessage("runProcess allowProcess")).toBe(
      "allowProcess",
    );
    expect(permissionFromErrorMessage("something else")).toBeUndefined();
  });
});
