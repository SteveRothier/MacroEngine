import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
  ClipboardCopy,
  Download,
  Terminal,
  Trash2,
} from "lucide-react";
import { EmptyState, useToast } from "../ui/shell";
import { useT } from "../i18n";
import type { JournalLine } from "./useEngineLog";

type Filter = "all" | "macro" | "clicker" | "script" | "system" | "errors";

type Props = {
  lines: JournalLine[];
  onClear: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional short CTA when empty (P19G). */
  emptyCta?: { label: string; onClick: () => void };
};

const JOURNAL_H_KEY = "caster-journal-h";
const JOURNAL_H_DEFAULT = 200;
const JOURNAL_H_MIN = 120;

function journalHMax(): number {
  if (typeof window === "undefined") return 320;
  return Math.max(JOURNAL_H_MIN + 40, Math.round(window.innerHeight * 0.4));
}

function clampJournalH(h: number): number {
  return Math.max(JOURNAL_H_MIN, Math.min(journalHMax(), Math.round(h)));
}

function readJournalH(): number {
  try {
    const n = Number(localStorage.getItem(JOURNAL_H_KEY));
    if (Number.isFinite(n)) return clampJournalH(n);
  } catch {
    /* ignore */
  }
  return JOURNAL_H_DEFAULT;
}

function matchesFilter(line: JournalLine, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "errors") {
    return line.level === "error" || line.level === "warn";
  }
  const text = line.text;
  if (filter === "macro") return /macro/i.test(text);
  if (filter === "clicker") return /clicker/i.test(text);
  if (filter === "script") return /script/i.test(text);
  return !/macro|clicker|script/i.test(text);
}

export function RunJournalDock({
  lines,
  onClear,
  open,
  onOpenChange,
  emptyCta,
}: Props) {
  const t = useT();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const [height, setHeight] = useState(readJournalH);
  const bodyRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(follow);
  followRef.current = follow;
  const heightRef = useRef(height);
  heightRef.current = height;
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onOpenChange(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open || !follow) return;
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, open, follow, filter, query]);

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { startY: e.clientY, startH: heightRef.current };
    },
    [],
  );

  const onResizePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = clampJournalH(drag.startH + (drag.startY - e.clientY));
      heightRef.current = next;
      setHeight(next);
    },
    [],
  );

  const onResizePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      try {
        localStorage.setItem(JOURNAL_H_KEY, String(heightRef.current));
      } catch {
        /* ignore */
      }
    },
    [],
  );

  if (!open) return null;

  const filterLabels: Record<Filter, string> = {
    all: t("runs.filterAll"),
    macro: t("runs.filterMacros"),
    clicker: t("runs.filterClicker"),
    script: t("runs.filterScripts"),
    system: t("runs.filterSystem"),
    errors: t("runs.filterErrors"),
  };

  const q = query.trim().toLowerCase();
  const filtered = lines.filter((l) => {
    if (!matchesFilter(l, filter)) return false;
    if (!q) return true;
    return l.text.toLowerCase().includes(q);
  });
  const text = filtered.map((l) => l.text).join("\n");

  const copyFiltered = () => {
    void navigator.clipboard.writeText(text).then(
      () => toast.success(t("runs.exportOk")),
      () => {
        /* ignore */
      },
    );
  };

  const saveFiltered = () => {
    void (async () => {
      try {
        const filePath = await save({
          defaultPath: "caster-journal.txt",
          filters: [{ name: "Text", extensions: ["txt"] }],
        });
        if (!filePath) return;
        await invoke("write_text_file", { path: filePath, contents: text });
        toast.success(t("runs.exportFileOk"));
      } catch {
        toast.error(t("runs.exportFileFail"));
      }
    })();
  };

  return (
    <div
      className="caster-journal-dock"
      role="region"
      aria-label={t("runs.aria")}
      style={{ ["--caster-journal-h" as string]: `${height}px` }}
    >
      <div
        className="caster-journal-splitter"
        role="separator"
        aria-orientation="horizontal"
        aria-valuemin={JOURNAL_H_MIN}
        aria-valuemax={journalHMax()}
        aria-valuenow={height}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
      />
      <div className="caster-journal-head">
        <div className="caster-journal-head-primary">
          <button
            type="button"
            className="caster-journal-title-btn"
            onClick={() => onOpenChange(false)}
            title={t("runs.close")}
            aria-label={t("runs.close")}
          >
            <Terminal size={14} aria-hidden />
            <span className="caster-journal-title">{t("runs.title")}</span>
            <ChevronDown size={14} aria-hidden className="caster-journal-collapse" />
          </button>
          <div className="caster-journal-head-actions">
            <button
              type="button"
              className="caster-btn caster-btn-ghost"
              title={t("runs.clear")}
              onClick={onClear}
            >
              <Trash2 size={12} />
              <span>{t("runs.clear")}</span>
            </button>
          </div>
        </div>
        <div className="caster-journal-filters">
          <div
            className="caster-segmented caster-journal-filter-segmented"
            role="group"
            aria-label={t("runs.filterAria")}
          >
            {(
              [
                "all",
                "macro",
                "clicker",
                "script",
                "system",
                "errors",
              ] as Filter[]
            ).map((f) => (
              <button
                key={f}
                type="button"
                className={[
                  "caster-segmented-btn",
                  filter === f ? "active" : "",
                  f === "errors" ? "caster-journal-filter--errors" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setFilter(f)}
              >
                {filterLabels[f]}
              </button>
            ))}
          </div>
          <input
            type="search"
            className="caster-search-inline caster-journal-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("runs.searchPlaceholder")}
            aria-label={t("runs.searchAria")}
          />
          <button
            type="button"
            className={[
              "caster-btn caster-btn-ghost",
              follow ? "is-active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            title={t("runs.followTitle")}
            aria-pressed={follow}
            onClick={() => setFollow((v) => !v)}
          >
            {t("runs.follow")}
          </button>
          <button
            type="button"
            className="caster-btn caster-btn-ghost"
            title={t("runs.exportTitle")}
            aria-label={t("runs.export")}
            disabled={filtered.length === 0}
            onClick={copyFiltered}
          >
            <ClipboardCopy size={12} />
          </button>
          <button
            type="button"
            className="caster-btn caster-btn-ghost"
            title={t("runs.exportFileTitle")}
            aria-label={t("runs.exportFile")}
            disabled={filtered.length === 0}
            onClick={saveFiltered}
          >
            <Download size={12} />
          </button>
        </div>
      </div>
      <div
        className="caster-journal-body"
        ref={bodyRef}
        onScroll={() => {
          const el = bodyRef.current;
          if (!el) return;
          const atBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          if (!atBottom && followRef.current) setFollow(false);
          else if (atBottom && !followRef.current) setFollow(true);
        }}
      >
        {filtered.length === 0 ? (
          <EmptyState
            title={t("runs.emptyTitle")}
            lead={t("runs.emptyLead")}
            actions={
              emptyCta ? (
                <button
                  type="button"
                  className="caster-btn caster-btn-ghost"
                  onClick={emptyCta.onClick}
                >
                  {emptyCta.label}
                </button>
              ) : undefined
            }
          />
        ) : (
          filtered.map((line, i) => (
            <div
              key={`${i}-${line.level}-${line.text.slice(0, 20)}`}
              className={[
                "caster-journal-line",
                /macro/i.test(line.text) ? "caster-journal-line--macro" : "",
                /clicker/i.test(line.text) ? "caster-journal-line--clicker" : "",
                /script/i.test(line.text) ? "caster-journal-line--script" : "",
                line.level === "error" ? "caster-journal-line--error" : "",
                line.level === "warn" ? "caster-journal-line--warn" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {line.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
