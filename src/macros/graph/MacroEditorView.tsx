import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { confirmAction } from "../../ui";
import {
  ActionPickerMenu,
  InspectorPanel,
  InspectorSection,
  useToast,
} from "../../ui/shell";
import {
  Clock,
  GitBranch,
  Keyboard,
  LayoutTemplate,
  MousePointerClick,
  Play,
  Plus,
  Variable,
  Workflow,
} from "lucide-react";
import { ActionList } from "../ActionList";
import { ActionProps } from "../ActionProps";
import { ControlFlowAdvancedProps } from "../ControlFlowAdvancedProps";
import {
  actionLead,
  actionTitle,
  actionTone,
} from "../actionLabels";
import { buildActionAddMenu, makeAction } from "../actionFactory";
import { MacroMetaBar, MacroMetaTools } from "../MacroMetaBar";
import {
  appendChild,
  duplicateAtPath,
  duplicateManyAtPaths,
  emptyMacro,
  getAtPath,
  insertAtPath,
  moveInParent,
  moveManyInParent,
  pasteAfterAtPath,
  pasteManyAfterAtPath,
  removeAtPath,
  removeManyAtPaths,
  reorderAtPath,
  updateAtPath,
  type ActionPath,
  type EngineStatus,
  type MacroAction,
  type MacroDocument,
} from "../types";
import { MacroTitleBarTools } from "./MacroTitleBarTools";
import { useTitleBarSlot } from "../../ui/shell/TitleBarContext";
import {
  mergeAutomationPrefs,
  mergeConfirmationsPrefs,
  type AutomationPrefs,
  type ConfirmationsPrefs,
} from "../../settings/settingsTypes";
import { useT, type TFunction } from "../../i18n";
import {
  DEFAULT_PROCESS_FILTER,
  type ProcessFilter,
  type ProcessFilterPreset,
  type ProcessFilterScopeMode,
  withLocalEnabled,
} from "../../process";

const AUTOSAVE_MS = 400;
const HISTORY_MAX = 50;

type HistoryEntry = {
  doc: MacroDocument;
  selectedPath: ActionPath | null;
};

function cloneDoc(doc: MacroDocument): MacroDocument {
  return structuredClone(doc);
}

type Props = {
  macroId: string;
  onBack?: () => void;
  onDirtyChange?: (id: string, dirty: boolean) => void;
  /** Called after a successful library rename (id changed). */
  onRenamed?: (from: string, to: string) => void;
  /** Open another macro (duplicate / import). */
  onOpenMacro?: (macroId: string, label?: string) => void;
  engineState: string;
  onStatus: (s: EngineStatus) => void;
  onOpenScript?: (scriptId: string, label?: string) => void;
  /** Open global process filter settings (Sécurité). */
  onOpenProcessSettings?: () => void;
  /** Open the shared run journal dock. */
  onOpenJournal?: () => void;
  /** Discreet error/warn badge on the Journal tab. */
  journalHasErrors?: boolean;
  /** When false (keep-mounted but hidden), ignore global shortcuts / titlebar. */
  active?: boolean;
  automationPrefs?: AutomationPrefs;
  confirmationsPrefs?: ConfirmationsPrefs;
};

async function uniqueMacroId(base: string): Promise<string> {
  const existing = await invoke<string[]>("list_saved_macros");
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("name collision");
}

function saveErrorMessage(e: unknown, t: TFunction): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return t("macros.toast.saveFailed");
}

function errMessage(e: unknown, fallback: string): string {
  if (typeof e === "string" && e.trim()) return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

export function MacroEditorView({
  macroId,
  onBack,
  onDirtyChange,
  onRenamed,
  onOpenMacro,
  onStatus,
  engineState,
  onOpenScript,
  onOpenProcessSettings,
  onOpenJournal,
  journalHasErrors = false,
  active = true,
  automationPrefs: automationPrefsProp,
  confirmationsPrefs: confirmationsPrefsProp,
}: Props) {
  const t = useT();
  const [automationPrefs, setAutomationPrefs] = useState(() =>
    mergeAutomationPrefs(automationPrefsProp),
  );
  const [confirmationsPrefs, setConfirmationsPrefs] = useState(() =>
    mergeConfirmationsPrefs(confirmationsPrefsProp),
  );
  const toast = useToast();
  const [doc, setDoc] = useState<MacroDocument>(() => emptyMacro(macroId));
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [selectedPath, setSelectedPath] = useState<ActionPath | null>(null);
  const [activePath, setActivePath] = useState<ActionPath | null>(null);
  const [locked, setLocked] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordPaused, setRecordPaused] = useState(false);
  const [recordCount, setRecordCount] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [globalProcessFilter, setGlobalProcessFilter] = useState<ProcessFilter>(
    DEFAULT_PROCESS_FILTER,
  );
  const [processFilterPresets, setProcessFilterPresets] = useState<
    ProcessFilterPreset[]
  >([]);
  const baselineRef = useRef("");
  const hydratedRef = useRef(false);
  const loadFailedRef = useRef(false);
  const autosaveTimer = useRef<number | null>(null);
  const docRef = useRef(doc);
  const macroIdRef = useRef(macroId);
  const lockedRef = useRef(locked);
  const dirtyRef = useRef(dirty);
  const selectedPathRef = useRef(selectedPath);
  const pastRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  const loadGenRef = useRef(0);

  docRef.current = doc;
  macroIdRef.current = macroId;
  lockedRef.current = locked;
  dirtyRef.current = dirty;
  selectedPathRef.current = selectedPath;

  const editorLocked = locked || recording;
  const selectedAction = useMemo(
    () => (selectedPath ? getAtPath(doc.actions, selectedPath) : null),
    [doc.actions, selectedPath],
  );
  type EditorTab = "actions" | "params" | "variables" | "journal";
  const [editorTab, setEditorTab] = useState<EditorTab>("actions");
  const [propsOpen, setPropsOpen] = useState(() => {
    try {
      return localStorage.getItem("caster-macro-props-open") === "1";
    } catch {
      return false;
    }
  });
  const [propsWidth, setPropsWidth] = useState(() => {
    try {
      const n = Number(localStorage.getItem("caster-macro-props-w"));
      if (Number.isFinite(n)) return Math.max(280, Math.min(320, Math.round(n)));
    } catch {
      /* ignore */
    }
    return 300;
  });
  const propsWidthRef = useRef(propsWidth);
  propsWidthRef.current = propsWidth;
  const propsDragRef = useRef<{ startX: number; startW: number } | null>(null);

  const persistPropsOpen = useCallback((open: boolean) => {
    setPropsOpen(open);
    try {
      localStorage.setItem("caster-macro-props-open", open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const propsAutoClosedRef = useRef(false);
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 900 && propsOpen && !propsAutoClosedRef.current) {
        propsAutoClosedRef.current = true;
        persistPropsOpen(false);
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [propsOpen, persistPropsOpen]);

  const onPropsResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      propsDragRef.current = {
        startX: e.clientX,
        startW: propsWidthRef.current,
      };
    },
    [],
  );

  const onPropsResizePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = propsDragRef.current;
      if (!drag) return;
      const next = Math.max(
        280,
        Math.min(320, Math.round(drag.startW + (drag.startX - e.clientX))),
      );
      propsWidthRef.current = next;
      setPropsWidth(next);
    },
    [],
  );

  const onPropsResizePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!propsDragRef.current) return;
      propsDragRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      try {
        localStorage.setItem(
          "caster-macro-props-w",
          String(propsWidthRef.current),
        );
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const usedVariables = useMemo(() => {
    const names = new Set<string>();
    const walk = (actions: MacroAction[]) => {
      for (const a of actions) {
        if (a.type === "var.set" || a.type === "clipboard.get") {
          names.add(a.name);
        }
        if (a.type === "http.request") {
          if (a.statusVar) names.add(a.statusVar);
          if (a.bodyVar) names.add(a.bodyVar);
        }
        if (a.type === "json.path") {
          names.add(a.sourceVar);
          names.add(a.destVar);
        }
        if (a.type === "script.run" && a.resultVar) names.add(a.resultVar);
        if (a.type === "control.if") {
          walk(a.then);
          if (a.else) walk(a.else);
        }
        if (a.type === "control.while") walk(a.body);
      }
    };
    walk(doc.actions);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [doc.actions]);

  useEffect(() => {
    setAutomationPrefs(mergeAutomationPrefs(automationPrefsProp));
  }, [automationPrefsProp]);

  useEffect(() => {
    setConfirmationsPrefs(mergeConfirmationsPrefs(confirmationsPrefsProp));
  }, [confirmationsPrefsProp]);

  useEffect(() => {
    void invoke<{
      processFilter?: ProcessFilter;
      processFilterPresets?: ProcessFilterPreset[];
      automation?: AutomationPrefs;
      confirmations?: ConfirmationsPrefs;
    }>("get_settings")
      .then((s) => {
        setGlobalProcessFilter(s.processFilter ?? DEFAULT_PROCESS_FILTER);
        setProcessFilterPresets(s.processFilterPresets ?? []);
        if (!automationPrefsProp) {
          setAutomationPrefs(mergeAutomationPrefs(s.automation));
        }
        if (!confirmationsPrefsProp) {
          setConfirmationsPrefs(mergeConfirmationsPrefs(s.confirmations));
        }
      })
      .catch(() => {
        setGlobalProcessFilter(DEFAULT_PROCESS_FILTER);
        setProcessFilterPresets([]);
      });
  }, [macroId, active, automationPrefsProp, confirmationsPrefsProp]);

  const persistGlobalProcessFilter = useCallback(async (next: ProcessFilter) => {
    setGlobalProcessFilter(next);
    try {
      const current = await invoke<Record<string, unknown>>("get_settings");
      await invoke("save_app_settings", {
        settings: { ...current, processFilter: next },
      });
    } catch {
      /* ignore */
    }
  }, []);

  const persistProcessFilterPresets = useCallback(
    async (next: ProcessFilterPreset[]) => {
      setProcessFilterPresets(next);
      try {
        const current = await invoke<Record<string, unknown>>("get_settings");
        await invoke("save_app_settings", {
          settings: { ...current, processFilterPresets: next },
        });
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadId = ++loadGenRef.current;
    hydratedRef.current = false;
    loadFailedRef.current = false;
    setHydrated(false);
    setLoading(true);
    void (async () => {
      try {
        const loaded = await invoke<MacroDocument>("load_saved_macro", {
          name: macroId,
        });
        if (cancelled || loadId !== loadGenRef.current) return;
        setDoc(loaded);
        baselineRef.current = JSON.stringify(loaded);
        hydratedRef.current = true;
        setHydrated(true);
        setDirty(false);
        setSelectedPath(null);
        setActivePath(null);
        pastRef.current = [];
        futureRef.current = [];
        setCanUndo(false);
        setCanRedo(false);
      } catch {
        if (!cancelled && loadId === loadGenRef.current) {
          loadFailedRef.current = true;
          const empty = emptyMacro(macroId);
          setDoc(empty);
          baselineRef.current = JSON.stringify(empty);
          hydratedRef.current = true;
          setHydrated(true);
          setDirty(false);
          toast.error(t("macros.toast.loadFailed"));
        }
      } finally {
        // Always clear loading for this generation — do not wait on lock lookup.
        if (loadId === loadGenRef.current) setLoading(false);
      }
      if (cancelled || loadId !== loadGenRef.current) return;
      try {
        const lib = await invoke<{ name: string; locked?: boolean }[]>(
          "list_macro_library",
        );
        if (!cancelled && loadId === loadGenRef.current) {
          setLocked(Boolean(lib.find((m) => m.name === macroId)?.locked));
        }
      } catch {
        if (!cancelled && loadId === loadGenRef.current) setLocked(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [macroId, toast, t]);

  useEffect(() => {
    onDirtyChange?.(macroId, dirty);
  }, [dirty, macroId, onDirtyChange]);

  const persistNow = useCallback(
    async (nextDoc: MacroDocument, id: string) => {
      if (!hydratedRef.current || loadFailedRef.current) return;
      try {
        await invoke("save_saved_macro", { id, doc: nextDoc });
        baselineRef.current = JSON.stringify(nextDoc);
        setDirty(false);
      } catch (e) {
        toast.error(saveErrorMessage(e, t));
        throw e;
      }
    },
    [toast, t],
  );

  const flushAutosave = useCallback(async () => {
    if (autosaveTimer.current != null) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (
      hydratedRef.current &&
      !loadFailedRef.current &&
      dirtyRef.current &&
      !lockedRef.current
    ) {
      await persistNow(docRef.current, macroIdRef.current);
    }
  }, [persistNow]);

  useEffect(() => {
    if (!hydratedRef.current || loadFailedRef.current) return;
    if (!dirty || locked || loading || recording) return;
    if (autosaveTimer.current != null) {
      window.clearTimeout(autosaveTimer.current);
    }
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = null;
      if (!hydratedRef.current || loadFailedRef.current) return;
      void persistNow(docRef.current, macroIdRef.current);
    }, AUTOSAVE_MS);
    return () => {
      if (autosaveTimer.current != null) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [dirty, locked, loading, recording, doc, persistNow]);

  useEffect(() => {
    return () => {
      if (autosaveTimer.current != null) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      if (
        !hydratedRef.current ||
        loadFailedRef.current ||
        !dirtyRef.current ||
        lockedRef.current
      ) {
        return;
      }
      const payload = docRef.current;
      void invoke("save_saved_macro", {
        id: macroIdRef.current,
        doc: payload,
      }).catch(() => {});
    };
  }, []);

  const syncRecordState = useCallback(async () => {
    try {
      const rec = await invoke<{
        recording: boolean;
        paused?: boolean;
        actionCount?: number;
      }>("get_record_state");
      setRecording(rec.recording);
      setRecordPaused(!!rec.paused);
      if (rec.recording && typeof rec.actionCount === "number") {
        setRecordCount(rec.actionCount);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void syncRecordState();
  }, [engineState, syncRecordState]);

  useEffect(() => {
    const id = window.setInterval(() => void syncRecordState(), 500);
    return () => window.clearInterval(id);
  }, [syncRecordState]);

  useEffect(() => {
    let cancelled = false;
    let unAction: (() => void) | undefined;
    let unRecord: (() => void) | undefined;

    void (async () => {
      const actionUn = await listen<{
        index: number;
        path?: number[];
        repeat: number;
      }>("engine://action", (e) => {
        const path = e.payload.path ?? [e.payload.index];
        setActivePath(path);
      });
      if (cancelled) {
        actionUn();
        return;
      }
      unAction = actionUn;

      const recordUn = await listen<{ count: number }>("engine://record", (e) => {
        setRecordCount(e.payload.count);
        setRecording(true);
      });
      if (cancelled) {
        recordUn();
        return;
      }
      unRecord = recordUn;
    })();

    return () => {
      cancelled = true;
      unAction?.();
      unRecord?.();
    };
  }, []);

  useEffect(() => {
    if (engineState !== "running" && engineState !== "paused") {
      setActivePath(null);
    }
  }, [engineState]);

  const updateDoc = useCallback(
    (next: MacroDocument, opts?: { skipHistory?: boolean }) => {
      // Ignore edits while the first load is in flight — emptyMacro is not dirty.
      if (!hydratedRef.current) return;
      if (!opts?.skipHistory && !lockedRef.current) {
        pastRef.current = [
          ...pastRef.current,
          {
            doc: cloneDoc(docRef.current),
            selectedPath: selectedPathRef.current
              ? [...selectedPathRef.current]
              : null,
          },
        ].slice(-HISTORY_MAX);
        futureRef.current = [];
        syncHistoryFlags();
      }
      setDoc(next);
      setDirty(JSON.stringify(next) !== baselineRef.current);
    },
    [syncHistoryFlags],
  );

  const undo = useCallback(() => {
    if (lockedRef.current || pastRef.current.length === 0) return;
    const prev = pastRef.current[pastRef.current.length - 1]!;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [
      ...futureRef.current,
      {
        doc: cloneDoc(docRef.current),
        selectedPath: selectedPathRef.current
          ? [...selectedPathRef.current]
          : null,
      },
    ].slice(-HISTORY_MAX);
    syncHistoryFlags();
    setSelectedPath(prev.selectedPath);
    selectedPathRef.current = prev.selectedPath;
    updateDoc(prev.doc, { skipHistory: true });
  }, [syncHistoryFlags, updateDoc]);

  const redo = useCallback(() => {
    if (lockedRef.current || futureRef.current.length === 0) return;
    const next = futureRef.current[futureRef.current.length - 1]!;
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [
      ...pastRef.current,
      {
        doc: cloneDoc(docRef.current),
        selectedPath: selectedPathRef.current
          ? [...selectedPathRef.current]
          : null,
      },
    ].slice(-HISTORY_MAX);
    syncHistoryFlags();
    setSelectedPath(next.selectedPath);
    selectedPathRef.current = next.selectedPath;
    updateDoc(next.doc, { skipHistory: true });
  }, [syncHistoryFlags, updateDoc]);

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (lockedRef.current || recording) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, recording, redo, undo]);

  const commitRename = useCallback(
    async (rawName: string) => {
      if (lockedRef.current || recording) return;
      const from = macroIdRef.current;
      const trimmed = rawName.trim();
      if (!trimmed || trimmed === from) {
        updateDoc({ ...docRef.current, name: from });
        return;
      }
      try {
        if (dirtyRef.current) {
          await persistNow({ ...docRef.current, name: from }, from);
        }
        const renamed = await invoke<MacroDocument>("rename_saved_macro", {
          from,
          to: trimmed,
        });
        setDoc(renamed);
        baselineRef.current = JSON.stringify(renamed);
        setDirty(false);
        onRenamed?.(from, renamed.name);
      } catch (e) {
        updateDoc({ ...docRef.current, name: from });
        toast.error(errMessage(e, t("shell.renameFailed")));
      }
    },
    [onRenamed, persistNow, recording, t, toast, updateDoc],
  );

  const applyRecordedDoc = useCallback(
    (next: MacroDocument) => {
      setDoc(next);
      baselineRef.current = JSON.stringify(next);
      setDirty(false);
      setSelectedPath(null);
    },
    [],
  );

  const onPlay = useCallback(async () => {
    if (recording) return;
    try {
      if (automationPrefs.autoSaveBeforeRun && !lockedRef.current) {
        await flushAutosave();
      }
      const st = await invoke<EngineStatus>("launch_saved_macro", {
        name: macroIdRef.current,
      });
      onStatus(st);
      toast.success(t("macros.toast.testStarted"));
    } catch (e) {
      toast.error(errMessage(e, t("macros.toast.testFailed")));
    }
  }, [
    automationPrefs.autoSaveBeforeRun,
    flushAutosave,
    onStatus,
    recording,
    t,
    toast,
  ]);

  const onStopSession = useCallback(async () => {
    try {
      const st = await invoke<EngineStatus>("emergency_stop");
      onStatus(st);
      toast.info(t("shell.sessionStopped"));
    } catch {
      try {
        const st = await invoke<EngineStatus>("request_cancel");
        onStatus(st);
        toast.info(t("shell.cancelRequested"));
      } catch (e) {
        toast.error(errMessage(e, t("shell.cannotStop")));
      }
    }
  }, [onStatus, t, toast]);

  const onPauseSession = useCallback(async () => {
    try {
      const st = await invoke<EngineStatus>("pause_macro");
      onStatus(st);
    } catch (e) {
      toast.error(errMessage(e, t("macros.toast.resumeFailed")));
    }
  }, [onStatus, t, toast]);

  const onResumeSession = useCallback(async () => {
    try {
      const st = await invoke<EngineStatus>("resume_macro");
      onStatus(st);
    } catch (e) {
      toast.error(errMessage(e, t("macros.toast.resumeFailed")));
    }
  }, [onStatus, t, toast]);

  const onRunFrom = useCallback(
    async (path: ActionPath) => {
      if (recording) return;
      if (!path.length) {
        if (automationPrefs.runFromRequiresSelection) {
          toast.error(t("macros.toast.selectStepToTest"));
        }
        return;
      }
      try {
        if (automationPrefs.autoSaveBeforeRun && !lockedRef.current) {
          await flushAutosave();
        }
        const st = await invoke<EngineStatus>("launch_saved_macro", {
          name: macroIdRef.current,
          fromPath: path,
        });
        onStatus(st);
        toast.success(t("macros.toast.testFromStepStarted"));
      } catch (e) {
        const msg = errMessage(e, t("macros.toast.testFromStepFailed"));
        if (/from_path|hors limites|branche manquante/i.test(msg)) {
          toast.error(t("macros.toast.invalidStepPath"));
        } else {
          toast.error(msg);
        }
      }
    },
    [
      automationPrefs.autoSaveBeforeRun,
      automationPrefs.runFromRequiresSelection,
      flushAutosave,
      onStatus,
      recording,
      t,
      toast,
    ],
  );

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (recording) return;
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      if (e.key !== "Enter" && e.code !== "Enter") return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }
      const path = selectedPathRef.current;
      if (!path) {
        toast.info(t("macros.toast.selectStepHint"));
        return;
      }
      e.preventDefault();
      void onRunFrom(path);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onRunFrom, recording, t, toast]);

  const onStartRecord = useCallback(async () => {
    if (locked || recording) return;
    try {
      let replace = false;
      if (docRef.current.actions.length > 0) {
        const ok = await confirmAction({
          title: t("macros.confirm.recordModeTitle"),
          message: t("macros.confirm.recordModeMessage"),
          confirmLabel: t("macros.confirm.recordModeReplace"),
          cancelLabel: t("macros.confirm.recordModeAppend"),
          danger: false,
        });
        replace = ok;
      }
      await flushAutosave();
      await invoke("set_macro", { doc: docRef.current });
      await invoke("start_record", {
        args: {
          replace,
          mouseOnly: false,
          keyboardOnly: false,
        },
      });
      setRecording(true);
      setRecordPaused(false);
      setRecordCount(0);
      setActivePath(null);
      toast.success(t("macros.toast.captureStarted"));
    } catch (e) {
      setRecording(false);
      toast.error(errMessage(e, t("macros.toast.captureStartFailed")));
      await syncRecordState();
    }
  }, [flushAutosave, locked, recording, syncRecordState, t, toast]);

  const onApplyPreset = useCallback(
    async (name: string) => {
      if (lockedRef.current || recording) return;
      try {
        const loaded = await invoke<MacroDocument>("load_preset_macro", {
          name,
        });
        const next: MacroDocument = {
          ...docRef.current,
          actions: loaded.actions,
          repeatCount: loaded.repeatCount,
          schemaVersion: loaded.schemaVersion ?? docRef.current.schemaVersion,
        };
        updateDoc(next);
        setSelectedPath(null);
        toast.success(t("macros.toast.presetApplied", { name }));
      } catch (e) {
        toast.error(errMessage(e, t("macros.toast.presetNotFound")));
      }
    },
    [recording, t, toast, updateDoc],
  );

  const onPauseRecord = useCallback(async () => {
    try {
      const rec = await invoke<{ paused?: boolean; actionCount?: number }>(
        "pause_record",
      );
      setRecordPaused(!!rec.paused);
      if (typeof rec.actionCount === "number") setRecordCount(rec.actionCount);
    } catch (e) {
      toast.error(errMessage(e, t("macros.toast.capturePauseFailed")));
    }
  }, [t, toast]);

  const onResumeRecord = useCallback(async () => {
    try {
      const rec = await invoke<{ paused?: boolean; actionCount?: number }>(
        "resume_record",
      );
      setRecordPaused(!!rec.paused);
      if (typeof rec.actionCount === "number") setRecordCount(rec.actionCount);
    } catch (e) {
      toast.error(errMessage(e, t("macros.toast.captureResumeFailed")));
    }
  }, [t, toast]);

  const onStopRecord = useCallback(async () => {
    try {
      const next = await invoke<MacroDocument>("stop_record");
      setRecording(false);
      setRecordPaused(false);
      applyRecordedDoc(next);
      void persistNow(next, macroIdRef.current).catch(() => {});
      toast.success(t("macros.toast.captureApplied"));
    } catch (e) {
      setRecording(false);
      toast.error(errMessage(e, t("macros.toast.captureAlreadyStopped")));
      await syncRecordState();
      try {
        const loaded = await invoke<MacroDocument | null>("get_macro");
        if (loaded) {
          applyRecordedDoc(loaded);
          void persistNow(loaded, macroIdRef.current).catch(() => {});
        }
      } catch {
        /* ignore */
      }
    }
  }, [applyRecordedDoc, persistNow, syncRecordState, t, toast]);

  const addAction = useCallback(
    (kind: MacroAction["type"]) => {
      if (editorLocked) return;
      const action = makeAction(kind, t);
      const next = { ...doc, actions: [...doc.actions, action] };
      updateDoc(next);
      setSelectedPath([next.actions.length - 1]);
    },
    [doc, editorLocked, t, updateDoc],
  );

  const addToBranchAt = useCallback(
    (
      path: ActionPath,
      branch: "then" | "else" | "body",
      kind: MacroAction["type"],
    ) => {
      if (editorLocked) return;
      const action = makeAction(kind, t);
      const parent = getAtPath(doc.actions, path);
      let childIndex = 0;
      if (parent?.type === "control.if") {
        childIndex =
          branch === "else"
            ? (parent.else?.length ?? 0)
            : (parent.then?.length ?? 0);
      } else if (parent?.type === "control.while" && branch === "body") {
        childIndex = parent.body?.length ?? 0;
      }
      const branchIdx = branch === "else" ? 1 : 0;
      updateDoc({
        ...doc,
        actions: appendChild(doc.actions, path, branch, action),
      });
      setSelectedPath([...path, branchIdx, childIndex]);
    },
    [doc, editorLocked, t, updateDoc],
  );

  const onRemove = useCallback(
    (path: ActionPath) => {
      updateDoc({ ...doc, actions: removeAtPath(doc.actions, path) });
      setSelectedPath(null);
    },
    [doc, updateDoc],
  );

  const onRemoveMany = useCallback(
    (paths: ActionPath[]) => {
      if (editorLocked || paths.length === 0) return;
      updateDoc({
        ...doc,
        actions: removeManyAtPaths(doc.actions, paths),
      });
      setSelectedPath(null);
    },
    [doc, editorLocked, updateDoc],
  );

  const onDuplicate = useCallback(
    (path: ActionPath) => {
      if (editorLocked) return;
      const result = duplicateAtPath(doc.actions, path);
      if (!result) return;
      updateDoc({ ...doc, actions: result.actions });
      setSelectedPath(result.newPath);
    },
    [doc, editorLocked, updateDoc],
  );

  const onDuplicateMany = useCallback(
    (paths: ActionPath[]) => {
      if (editorLocked || paths.length === 0) return;
      const result = duplicateManyAtPaths(doc.actions, paths);
      updateDoc({ ...doc, actions: result.actions });
      if (result.lastPath) setSelectedPath(result.lastPath);
    },
    [doc, editorLocked, updateDoc],
  );

  const onMove = useCallback(
    (path: ActionPath, dir: -1 | 1) => {
      if (editorLocked) return;
      const next = moveInParent(doc.actions, path, dir);
      if (!next) return;
      const leaf = path[path.length - 1]!;
      updateDoc({ ...doc, actions: next });
      setSelectedPath([...path.slice(0, -1), leaf + dir]);
    },
    [doc, editorLocked, updateDoc],
  );

  const onMoveMany = useCallback(
    (paths: ActionPath[], dir: -1 | 1) => {
      if (editorLocked || paths.length === 0) return;
      const next = moveManyInParent(doc.actions, paths, dir);
      if (!next) return;
      updateDoc({ ...doc, actions: next });
      const parent = paths[0]!.slice(0, -1);
      const indices = paths
        .filter(
          (p) =>
            p.length === parent.length + 1 &&
            parent.every((seg, i) => p[i] === seg),
        )
        .map((p) => p[p.length - 1]!);
      if (indices.length > 0) {
        const min = Math.min(...indices);
        setSelectedPath([...parent, min + dir]);
      }
    },
    [doc, editorLocked, updateDoc],
  );

  const onInsertAfter = useCallback(
    (path: ActionPath, kind: MacroAction["type"]) => {
      if (editorLocked) return;
      const leaf = path[path.length - 1]!;
      const insertPath: ActionPath = [...path.slice(0, -1), leaf + 1];
      const action = makeAction(kind, t);
      const actions = insertAtPath(doc.actions, insertPath, action);
      updateDoc({ ...doc, actions });
      setSelectedPath(insertPath);
    },
    [doc, editorLocked, t, updateDoc],
  );

  const onInsertBefore = useCallback(
    (path: ActionPath, kind: MacroAction["type"]) => {
      if (editorLocked) return;
      const leaf = path[path.length - 1]!;
      const insertPath: ActionPath = [...path.slice(0, -1), leaf];
      const action = makeAction(kind, t);
      const actions = insertAtPath(doc.actions, insertPath, action);
      updateDoc({ ...doc, actions });
      setSelectedPath(insertPath);
    },
    [doc, editorLocked, t, updateDoc],
  );

  const onPasteAfter = useCallback(
    (path: ActionPath, action: MacroAction | MacroAction[]) => {
      if (editorLocked) return;
      const batch = Array.isArray(action) ? action : [action];
      const result =
        batch.length === 1
          ? pasteAfterAtPath(doc.actions, path, batch[0]!)
          : pasteManyAfterAtPath(doc.actions, path, batch);
      if (!result) return;
      updateDoc({ ...doc, actions: result.actions });
      setSelectedPath(result.newPath);
    },
    [doc, editorLocked, updateDoc],
  );

  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const restoreEngineMacro = useCallback(async () => {
    await invoke<MacroDocument>("load_saved_macro", {
      name: macroIdRef.current,
    });
  }, []);

  const onDuplicateMacro = useCallback(async () => {
    if (lockedRef.current || recording) return;
    try {
      await flushAutosave();
      const copy = await invoke<MacroDocument>("duplicate_saved_macro", {
        name: macroIdRef.current,
      });
      await restoreEngineMacro();
      toast.success(
        t("automations.toast.macroDuplicated", { name: copy.name }),
      );
      onOpenMacro?.(copy.name, copy.name);
    } catch (e) {
      toast.error(errMessage(e, t("macros.toast.saveFailed")));
    }
  }, [flushAutosave, onOpenMacro, recording, restoreEngineMacro, t, toast]);

  const onExportMacro = useCallback(async () => {
    if (recording) return;
    try {
      if (!lockedRef.current) {
        await flushAutosave();
      }
      await restoreEngineMacro();
      const path = await save({
        filters: [
          { name: t("macros.library.dialogFilter"), extensions: ["json"] },
        ],
        defaultPath: `${macroIdRef.current.replace(/\s+/g, "-").toLowerCase()}.json`,
      });
      if (!path) return;
      await invoke("export_macro_path", { path });
      toast.success(t("macros.toast.exported"));
    } catch (e) {
      toast.error(errMessage(e, t("macros.toast.exportFailed")));
    }
  }, [flushAutosave, recording, restoreEngineMacro, t, toast]);

  const onImportMacro = useCallback(async () => {
    if (lockedRef.current || recording) return;
    try {
      await flushAutosave();
      const path = await open({
        multiple: false,
        filters: [
          { name: t("macros.library.dialogFilter"), extensions: ["json"] },
        ],
      });
      if (!path || Array.isArray(path)) return;
      const imported = await invoke<MacroDocument>("import_macro_path", {
        path,
      });
      const base = (imported.name || "macro").trim() || "macro";
      const id = await uniqueMacroId(base);
      const toSave: MacroDocument = { ...imported, name: id };
      await invoke("save_saved_macro", { id, doc: toSave });
      await restoreEngineMacro();
      toast.success(t("macros.toast.imported", { name: id }));
      onOpenMacro?.(id, id);
    } catch (e) {
      toast.error(errMessage(e, t("macros.toast.importFailed")));
    }
  }, [flushAutosave, onOpenMacro, recording, restoreEngineMacro, t, toast]);

  const titleBarPortal = useTitleBarSlot(
    doc.name || macroId,
    <MacroTitleBarTools
      onBack={onBack}
      locked={locked}
      onLockChange={(nextLocked) => {
        void (async () => {
          try {
            await invoke("set_library_item_locked_cmd", {
              kind: "macro",
              id: macroId,
              locked: nextLocked,
            });
            setLocked(nextLocked);
            toast.success(
              nextLocked
                ? t("automations.toast.locked")
                : t("automations.toast.unlocked"),
            );
          } catch (e) {
            toast.error(
              typeof e === "string" ? e : t("automations.toast.lockFail"),
            );
          }
        })();
      }}
      onDuplicate={() => void onDuplicateMacro()}
      onImport={() => void onImportMacro()}
      onExport={() => void onExportMacro()}
      loading={loading}
      dirty={dirty}
      engineState={engineState}
      recording={recording}
      recordPaused={recordPaused}
      recordCount={recordCount}
      onPlay={() => void onPlay()}
      onPause={() => void onPauseSession()}
      onResume={() => void onResumeSession()}
      onStop={() => void onStopSession()}
      onPlayFrom={
        selectedPath && !recording
          ? () => void onRunFrom(selectedPath)
          : undefined
      }
      onStartRecord={() => void onStartRecord()}
      onPauseRecord={() => void onPauseRecord()}
      onResumeRecord={() => void onResumeRecord()}
      onStopRecord={() => void onStopRecord()}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={editorLocked ? undefined : undo}
      onRedo={editorLocked ? undefined : redo}
      processFilter={globalProcessFilter}
      processFilterMode={doc.processFilter ?? "inherit"}
      onProcessFilterModeChange={(mode: ProcessFilterScopeMode) => {
        const cur = docRef.current;
        updateDoc({
          ...cur,
          processFilter: mode,
          ...(mode === "local"
            ? {
                localProcessFilter: withLocalEnabled(
                  cur.localProcessFilter ?? DEFAULT_PROCESS_FILTER,
                ),
              }
            : {}),
        });
      }}
      localProcessFilter={doc.localProcessFilter ?? DEFAULT_PROCESS_FILTER}
      onLocalProcessFilterChange={(localProcessFilter) =>
        updateDoc({ ...docRef.current, localProcessFilter })
      }
      onOpenProcessSettings={onOpenProcessSettings}
      onGlobalProcessFilterChange={(next) => {
        void persistGlobalProcessFilter(next);
      }}
      processFilterPresets={processFilterPresets}
      onProcessFilterPresetsChange={(next) => {
        void persistProcessFilterPresets(next);
      }}
      meta={
        <MacroMetaBar
          doc={doc}
          locked={editorLocked || loading}
          onChange={updateDoc}
          onNameCommit={(name) => void commitRename(name)}
        />
      }
      allowNetwork={!!doc.allowNetwork}
      allowProcess={!!doc.allowProcess}
      onPermissionsChange={(partial) =>
        updateDoc({
          ...docRef.current,
          schemaVersion: Math.max(docRef.current.schemaVersion, 9),
          ...partial,
        })
      }
      metaTools={
        <MacroMetaTools
          doc={doc}
          macroId={macroId}
          locked={editorLocked || loading}
          onChange={updateDoc}
          onError={(msg: string) => toast.error(msg)}
        />
      }
    />,
    { active },
  );

  const editorTabs: { id: EditorTab; label: string }[] = [
    { id: "actions", label: t("macros.editorTabs.actions") },
    { id: "params", label: t("macros.editorTabs.params") },
    { id: "variables", label: t("macros.editorTabs.variables") },
    { id: "journal", label: t("macros.editorTabs.journal") },
  ];

  return (
    <div
      className="caster-page caster-macro-editor"
      aria-busy={loading || undefined}
    >
      {titleBarPortal}
      <div className="caster-editor-layout">
        <div className="caster-seq-panel">
          <div
            className="caster-editor-inner-tabs"
            role="tablist"
            aria-label={t("macros.editorTabs.actions")}
          >
            {editorTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={editorTab === tab.id}
                className={cx(
                  "caster-editor-inner-tab",
                  editorTab === tab.id && "is-active",
                )}
                onClick={() => {
                  if (tab.id === "journal") {
                    onOpenJournal?.();
                    setEditorTab("actions");
                    return;
                  }
                  setEditorTab(tab.id);
                }}
              >
                {tab.label}
                {tab.id === "journal" && journalHasErrors ? (
                  <span
                    className="caster-editor-inner-tab-badge"
                    aria-label={t("macros.editorTabs.journalErrors")}
                  />
                ) : null}
              </button>
            ))}
          </div>
          {editorTab === "actions" ? (
            <>
              <div className="caster-actions-toolbar">
                <span className="caster-actions-count">
                  {doc.actions.length === 1
                    ? t("macros.menu.list.stepsCountOne")
                    : t("macros.menu.list.stepsCount", {
                        n: doc.actions.length,
                      })}
                </span>
                <div className="caster-actions-toolbar-end">
                  {!editorLocked ? (
                    <ActionPickerMenu
                      label={t("macros.toolbar.add")}
                      disabled={loading}
                      items={buildActionAddMenu(addAction, t)}
                      open={addMenuOpen}
                      onOpenChange={setAddMenuOpen}
                      triggerClassName="caster-btn caster-btn-ghost caster-actions-toolbar-btn"
                      triggerContent={<Plus size={14} aria-hidden />}
                    />
                  ) : null}
                  <button
                    type="button"
                    className="caster-btn caster-btn-ghost caster-actions-toolbar-btn"
                    title={t("macros.menu.list.headAction")}
                    aria-label={t("macros.menu.list.headAction")}
                    onClick={() => {
                      document
                        .querySelector<HTMLElement>(".action-list")
                        ?.focus({ preventScroll: false });
                    }}
                  >
                    <LayoutTemplate size={14} aria-hidden />
                  </button>
                </div>
              </div>
            <div
              className="caster-seq-scroll"
              onClick={(e) => {
                const el = e.target as HTMLElement;
                if (
                  el.closest(
                    ".action-list-item, .action-list-bulk, .action-list-empty, .action-list-shell, .caster-action-picker-root, .caster-dropdown-menu-root, .caster-menu-popover, .caster-context-menu, button, a, input, select, textarea, label, [role='button']",
                  )
                ) {
                  return;
                }
                setSelectedPath(null);
              }}
              onContextMenu={
                editorLocked
                  ? undefined
                  : (e) => {
                      const el = e.target as HTMLElement;
                      if (el.closest(".action-list-item")) return;
                      if (el.closest(".caster-context-menu")) return;
                      if (!el.closest(".action-list")) {
                        e.preventDefault();
                      }
                    }
              }
            >
              {!hydrated ? (
                <div
                  className="caster-seq-loading"
                  aria-busy="true"
                  aria-live="polite"
                />
              ) : (
                <ActionList
                  actions={doc.actions}
                  selectedPath={selectedPath}
                  activePath={activePath}
                  readOnly={editorLocked}
                  confirmDeleteAction={confirmationsPrefs.deleteAction}
                  onSelect={(path) => {
                    setSelectedPath(path);
                    persistPropsOpen(true);
                  }}
                  onReorder={(from, to) => {
                    const next = reorderAtPath(doc.actions, from, to);
                    if (next) updateDoc({ ...doc, actions: next });
                  }}
                  onRemove={onRemove}
                  onRemoveMany={onRemoveMany}
                  onDuplicate={onDuplicate}
                  onDuplicateMany={onDuplicateMany}
                  onMove={onMove}
                  onMoveMany={onMoveMany}
                  onRunFrom={
                    recording ? undefined : (path) => void onRunFrom(path)
                  }
                  onInsertBefore={onInsertBefore}
                  onInsertAfter={onInsertAfter}
                  onPasteAfter={onPasteAfter}
                  onAddKind={editorLocked ? undefined : addAction}
                  onOpenAddMenu={
                    editorLocked ? undefined : () => setAddMenuOpen(true)
                  }
                  onEmptyAdd={
                    editorLocked ? undefined : () => addAction("mouse.click")
                  }
                  addMenuItems={
                    editorLocked ? undefined : buildActionAddMenu(addAction, t)
                  }
                  addMenuOpen={addMenuOpen}
                  onAddMenuOpenChange={setAddMenuOpen}
                  onStartRecord={
                    editorLocked || recording
                      ? undefined
                      : () => void onStartRecord()
                  }
                  onApplyPreset={
                    editorLocked ? undefined : (name) => void onApplyPreset(name)
                  }
                  onClearSelection={() => setSelectedPath(null)}
                  onUndo={editorLocked ? undefined : undo}
                  onRedo={editorLocked ? undefined : redo}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  onChangeAction={(path, a) =>
                    updateDoc({
                      ...doc,
                      actions: updateAtPath(doc.actions, path, a),
                    })
                  }
                  onAddToBranch={editorLocked ? undefined : addToBranchAt}
                  onOpenScript={onOpenScript}
                />
              )}
            </div>
            </>
          ) : null}
          {editorTab === "params" ? (
            <div className="caster-macro-tab-pane">
              <div className="caster-macro-tab-pane-tools">
                <MacroMetaTools
                  doc={doc}
                  macroId={macroId}
                  locked={editorLocked || loading}
                  onChange={updateDoc}
                  onError={(msg: string) => toast.error(msg)}
                />
              </div>
            </div>
          ) : null}
          {editorTab === "variables" ? (
            <div className="caster-macro-tab-pane">
              {usedVariables.length === 0 ? (
                <div className="caster-macro-tab-empty">
                  <strong>{t("macros.editorTabs.variablesEmpty")}</strong>
                  <p>{t("macros.editorTabs.variablesLead")}</p>
                </div>
              ) : (
                <ul className="caster-macro-var-list">
                  {usedVariables.map((name) => (
                    <li key={name}>
                      <code>{name}</code>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
        {propsOpen ? (
          <div
            className="caster-inspector-shell"
            style={{ width: propsWidth }}
          >
            <div
              className="caster-inspector-splitter"
              role="separator"
              aria-orientation="vertical"
              onPointerDown={onPropsResizePointerDown}
              onPointerMove={onPropsResizePointerMove}
              onPointerUp={onPropsResizePointerUp}
              onPointerCancel={onPropsResizePointerUp}
            />
            <InspectorPanel
              title={t("macros.inspector.title")}
              onClose={() => persistPropsOpen(false)}
              closeLabel={t("common.close")}
            >
              {selectedAction ? (
                <>
                  <div className="caster-inspector-hero">
                    <span
                      className="caster-inspector-hero-icon"
                      data-tone={actionTone(selectedAction.type)}
                      aria-hidden
                    >
                      {(() => {
                        const tone = actionTone(selectedAction.type);
                        if (tone === "mouse")
                          return <MousePointerClick size={22} />;
                        if (tone === "wait") return <Clock size={22} />;
                        if (tone === "key") return <Keyboard size={22} />;
                        if (tone === "logic") return <GitBranch size={22} />;
                        if (tone === "data") return <Variable size={22} />;
                        if (tone === "system") return <Workflow size={22} />;
                        return <Play size={22} />;
                      })()}
                    </span>
                    <div className="caster-inspector-hero-text">
                      <strong>{actionTitle(selectedAction.type, t)}</strong>
                      <p>{actionLead(selectedAction.type, t)}</p>
                    </div>
                  </div>
                  <InspectorSection title={t("macros.inspector.params")}>
                    <ActionProps
                      action={selectedAction}
                      disabled={editorLocked}
                      onChange={(a) => {
                        if (!selectedPath) return;
                        updateDoc({
                          ...doc,
                          actions: updateAtPath(
                            doc.actions,
                            selectedPath,
                            a,
                          ),
                        });
                      }}
                      onOpenScript={onOpenScript}
                    />
                  </InspectorSection>
                  <InspectorSection
                    title={t("macros.inspector.options")}
                    defaultOpen={false}
                  >
                    <p className="caster-inspector-section-hint">
                      {t("macros.inspector.optionsLead")}
                    </p>
                  </InspectorSection>
                  <InspectorSection
                    title={t("macros.inspector.advanced")}
                    defaultOpen={false}
                  >
                    {selectedAction.type === "control.while" ||
                    selectedAction.type === "control.if" ? (
                      <ControlFlowAdvancedProps
                        action={selectedAction}
                        disabled={editorLocked}
                        onChange={(a) => {
                          if (!selectedPath) return;
                          updateDoc({
                            ...doc,
                            actions: updateAtPath(
                              doc.actions,
                              selectedPath,
                              a,
                            ),
                          });
                        }}
                      />
                    ) : (
                      <p className="caster-inspector-section-hint">
                        {t("macros.inspector.advancedLead")}
                      </p>
                    )}
                  </InspectorSection>
                </>
              ) : (
                <div className="caster-macro-tab-empty">
                  <strong>{t("macros.inspector.empty")}</strong>
                  <p>{t("macros.inspector.emptyLead")}</p>
                </div>
              )}
            </InspectorPanel>
          </div>
        ) : (
          <button
            type="button"
            className="caster-inspector-rail"
            onClick={() => persistPropsOpen(true)}
            aria-label={t("macros.inspector.open")}
            title={t("macros.inspector.open")}
          >
            {t("macros.inspector.short")}
          </button>
        )}
      </div>
    </div>
  );
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
