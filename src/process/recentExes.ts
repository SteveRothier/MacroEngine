import { normalizeExeName } from "./types";

const STORAGE_KEY = "caster.process.recentExes";
const MAX_RECENT = 5;

function parseStored(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map(normalizeExeName)
      .filter((n) => n.length > 0)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function readRecentExes(): string[] {
  try {
    const fromLocal = parseStored(localStorage.getItem(STORAGE_KEY));
    if (fromLocal.length > 0) return fromLocal;
    const fromSession = parseStored(sessionStorage.getItem(STORAGE_KEY));
    if (fromSession.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fromSession));
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return fromSession;
    }
    return [];
  } catch {
    return [];
  }
}

export function pushRecentExe(name: string): string[] {
  const n = normalizeExeName(name);
  if (!n) return readRecentExes();
  const next = [n, ...readRecentExes().filter((x) => x !== n)].slice(
    0,
    MAX_RECENT,
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}
