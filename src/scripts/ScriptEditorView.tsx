import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Code2, FileCode2 } from "lucide-react";
import { DropdownMenu, useToast } from "../ui/v2";
import type { DropdownEntry } from "../ui/v2";
import { useTitleBarSlot } from "../ui/v2/TitleBarContext";
import { confirmAction } from "../ui";
import {
  SCRIPT_SNIPPET_GET,
  SCRIPT_SNIPPET_PARAM,
  SCRIPT_SNIPPET_SET,
} from "./snippets";
import {
  SCRIPT_PRESETS,
  presetPermissionPatch,
  type ScriptPreset,
} from "./presets";
import {
  ScriptTitleBarTools,
  type EngineBusyKind,
} from "./ScriptTitleBarTools";
import { ScriptParamsFields } from "./ScriptParamsFields";
import {
  ScriptConsole,
  classifyConsoleMessage,
  formatConsoleTime,
  type ConsoleLine,
} from "./ScriptConsole";
import { parseParamDefs } from "./parseParams";
import type { ScriptDoc } from "./types";
import type { MacroValue } from "../macros/types";

const AUTOSAVE_MS = 400;
const MAX_CONSOLE = 200;

type Props = {
  scriptId: string;
  onBack: () => void;
  onDirtyChange?: (id: string, dirty: boolean) => void;
  onLabelChange?: (name: string) => void;
};

function normalizeDoc(doc: ScriptDoc): ScriptDoc {
  return {
    ...doc,
    allowClipboard: doc.allowClipboard ?? false,
    allowFs: doc.allowFs ?? false,
    allowMacroControl: doc.allowMacroControl ?? false,
    paramValues: doc.paramValues ?? {},
  };
}

function humanizeRunError(raw: string): string {
  const s = String(raw);
  if (/network|fetch disabled|allowNetwork|réseau/i.test(s)) {
    return "Erreur : caster.fetch a échoué — le script n’a pas la permission Réseau. Activez-la dans Permissions si c’est voulu.";
  }
  if (/engine already|already active|clicker is active|record is active/i.test(s)) {
    return s;
  }
  return s.startsWith("Erreur") ? s : `Erreur : ${s}`;
}

export function ScriptEditorView({
  scriptId,
  onBack,
  onDirtyChange,
  onLabelChange,
}: Props) {
  const toast = useToast();
  const [draft, setDraft] = useState<ScriptDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [running, setRunning] = useState(false);
  const [engineBusy, setEngineBusy] = useState<EngineBusyKind | null>(null);
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const consoleIdRef = useRef(0);
  const baselineRef = useRef<string>("");
  const draftRef = useRef<ScriptDoc | null>(null);
  const dirtyRef = useRef(false);
  const autosaveTimer = useRef<number | null>(null);
  const savedFlashTimer = useRef<number | null>(null);
  const sourceRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const pendingSelRef = useRef<number | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useLayoutEffect(() => {
    const el = sourceRef.current;
    const pos = pendingSelRef.current;
    if (el == null || pos == null) return;
    pendingSelRef.current = null;
    el.selectionStart = el.selectionEnd = pos;
  }, [draft?.source]);

  const pushConsole = useCallback((text: string, level?: ConsoleLine["level"]) => {
    const line: ConsoleLine = {
      id: ++consoleIdRef.current,
      time: formatConsoleTime(),
      level: level ?? classifyConsoleMessage(text),
      text,
    };
    setConsoleLines((prev) => {
      const next = [...prev, line];
      return next.length > MAX_CONSOLE ? next.slice(-MAX_CONSOLE) : next;
    });
  }, []);

  useEffect(() => {
    let un: (() => void) | undefined;
    void listen<{ message?: string | null }>("engine://log", (e) => {
      const msg = e.payload.message?.trim();
      if (!msg) return;
      if (
        /script:/i.test(msg) ||
        /script «/i.test(msg) ||
        /script\.run/i.test(msg) ||
        /Annulation/i.test(msg) ||
        /Fin script/i.test(msg)
      ) {
        pushConsole(msg);
      }
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, [pushConsole]);

  useEffect(() => {
    let un: (() => void) | undefined;
    void listen<{
      state?: string;
      sessionKind?: string | null;
    }>("engine://status", (e) => {
      const kind = e.payload.sessionKind ?? null;
      const state = e.payload.state;
      const busy =
        state === "running" || state === "paused" || state === "stopping";
      if (busy && kind) {
        setEngineBusy(kind as EngineBusyKind);
        setRunning(kind === "script" && state !== "stopping");
      } else {
        setEngineBusy(null);
        setRunning(false);
      }
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, []);

  const markDirty = useCallback(
    (next: ScriptDoc) => {
      const serialized = JSON.stringify(next);
      const isDirty = serialized !== baselineRef.current;
      dirtyRef.current = isDirty;
      onDirtyChange?.(scriptId, isDirty);
      if (isDirty) setSaveStatus("idle");
    },
    [onDirtyChange, scriptId],
  );

  const persistNow = useCallback(
    async (doc: ScriptDoc) => {
      setSaveStatus("saving");
      try {
        await invoke("save_script_cmd", { doc });
        baselineRef.current = JSON.stringify(doc);
        dirtyRef.current = false;
        onDirtyChange?.(scriptId, false);
        setSaveStatus("saved");
        if (savedFlashTimer.current != null) {
          window.clearTimeout(savedFlashTimer.current);
        }
        savedFlashTimer.current = window.setTimeout(() => {
          savedFlashTimer.current = null;
          setSaveStatus((s) => (s === "saved" ? "idle" : s));
        }, 1600);
      } catch (e) {
        setSaveStatus("error");
        toast.error(String(e));
        throw e;
      }
    },
    [onDirtyChange, scriptId, toast],
  );

  const flushAutosave = useCallback(async () => {
    if (autosaveTimer.current != null) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    const doc = draftRef.current;
    if (doc && dirtyRef.current) {
      await persistNow(doc);
    }
  }, [persistNow]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void invoke<ScriptDoc>("load_script_cmd", { id: scriptId })
      .then((doc) => {
        if (cancelled) return;
        const normalized = normalizeDoc(doc);
        setDraft(normalized);
        draftRef.current = normalized;
        baselineRef.current = JSON.stringify(normalized);
        dirtyRef.current = false;
        onDirtyChange?.(scriptId, false);
        setSaveStatus("idle");
        setConsoleLines([]);
      })
      .catch((e) => {
        if (!cancelled) {
          toast.error(String(e));
          setDraft(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scriptId, toast, onDirtyChange]);

  useEffect(() => {
    if (!draft || loading || !dirtyRef.current) return;
    if (JSON.stringify(draft) === baselineRef.current) return;
    if (autosaveTimer.current != null) {
      window.clearTimeout(autosaveTimer.current);
    }
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = null;
      const doc = draftRef.current;
      if (doc && dirtyRef.current) void persistNow(doc);
    }, AUTOSAVE_MS);
    return () => {
      if (autosaveTimer.current != null) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [draft, loading, persistNow]);

  useEffect(() => {
    return () => {
      if (autosaveTimer.current != null) {
        window.clearTimeout(autosaveTimer.current);
      }
      if (savedFlashTimer.current != null) {
        window.clearTimeout(savedFlashTimer.current);
      }
      const doc = draftRef.current;
      if (doc && dirtyRef.current) {
        void invoke("save_script_cmd", { doc }).catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flushAutosave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flushAutosave]);

  function patch(partial: Partial<ScriptDoc>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      markDirty(next);
      if (partial.name != null && partial.name !== prev.name) {
        onLabelChange?.(partial.name);
      }
      return next;
    });
  }

  function setParamValue(name: string, value: MacroValue) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        paramValues: { ...(prev.paramValues ?? {}), [name]: value },
      };
      markDirty(next);
      return next;
    });
  }

  async function applyPreset(preset: ScriptPreset) {
    const dirtySource =
      draftRef.current != null &&
      JSON.stringify(draftRef.current) !== baselineRef.current;
    if (dirtySource) {
      const ok = await confirmAction({
        title: "Remplacer le code",
        message: `Remplacer le code actuel par l’exemple « ${preset.name} » et aligner les permissions ?`,
        confirmLabel: "Remplacer",
        cancelLabel: "Annuler",
        danger: true,
      });
      if (!ok) return;
    }
    patch({
      source: preset.source,
      ...presetPermissionPatch(preset),
      paramValues: {},
    });
  }

  function onSourceKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const insert = "  ";
    const next = el.value.slice(0, start) + insert + el.value.slice(end);
    pendingSelRef.current = start + insert.length;
    patch({ source: next });
  }

  function syncGutterScroll() {
    const ta = sourceRef.current;
    const gut = gutterRef.current;
    if (ta && gut) gut.scrollTop = ta.scrollTop;
  }

  const paramDefs = useMemo(
    () => (draft ? parseParamDefs(draft.source) : []),
    [draft],
  );

  const lineCount = useMemo(() => {
    const src = draft?.source ?? "";
    return Math.max(1, src.split(/\r?\n/).length);
  }, [draft?.source]);

  async function onRun() {
    try {
      await flushAutosave();
      setConsoleLines([]);
      pushConsole("Session · démarrage", "session");
      await invoke("run_script_session_cmd", { id: scriptId });
      setRunning(true);
    } catch (e) {
      const msg = humanizeRunError(String(e));
      pushConsole(msg, "error");
      toast.error(msg);
      setRunning(false);
    }
  }

  async function onStop() {
    try {
      await invoke("request_cancel");
      pushConsole("Annulation demandée (F8)", "session");
    } catch (e) {
      toast.error(String(e));
    }
  }

  const titleBarPortal = useTitleBarSlot(
    draft?.name ?? scriptId,
    draft ? (
      <ScriptTitleBarTools
        onBack={() => {
          void flushAutosave().finally(onBack);
        }}
        name={draft.name}
        onNameChange={(name) => patch({ name })}
        permissions={{
          allowNetwork: draft.allowNetwork,
          allowClipboard: !!draft.allowClipboard,
          allowFs: !!draft.allowFs,
          allowMacroControl: !!draft.allowMacroControl,
        }}
        onPermissionsChange={(partial) => patch(partial)}
        running={running}
        engineBusy={engineBusy}
        onRun={() => void onRun()}
        onStop={() => void onStop()}
        saveStatus={saveStatus}
        onRetrySave={() => {
          const doc = draftRef.current;
          if (doc) void persistNow(doc);
        }}
      />
    ) : null,
  );

  if (loading) {
    return (
      <div className="v2-page v2-script-editor">
        {titleBarPortal}
        <div
          className="v2-skeleton-page v2-skeleton-page--center"
          aria-busy="true"
          aria-label="Chargement du script"
        >
          <div
            className="v2-skeleton v2-skeleton-line v2-skeleton-line--lg"
            style={{ width: "40%" }}
          />
          <div className="v2-skeleton v2-skeleton-line" style={{ width: "100%" }} />
          <div className="v2-skeleton v2-skeleton-line" style={{ width: "92%" }} />
          <div className="v2-skeleton v2-skeleton-line" style={{ width: "78%" }} />
          <div className="v2-skeleton v2-skeleton-line" style={{ width: "85%" }} />
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="v2-page v2-script-editor">
        {titleBarPortal}
        <div className="v2-scripts-hint">Script introuvable.</div>
      </div>
    );
  }

  return (
    <div className="v2-page v2-script-editor">
      {titleBarPortal}
      <div className="v2-editor-layout v2-script-layout">
        <ScriptParamsFields
          defs={paramDefs}
          values={draft.paramValues ?? {}}
          onChange={setParamValue}
          onBlurField={() => void flushAutosave()}
        />
        <div className="v2-script-source-wrap">
          <div className="v2-script-source-gutter" ref={gutterRef} aria-hidden>
            {Array.from({ length: lineCount }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <textarea
            ref={sourceRef}
            className="v2-script-source"
            spellCheck={false}
            value={draft.source}
            placeholder="// //@param name type default&#10;// caster.get / set / return / log / fetch"
            onChange={(e) => patch({ source: e.target.value })}
            onKeyDown={onSourceKeyDown}
            onScroll={syncGutterScroll}
            onBlur={() => void flushAutosave()}
            aria-label="Source JavaScript"
          />
          <div className="v2-script-snippets">
            <DropdownMenu
              label="Snippets"
              ariaLabel="Exemples et snippets"
              align="end"
              triggerClassName="v2-btn v2-btn-ghost v2-script-snippets-btn"
              menuClassName="v2-script-snippets-menu"
              items={
                [
                  {
                    id: "examples",
                    label: "Exemples",
                    items: SCRIPT_PRESETS.map((p) => ({
                      id: `ex-${p.id}`,
                      label: p.name,
                      icon: <FileCode2 size={14} />,
                      onSelect: () => applyPreset(p),
                    })),
                  },
                  {
                    id: "snippets",
                    label: "Snippets",
                    items: [
                      {
                        id: "snip-get",
                        label: "GET JSON",
                        icon: <Code2 size={14} />,
                        onSelect: () => patch({ source: SCRIPT_SNIPPET_GET }),
                      },
                      {
                        id: "snip-set",
                        label: "get / set / return",
                        icon: <Code2 size={14} />,
                        onSelect: () => patch({ source: SCRIPT_SNIPPET_SET }),
                      },
                      {
                        id: "snip-param",
                        label: "Template @param",
                        icon: <Code2 size={14} />,
                        onSelect: () => patch({ source: SCRIPT_SNIPPET_PARAM }),
                      },
                    ],
                  },
                ] satisfies DropdownEntry[]
              }
            >
              <Code2 size={14} aria-hidden />
            </DropdownMenu>
          </div>
        </div>
        <ScriptConsole
          scriptId={scriptId}
          lines={consoleLines}
          onClear={() => setConsoleLines([])}
        />
      </div>
    </div>
  );
}

export function newScriptId(): string {
  return `s${Math.random().toString(36).slice(2, 10)}`;
}
