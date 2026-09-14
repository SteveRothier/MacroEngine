import { describe, expect, it } from "vitest";
import {
  catalogKeys,
  catalogs,
  leafPaths,
  resolveLocale,
  tStatic,
} from "./index";

describe("resolveLocale", () => {
  it("maps explicit prefs", () => {
    expect(resolveLocale("fr")).toBe("fr");
    expect(resolveLocale("en")).toBe("en");
  });

  it("resolves system from Intl", () => {
    const resolved = resolveLocale("system");
    expect(resolved === "fr" || resolved === "en").toBe(true);
  });
});

describe("catalog symmetry", () => {
  it("common FR/EN keys match", () => {
    expect(leafPaths(catalogs.fr.common).sort()).toEqual(
      leafPaths(catalogs.en.common).sort(),
    );
  });

  it("settings FR/EN keys match", () => {
    expect(leafPaths(catalogs.fr.settings).sort()).toEqual(
      leafPaths(catalogs.en.settings).sort(),
    );
  });

  it("all namespaces have matching FR/EN leaves", () => {
    expect(catalogKeys("fr").sort()).toEqual(catalogKeys("en").sort());
  });
});

describe("tStatic", () => {
  it("interpolates vars", () => {
    expect(tStatic("fr", "shell.clickerLaunched", { name: "A" })).toContain("A");
    expect(tStatic("en", "shell.clickerLaunched", { name: "A" })).toContain("A");
  });

  it("falls back to FR then key", () => {
    expect(tStatic("en", "common.cancel")).toBe("Cancel");
    expect(tStatic("en", "missing.key")).toBe("missing.key");
  });
});
