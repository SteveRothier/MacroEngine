import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { Clipboard, Trash2 } from "lucide-react";

/** Global run log — stays mounted across all app tabs. */
export function RunJournal() {
  const [runLog, setRunLog] = useState<string[]>([]);
  const [journalOpen, setJournalOpen] = useState(false);
  const journalWrapRef = useRef<HTMLDivElement | null>(null);
  const journalBodyRef = useRef<HTMLDivElement | null>(null);
  const [journalThumb, setJournalThumb] = useState({
    h: 0,
    top: 0,
    visible: false,
  });

    const stickToBottom = useRef(true);

  const pushRunLog = useCallback((line: string) => {
    // Hotkey arm/update noise — keep in Rust console, not the UI journal.
    if (/^hotkeys\b/i.test(line)) return;
    // Clicker session lines are useful in the journal (partial Phase 3).
    if (/^Clicker\b/i.test(line) || /^clicker\b/i.test(line)) {
      console.info("[clicker]", line);
    } else {
      console.info("[macro]", line);
    }
    setRunLog((prev) => {
      const next = [...prev, line];
      return next.length > 40 ? next.slice(-40) : next;
    });
  }, []);

  const scrollJournalToBottom = useCallback(() => {
    const el = journalBodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const syncJournalThumb = useCallback(() => {
    const el = journalBodyRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      setJournalThumb({ h: 0, top: 0, visible: false });
      return;
    }
    const h = Math.max(20, (clientHeight / scrollHeight) * clientHeight);
    const maxTop = clientHeight - h;
    const top =
      maxTop <= 0
        ? 0
        : (scrollTop / (scrollHeight - clientHeight)) * maxTop;
    setJournalThumb({ h, top, visible: true });
  }, []);

  useEffect(() => {
    if (!journalOpen) return;
    if (stickToBottom.current) {
      scrollJournalToBottom();
    }
    syncJournalThumb();
    const el = journalBodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (stickToBottom.current) scrollJournalToBottom();
      syncJournalThumb();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [journalOpen, runLog, syncJournalThumb, scrollJournalToBottom]);

  useEffect(() => {
    if (!journalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setJournalOpen(false);
    };
    const onPointer = (e: MouseEvent) => {
      const el = journalWrapRef.current;
      if (el && !el.contains(e.target as Node)) {
        setJournalOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [journalOpen]);

  useEffect(() => {
    let cancelled = false;
    let unLog: (() => void) | undefined;

    void (async () => {
      const logUn = await listen<{ message?: string | null }>(
        "engine://log",
        (e) => {
          const msg = e.payload.message?.trim();
          if (msg) pushRunLog(msg);
        },
      );
      if (cancelled) {
        logUn();
        return;
      }
      unLog = logUn;
    })();

    return () => {
      cancelled = true;
      unLog?.();
    };
  }, [pushRunLog]);

  function onJournalThumbPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const body = journalBodyRef.current;
    if (!body || !journalThumb.visible) return;
    const startY = e.clientY;
    const startTop = journalThumb.top;
    const thumbH = journalThumb.h;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const { scrollHeight, clientHeight } = body;
      const maxTop = clientHeight - thumbH;
      if (maxTop <= 0) return;
      const newTop = Math.min(
        maxTop,
        Math.max(0, startTop + (ev.clientY - startY)),
      );
      body.scrollTop = (newTop / maxTop) * (scrollHeight - clientHeight);
    };
    const onUp = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  return (
    <div className="run-journal-host" ref={journalWrapRef}>
      <button
        type="button"
        className={`ui-icon-btn macro-journal-btn${journalOpen ? " active" : ""}`}
        aria-label="Journal d’exécution"
        title="Journal"
        aria-expanded={journalOpen}
        onClick={() =>
          setJournalOpen((open) => {
            if (!open) stickToBottom.current = true;
            return !open;
          })
        }
      >
        <Clipboard size={18} strokeWidth={1.75} aria-hidden />
      </button>
      {journalOpen ? (
        <div
          className="macro-run-log macro-run-log-popover"
          role="dialog"
          aria-label="Journal d’exécution"
        >
          <div className="macro-run-log-head">
            <span className="v2-meta-label">Journal</span>
            <div className="macro-run-log-head-actions">
              <button
                type="button"
                className="ui-icon-btn"
                aria-label="Effacer"
                title="Effacer"
                onClick={() => setRunLog([])}
              >
                <Trash2 size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          </div>
          <div className="macro-run-log-scroll">
            <div
              ref={journalBodyRef}
              className="macro-run-log-body"
              onScroll={() => {
                const el = journalBodyRef.current;
                if (el) {
                  const gap =
                    el.scrollHeight - el.scrollTop - el.clientHeight;
                  stickToBottom.current = gap < 28;
                }
                syncJournalThumb();
              }}
            >
              {runLog.length > 0
                ? runLog.map((line, i) => {
                    const isStop = /^Arrêt\b/i.test(line);
                    const isEnd = /^Fin\b/i.test(line);
                    return (
                      <div
                        key={`${i}:${line.slice(0, 24)}`}
                        className={
                          isStop
                            ? "run-log-line is-stop"
                            : isEnd
                              ? "run-log-line is-end"
                              : "run-log-line"
                        }
                      >
                        {line}
                      </div>
                    );
                  })
                : "Aucune entrée — lance une macro ou le clicker pour voir les actions."}
            </div>
            {journalThumb.visible ? (
              <div className="macro-run-log-rail" aria-hidden>
                <div
                  className="macro-run-log-thumb"
                  style={{
                    height: journalThumb.h,
                    transform: `translateY(${journalThumb.top}px)`,
                  }}
                  onPointerDown={onJournalThumbPointerDown}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
