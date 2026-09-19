import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Code2, FileCode2 } from "lucide-react";
import { useLocale, useT } from "../i18n";
import { DropdownMenu, useToast } from "../ui/shell";
import type { DropdownEntry } from "../ui/shell";
import { useTitleBarSlot } from "../ui/shell/TitleBarContext";
import { confirmAction, confirmChoice } from "../ui";
import {
  readStoredTheme,
  resolvedColorScheme,
  type ColorScheme,
} from "../theme";
import {
  SCRIPT_SNIPPET_CLICK,
  SCRIPT_SNIPPET_GET,
  SCRIPT_SNIPPET_INCLUDE,
  SCRIPT_SNIPPET_KEY,
  SCRIPT_SNIPPET_PARAM,
  SCRIPT_SNIPPET_RUN_PROCESS,
  SCRIPT_SNIPPET_SET,
  apiInsertSnippet,
  type ApiInsertName,
} from "./snippets";
import {
  getScriptPresets,
  presetPermissionPatch,
  type ScriptPreset,
} from "./presets";
import {
  defaultScriptSource,
  isDefaultScriptSource,
} from "./defaultSources";
import {
  humanizeScriptError,
} from "./humanizeScriptError";
import { permPatchForApi, permissionFromErrorMessage } from "./scriptApiPerms";
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
import {
  ScriptSourceEditor,
  diagnosticsFromError,
  diagnosticsFromLint,
  type ScriptEditorDiagnostic,
  type ScriptLintDiagnostic,
  type ScriptSourceEditorHandle,
} from "./ScriptSourceEditor";
import { ScriptRunTimeline } from "./ScriptRunTimeline";
import { parseParamDefs } from "./parseParams";
import type { ScriptDoc, ScriptLanguage } from "./types";
export { newScriptId } from "./newScriptId";
import type { EngineStatus, MacroValue } from "../macros/types";
import {
  mergeScriptsPrefs,
  type ScriptsPrefs,
} from "../settings/settingsTypes";

const AUTOSAVE_MS = 400;
const LINT_DEBOUNCE_MS = 500;
const MAX_CONSOLE = 200;

function isScriptSessionBusy(status: {
  state?: string | null;
  sessionKind?: string | null;
}): boolean {
  const state = status.state ?? "";
  return (
    status.sessionKind === "script" &&
    (state === "running" || state === "paused")
  );
}

type Props = {
  scriptId: string;
  onBack: () => void;
  onDirtyChange?: (id: string, dirty: boolean) => void;
  onLabelChange?: (name: string) => void;
  onOpenSettings?: () => void;
  scriptsPrefs?: ScriptsPrefs;
};

function normalizeDoc(doc: ScriptDoc): ScriptDoc {
  return {
    ...doc,
    language: doc.language === "typescript" ? "typescript" : "javascript",
    isModule: doc.isModule ?? false,
    allowClipboard: doc.allowClipboard ?? false,
    allowFs: doc.allowFs ?? false,
    allowMacroControl: doc.allowMacroControl ?? false,
    allowInput: doc.allowInput ?? false,
    allowProcess: doc.allowProcess ?? false,
    paramValues: doc.paramValues ?? {},
  };
}

function useDocumentColorScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(() =>
    resolvedColorScheme(readStoredTheme()),
  );
  useEffect(() => {
    const el = document.documentElement;
    const read = () =>
      setScheme(el.dataset.theme === "dark" ? "dark" : "light");
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return scheme;
}

export function ScriptEditorView({
  scriptId,
  onBack,
  onDirtyChange,
  onLabelChange,
  onOpenSettings: _onOpenSettings,
  scriptsPrefs: scriptsPrefsProp,
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const scriptsPrefs = mergeScriptsPrefs(scriptsPrefsProp);
  const colorScheme = useDocumentColorScheme();
  const sourceEditorRef = useRef<ScriptSourceEditorHandle | null>(null);
  const [draft, setDraft] = useState<ScriptDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [running, setRunning] = useState(false);
  const [engineBusy, setEngineBusy] = useState<EngineBusyKind | null>(null);
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [diagnostics, setDiagnostics] = useState<ScriptEditorDiagnostic[]>([]);
  const [locked, setLocked] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [runTimeline, setRunTimeline] = useState<ConsoleLine[]>([]);
  const consoleIdRef = useRef(0);
  const runTimelineIdRef = useRef(0);
  const lintTimerRef = useRef<number | null>(null);
  const trackingRunRef = useRef(false);
  const lockedRef = useRef(false);
  const baselineRef = useRef<string>("");
  const draftRef = useRef<ScriptDoc | null>(null);
  const dirtyRef = useRef(false);
  const autosaveTimer = useRef<number | null>(null);
  const savedFlashTimer = useRef<number | null>(null);

  const lang = draft?.language ?? "javascript";
  const presets = useMemo(() => getScriptPresets(t, lang), [t, lang]);

  const hasLintErrors = useMemo(
    () => diagnostics.some((d) => (d.severity ?? "error") === "error"),
    [diagnostics],
  );

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  const pushConsole = useCallback(
    (text: string, level?: ConsoleLine["level"]) => {
      const line: ConsoleLine = {
        id: ++consoleIdRef.current,
        time: formatConsoleTime(new Date(), locale),
        level: level ?? classifyConsoleMessage(text),
        text,
      };
      setConsoleLines((prev) => {
        const next = [...prev, line];
        return next.length > MAX_CONSOLE ? next.slice(-MAX_CONSOLE) : next;
      });
      if (trackingRunRef.current) {
        const runLine = { ...line, id: ++runTimelineIdRef.current };
        setRunTimeline((prev) => [...prev, runLine]);
      }
    },
    [locale],
  );

  const checkSourceLint = useCallback(
    async (source: string, language: ScriptDoc["language"]) => {
      if (locked) return;
      try {
        const items = await invoke<ScriptLintDiagnostic[]>(
          "check_script_source_cmd",
          {
            source,
            language: language ?? "javascript",
          },
        );
        setDiagnostics(diagnosticsFromLint(source, items));
      } catch {
        /* ignore transient lint failures */
      }
    },
    [locked, t],
  );

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
        /Fin script/i.test(msg) ||
        /Arrêt script/i.test(msg)
      ) {
        pushConsole(msg);
        if (/Fin script/i.test(msg) || /Arrêt script/i.test(msg)) {
          pushConsole(t("scripts.console.sessionEnd"), "session");
          trackingRunRef.current = false;
        }
      }
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, [pushConsole, t]);

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
        trackingRunRef.current = false;
      }
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, []);

  const syncRunningFromStatus = useCallback((status: EngineStatus) => {
    if (isScriptSessionBusy(status)) {
      setEngineBusy("script");
      setRunning(true);
      return;
    }
    setEngineBusy(null);
    setRunning(false);
    trackingRunRef.current = false;
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
      if (locked) return;
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
    [locked, onDirtyChange, scriptId, toast],
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
        setRunTimeline([]);
        runTimelineIdRef.current = 0;
        setDiagnostics([]);
        void invoke<{ items: { id: string; locked?: boolean }[] }>(
          "get_library_index_cmd",
          { kind: "script" },
        )
          .then((idx) => {
            if (cancelled) return;
            setLocked(Boolean(idx.items.find((i) => i.id === scriptId)?.locked));
          })
          .catch(() => {
            if (!cancelled) setLocked(false);
          });
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
    if (!draft || loading || locked) return;
    if (lintTimerRef.current != null) {
      window.clearTimeout(lintTimerRef.current);
    }
    lintTimerRef.current = window.setTimeout(() => {
      lintTimerRef.current = null;
      void checkSourceLint(draft.source, draft.language);
    }, LINT_DEBOUNCE_MS);
    return () => {
      if (lintTimerRef.current != null) {
        window.clearTimeout(lintTimerRef.current);
        lintTimerRef.current = null;
      }
    };
  }, [draft?.source, draft?.language, loading, locked, checkSourceLint]);

  useEffect(() => {
    if (!draft || loading || !dirtyRef.current || locked) return;
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
      if (doc && dirtyRef.current && !lockedRef.current) {
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
    if (locked) return;
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

  async function onLanguageChange(language: ScriptLanguage) {
    if (locked) return;
    const prev = draftRef.current;
    if (!prev || prev.language === language) return;
    const isModule = !!prev.isModule;
    if (isDefaultScriptSource(prev.source)) {
      patch({
        language,
        source: defaultScriptSource(language, isModule),
      });
      void checkSourceLint(
        defaultScriptSource(language, isModule),
        language,
      );
      return;
    }
    const outcome = await confirmChoice({
      title: t("scripts.confirm.languageTitle"),
      message: t("scripts.confirm.languageMessage"),
      confirmLabel: t("scripts.confirm.languageAdapt"),
      discardLabel: t("scripts.confirm.languageKeep"),
      cancelLabel: t("common.cancel"),
    });
    if (outcome === "cancel") return;
    if (outcome === "confirm") {
      const source = defaultScriptSource(language, isModule);
      patch({ language, source });
      void checkSourceLint(source, language);
      return;
    }
    patch({ language });
    void checkSourceLint(prev.source, language);
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
        title: t("scripts.confirm.replaceTitle"),
        message: t("scripts.confirm.replaceMessage", { name: preset.name }),
        confirmLabel: t("scripts.confirm.replaceConfirm"),
        cancelLabel: t("common.cancel"),
        danger: true,
      });
      if (!ok) return;
    }
    setDiagnostics([]);
    patch({
      source: preset.source,
      ...presetPermissionPatch(preset),
      paramValues: {},
    });
    void checkSourceLint(preset.source, draftRef.current?.language ?? lang);
  }

  function insertSnippet(text: string, perms?: Partial<ScriptDoc>) {
    sourceEditorRef.current?.insertText(text);
    if (perms) patch(perms);
  }

  const paramDefs = useMemo(
    () => (draft ? parseParamDefs(draft.source) : []),
    [draft],
  );

  const sourceAria =
    lang === "typescript"
      ? t("scripts.toolbar.sourceAriaTs")
      : t("scripts.toolbar.sourceAriaJs");
  const sourcePlaceholder =
    lang === "typescript"
      ? t("scripts.toolbar.sourcePlaceholderTs")
      : t("scripts.toolbar.sourcePlaceholderJs");

  function insertApiExample(name: ApiInsertName) {
    const snippet = apiInsertSnippet(name);
    insertSnippet(snippet, permPatchForApi(name));
    toast.info(t(`scripts.api.${name}`));
  }

  async function onRun() {
    if (draftRef.current?.isModule) {
      const msg = t("scripts.module.runBlocked");
      pushConsole(msg, "error");
      toast.error(msg);
      return;
    }
    if (hasLintErrors) {
      const msg = t("scripts.toast.lintBlocked");
      pushConsole(msg, "error");
      toast.error(msg);
      return;
    }
    try {
      if (!locked) {
        await flushAutosave();
      }
      setDiagnostics([]);
      if (scriptsPrefs.clearConsoleOnRun) {
        setConsoleLines([]);
        consoleIdRef.current = 0;
      }
      setRunTimeline([]);
      runTimelineIdRef.current = 0;
      trackingRunRef.current = true;
      pushConsole(t("scripts.console.sessionStart"), "session");
      if (dryRun) {
        pushConsole(t("scripts.toolbar.dryRunActive"), "session");
      }
      // Do not trust a Running snapshot from the start command: fast scripts often
      // reach Idle before this await resolves, and a stale Running would stick Arrêter.
      await invoke("run_script_session_cmd", {
        id: scriptId,
        dryRun,
      });
      const fresh = await invoke<EngineStatus>("get_engine_state");
      syncRunningFromStatus(fresh);
    } catch (e) {
      const raw = String(e);
      const msg = humanizeScriptError(raw, t);
      pushConsole(msg, "error");
      const perm = permissionFromErrorMessage(raw);
      if (perm && draftRef.current && !lockedRef.current) {
        toast.error(msg, {
          action: {
            label: t("scripts.toast.enableAndRerun"),
            onClick: () => {
              patch({ [perm]: true });
              void flushAutosave().then(() => void onRun());
            },
          },
        });
      } else {
        toast.error(msg);
      }
      setRunning(false);
      trackingRunRef.current = false;
      const src = draftRef.current?.source ?? "";
      setDiagnostics(diagnosticsFromError(src, raw));
    }
  }

  async function onStop() {
    try {
      const status = await invoke<EngineStatus>("request_cancel");
      syncRunningFromStatus(status);
      pushConsole(t("scripts.console.cancelRequested"), "session");
    } catch (e) {
      toast.error(String(e));
    }
  }

  const titleBarPortal = useTitleBarSlot(
    draft?.name ?? scriptId,
    <ScriptTitleBarTools
      onBack={() => {
        void flushAutosave().finally(onBack);
      }}
      name={draft?.name ?? scriptId}
      onNameChange={(name) => patch({ name })}
      language={
        draft?.language === "typescript" ? "typescript" : "javascript"
      }
      onLanguageChange={(language) => void onLanguageChange(language)}
      isModule={!!draft?.isModule}
      onIsModuleChange={(isModule) => {
        const prev = draftRef.current;
        if (prev && isDefaultScriptSource(prev.source)) {
          const language = prev.language ?? "javascript";
          patch({
            isModule,
            source: defaultScriptSource(language, isModule),
          });
        } else {
          patch({ isModule });
        }
      }}
      permissions={{
        allowNetwork: !!draft?.allowNetwork,
        allowClipboard: !!draft?.allowClipboard,
        allowFs: !!draft?.allowFs,
        allowMacroControl: !!draft?.allowMacroControl,
        allowInput: !!draft?.allowInput,
        allowProcess: !!draft?.allowProcess,
      }}
      onPermissionsChange={(partial) => patch(partial)}
      locked={locked}
      loading={loading || !draft}
      dryRun={dryRun}
      onDryRunChange={setDryRun}
      running={running}
      engineBusy={engineBusy}
      lintBlocked={hasLintErrors}
      lintBlockReason={
        hasLintErrors ? t("scripts.toolbar.runLintBlocked") : null
      }
      onRun={() => void onRun()}
      onStop={() => void onStop()}
      saveStatus={saveStatus}
      onRetrySave={() => {
        const doc = draftRef.current;
        if (doc) void persistNow(doc);
      }}
    />,
  );

  if (loading) {
    return (
      <div className="caster-page caster-script-editor">
        {titleBarPortal}
        <div
          className="caster-skeleton-page caster-skeleton-page--center"
          aria-busy="true"
          aria-label={t("scripts.toolbar.loadingAria")}
        >
          <div
            className="caster-skeleton caster-skeleton-line caster-skeleton-line--lg"
            style={{ width: "40%" }}
          />
          <div className="caster-skeleton caster-skeleton-line" style={{ width: "100%" }} />
          <div className="caster-skeleton caster-skeleton-line" style={{ width: "92%" }} />
          <div className="caster-skeleton caster-skeleton-line" style={{ width: "78%" }} />
          <div className="caster-skeleton caster-skeleton-line" style={{ width: "85%" }} />
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="caster-page caster-script-editor">
        {titleBarPortal}
        <div className="caster-scripts-hint">{t("scripts.toolbar.notFound")}</div>
      </div>
    );
  }

  return (
    <div className="caster-page caster-script-editor">
      {titleBarPortal}
      <div className="caster-editor-layout caster-script-layout">
        <ScriptParamsFields
          defs={paramDefs}
          values={draft.paramValues ?? {}}
          onChange={setParamValue}
          disabled={locked}
          onBlurField={() => void flushAutosave()}
        />
        <div className="caster-script-source-wrap">
          <ScriptSourceEditor
            ref={sourceEditorRef}
            value={draft.source}
            language={lang === "typescript" ? "typescript" : "javascript"}
            colorScheme={colorScheme}
            onChange={(source) => {
              if (!locked) patch({ source });
            }}
            onBlur={() => {
              void flushAutosave();
              if (draftRef.current) {
                void checkSourceLint(
                  draftRef.current.source,
                  draftRef.current.language,
                );
              }
            }}
            ariaLabel={sourceAria}
            placeholder={sourcePlaceholder}
            diagnostics={diagnostics}
            readOnly={locked}
          />
          <div className="caster-script-snippets">
            <DropdownMenu
              label={t("scripts.toolbar.examples")}
              ariaLabel={t("scripts.toolbar.examples")}
              align="end"
              triggerClassName="caster-btn caster-btn-ghost caster-script-snippets-btn"
              menuClassName="caster-script-snippets-menu"
              disabled={locked}
              items={presets.map((p) => ({
                id: `ex-${p.id}`,
                label: p.name,
                icon: <FileCode2 size={14} />,
                onSelect: () => void applyPreset(p),
              }))}
            >
              <FileCode2 size={14} aria-hidden />
              {t("scripts.toolbar.examples")}
            </DropdownMenu>
            <DropdownMenu
              label={t("scripts.toolbar.snippets")}
              ariaLabel={t("scripts.toolbar.snippetsAria")}
              align="end"
              triggerClassName="caster-btn caster-btn-ghost caster-script-snippets-btn"
              menuClassName="caster-script-snippets-menu"
              disabled={locked}
              items={
                [
                  {
                    id: "snippets",
                    label: t("scripts.toolbar.snippets"),
                    items: [
                      {
                        id: "snip-get",
                        label: t("scripts.toolbar.snipGet"),
                        icon: <Code2 size={14} />,
                        onSelect: () =>
                          insertSnippet(SCRIPT_SNIPPET_GET, {
                            allowNetwork: true,
                          }),
                      },
                      {
                        id: "snip-set",
                        label: t("scripts.toolbar.snipSet"),
                        icon: <Code2 size={14} />,
                        onSelect: () => insertSnippet(SCRIPT_SNIPPET_SET),
                      },
                      {
                        id: "snip-param",
                        label: t("scripts.toolbar.snipParam"),
                        icon: <Code2 size={14} />,
                        onSelect: () => insertSnippet(SCRIPT_SNIPPET_PARAM),
                      },
                      {
                        id: "snip-click",
                        label: t("scripts.toolbar.snipClick"),
                        icon: <Code2 size={14} />,
                        onSelect: () =>
                          insertSnippet(SCRIPT_SNIPPET_CLICK, {
                            allowInput: true,
                          }),
                      },
                      {
                        id: "snip-key",
                        label: t("scripts.toolbar.snipKey"),
                        icon: <Code2 size={14} />,
                        onSelect: () =>
                          insertSnippet(SCRIPT_SNIPPET_KEY, {
                            allowInput: true,
                          }),
                      },
                      {
                        id: "snip-include",
                        label: t("scripts.toolbar.snipInclude"),
                        icon: <Code2 size={14} />,
                        onSelect: () => insertSnippet(SCRIPT_SNIPPET_INCLUDE),
                      },
                      {
                        id: "snip-process",
                        label: t("scripts.toolbar.snipProcess"),
                        icon: <Code2 size={14} />,
                        onSelect: () =>
                          insertSnippet(SCRIPT_SNIPPET_RUN_PROCESS, {
                            allowProcess: true,
                          }),
                      },
                    ],
                  },
                  {
                    id: "api",
                    label: t("scripts.toolbar.apiHelp"),
                    items: (
                      [
                        "get",
                        "set",
                        "log",
                        "return",
                        "sleep",
                        "fetch",
                        "include",
                        "runScript",
                        "click",
                      ] as ApiInsertName[]
                    ).map((name) => ({
                      id: `api-${name}`,
                      label: `caster.${name}`,
                      icon: <Code2 size={14} />,
                      onSelect: () => insertApiExample(name),
                    })),
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
        <ScriptRunTimeline
          lines={runTimeline}
          running={running}
          onRelaunch={() => void onRun()}
        />
      </div>
    </div>
  );
}
