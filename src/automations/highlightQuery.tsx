import type { ReactNode } from "react";

/** Split `text` and wrap case-insensitive matches of `query` in <mark>. */
export function highlightQuery(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q || !text) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const at = lower.indexOf(needle, i);
    if (at < 0) {
      parts.push(text.slice(i));
      break;
    }
    if (at > i) parts.push(text.slice(i, at));
    parts.push(
      <mark key={`h-${key++}`} className="caster-auto-search-mark">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    i = at + needle.length;
  }
  return parts.length === 1 ? parts[0]! : <>{parts}</>;
}
