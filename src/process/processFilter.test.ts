import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROCESS_FILTER,
  displayExeName,
  normalizeExeName,
  processFilterAllows,
  type ProcessFilter,
} from "./types";

describe("normalizeExeName", () => {
  it("lowercases and strips path", () => {
    expect(normalizeExeName("C:\\Games\\Game.EXE")).toBe("game.exe");
    expect(normalizeExeName("  notepad.exe  ")).toBe("notepad.exe");
  });
});

describe("displayExeName", () => {
  it("strips .exe for labels", () => {
    expect(displayExeName("Notepad.EXE")).toBe("notepad");
    expect(displayExeName("steamwebhelper")).toBe("steamwebhelper");
  });
});

describe("processFilterAllows", () => {
  const denyListed: ProcessFilter = {
    enabled: true,
    mode: "deny",
    names: ["chrome.exe"],
  };
  const allowListed: ProcessFilter = {
    enabled: true,
    mode: "allow",
    names: ["game.exe"],
  };

  it("passes when filter disabled", () => {
    expect(processFilterAllows(DEFAULT_PROCESS_FILTER, "chrome.exe")).toBe(
      true,
    );
  });

  it("deny: blocks listed, allows others", () => {
    expect(processFilterAllows(denyListed, "chrome.exe")).toBe(false);
    expect(processFilterAllows(denyListed, "notepad.exe")).toBe(true);
  });

  it("allow: only listed", () => {
    expect(processFilterAllows(allowListed, "game.exe")).toBe(true);
    expect(processFilterAllows(allowListed, "chrome.exe")).toBe(false);
  });

  it("empty deny list allows all; empty allow list blocks all", () => {
    expect(
      processFilterAllows({ enabled: true, mode: "deny", names: [] }, "a.exe"),
    ).toBe(true);
    expect(
      processFilterAllows({ enabled: true, mode: "allow", names: [] }, "a.exe"),
    ).toBe(false);
  });

  it("missing foreground: deny allows, allow blocks", () => {
    expect(processFilterAllows(denyListed, null)).toBe(true);
    expect(processFilterAllows(allowListed, undefined)).toBe(false);
  });
});
