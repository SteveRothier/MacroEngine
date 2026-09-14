import { describe, expect, it } from "vitest";
import {
  catalogKeys,
  catalogs,
  FALLBACK_LOCALE,
  leafPaths,
  matchSystemLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
  tStatic,
} from "./index";

describe("resolveLocale", () => {
  it("maps explicit prefs for every supported locale", () => {
    for (const code of SUPPORTED_LOCALES) {
      expect(resolveLocale(code)).toBe(code);
    }
  });

  it("resolves system from Intl to a supported locale", () => {
    const resolved = resolveLocale("system");
    expect(SUPPORTED_LOCALES).toContain(resolved);
  });

  it("matchSystemLocale uses registry prefixes", () => {
    expect(matchSystemLocale("fr-FR")).toBe("fr");
    expect(matchSystemLocale("en-US")).toBe("en");
    expect(matchSystemLocale("de-DE")).toBe(FALLBACK_LOCALE);
  });
});

describe("catalog symmetry", () => {
  it("every locale matches fallback leaf keys", () => {
    const fallbackKeys = catalogKeys(FALLBACK_LOCALE).sort();
    for (const code of SUPPORTED_LOCALES) {
      if (code === FALLBACK_LOCALE) continue;
      expect(catalogKeys(code).sort()).toEqual(fallbackKeys);
    }
  });

  it("common and settings remain symmetric across locales", () => {
    const commonFallback = leafPaths(catalogs[FALLBACK_LOCALE].common).sort();
    const settingsFallback = leafPaths(catalogs[FALLBACK_LOCALE].settings).sort();
    for (const code of SUPPORTED_LOCALES) {
      expect(leafPaths(catalogs[code].common).sort()).toEqual(commonFallback);
      expect(leafPaths(catalogs[code].settings).sort()).toEqual(settingsFallback);
    }
  });
});

describe("tStatic", () => {
  it("interpolates vars", () => {
    expect(tStatic("fr", "shell.clickerLaunched", { name: "A" })).toContain("A");
    expect(tStatic("en", "shell.clickerLaunched", { name: "A" })).toContain("A");
  });

  it("falls back to FALLBACK then key", () => {
    expect(tStatic("en", "common.cancel")).toBe("Cancel");
    expect(tStatic("en", "missing.key")).toBe("missing.key");
  });
});
