import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { confirmAction } from "../../ui";
import { ActionPickerMenu, useToast } from "../../ui/shell";
import { ActionList } from "../ActionList";
import { buildActionAddMenu, makeAction } from "../actionFactory";
import { MacroMetaBar } from "../MacroMetaBar";
import {
  appendChild,
  duplicateAtPath,
  emptyMacro,
  flattenTree,
  getAtPath,
  insertAtPath,
  moveInParent,
  pasteAfterAtPath,
  removeAtPath,
  reorderAtPath,
  updateAtPath,
  type ActionPath,
  type EngineStatus,
  type MacroAction,
  type MacroDocument,
} from "../types";
import { MacroCanvas } from "./MacroCanvas";
import {
  extractUiLayout,
  macroToGraph,
  type MacroGraphNode,
  type MacroUiLayout,
} from "./macroToGraph";
import { MacroTitleBarTools } from "./MacroTitleBarTools";
import { useTitleBarSlot } from "../../ui/shell/TitleBarContext";
import { mergeAutomationPrefs } from "../../settings/settingsTypes";
import { useT, type TFunction } from "../../i18n";
import { runLibraryConvert } from "../../automations/convertLibraryItem";

const AUTOSAVE_MS = 400;
const HISTORY_MAX = 50;
const MACRO_VIEW_KEY = "caster-macro-view";

type EditorViewMode = "list" | "graph";

function readEditorViewMode(): EditorViewMode {
  try {
    const v = sessionStorage.getItem(MACRO_VIEW_KEY);
    if (v === "graph" || v === "list") return v;
  } catch {
    /* ignore */
  }
  return "list";
}

function findPathByActionId(
  actions: MacroDocument["actions"],
  actionId: string,
): ActionPath | null {
  for (const row of flattenTree(actions)) {
    if (row.action.id === actionId) return row.path;
  }
  return null;
}

type HistoryEntry = {
  doc: MacroDocument;
  selectedPath: ActionPath | null;
};

function cloneDoc(doc: MacroDocument): MacroDocument {
  return structuredClone(doc);
}

type Props = {
  macroId: string;
  onBack: () => void;
  onDirtyChange?: (id: string, dirty: boolean) => void;
  /** Called after a successful library rename (id changed). */
  onRenamed?: (from: string, to: string) => void;
  engineState: string;
  onStatus: (s: EngineStatus) => void;
  onOpenScript?: (scriptId: string, label?: string) => void;
};

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
  onStatus,
  engineState,
  onOpenScript,
}: Props) {
  const t = useT();
  const automationPrefs = mergeAutomationPrefs();
  const toast = useToast();
  const [doc, setDoc] = useState<MacroDocument>(() => emptyMacro(macroId));
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [selectedPath, setSelectedPath] = useState<ActionPath | null>(null);
  const [activePath, setActivePath] = useState<ActionPath | null>(null);
  const [locked, setLocked] = useState(false);
  const [uiLayout, setUiLayout] = useState<MacroUiLayout | undefined>();
  const [editorView, setEditorView] = useState<EditorViewMode>(readEditorViewMode);
  const [recording, setRecording] = useState(false);
  const [recordPaused, setRecordPaused] = useState(false);
  const [recordCount, setRecordCount] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const baselineRef = useRef("");
  const hydratedRef = useRef(false);
  const loadFailedRef = useRef(false);
  const autosaveTimer = useRef<number | null>(null);
  const docRef = useRef(doc);
  const uiLayoutRef = useRef(uiLayout);
  const macroIdRef = useRef(macroId);
  const lockedRef = useRef(locked);
  const dirtyRef = useRef(dirty);
  const selectedPathRef = useRef(selectedPath);
  const pastRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  const loadGenRef = useRef(0);

  docRef.current = doc;
  uiLayoutRef.current = uiLayout;
  macroIdRef.current = macroId;
  lockedRef.current = locked;
  dirtyRef.current = dirty;
  selectedPathRef.current = selectedPath;

  const editorLocked = locked || recording;

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
        const ext = loaded as MacroDocument & { uiLayout?: MacroUiLayout };
        setUiLayout(ext.uiLayout);
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

  useEffect(() => {
    try {
      sessionStorage.setItem(MACRO_VIEW_KEY, editorView);
    } catch {
      /* ignore */
    }
  }, [editorView]);

  const persistNow = useCallback(
    async (nextDoc: MacroDocument, id: string) => {
      if (!hydratedRef.current || loadFailedRef.current) return;
      try {
        const payload = { ...nextDoc, uiLayout: uiLayoutRef.current } as MacroDocument & {
          uiLayout?: MacroUiLayout;
        };
        await invoke("save_saved_macro", { id, doc: payload });
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
      const payload = {
        ...docRef.current,
        uiLayout: uiLayoutRef.current,
      } as MacroDocument & { uiLayout?: MacroUiLayout };
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
  }, [recording, redo, undo]);

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
    if (locked || recording) return;
    try {
      if (automationPrefs.autoSaveBeforeRun) {
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
    locked,
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

  const onRunFrom = useCallback(
    async (path: ActionPath) => {
      if (locked || recording || editorLocked) return;
      if (!path.length) {
        if (automationPrefs.runFromRequiresSelection) {
          toast.error(t("macros.toast.selectStepToTest"));
        }
        return;
      }
      try {
        if (automationPrefs.autoSaveBeforeRun) {
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
      editorLocked,
      flushAutosave,
      locked,
      onStatus,
      recording,
      t,
      toast,
    ],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (lockedRef.current || recording || editorLocked) return;
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
  }, [editorLocked, onRunFrom, recording, t, toast]);

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

  const addToBranch = useCallback(
    (branch: "then" | "else" | "body", kind: MacroAction["type"]) => {
      if (!selectedPath || editorLocked) return;
      const selected = getAtPath(doc.actions, selectedPath);
      if (!selected) return;
      if (selected.type === "control.if") {
        if (branch !== "then" && branch !== "else") return;
        const child = makeAction(kind, t);
        const actions = appendChild(doc.actions, selectedPath, branch, child);
        const branchIdx = branch === "then" ? 0 : 1;
        const list = branch === "then" ? selected.then : selected.else ?? [];
        updateDoc({ ...doc, actions });
        setSelectedPath([...selectedPath, branchIdx, list.length]);
        return;
      }
      if (selected.type === "control.while" && branch === "body") {
        const child = makeAction(kind, t);
        const actions = appendChild(doc.actions, selectedPath, "body", child);
        const list = selected.body ?? [];
        updateDoc({ ...doc, actions });
        setSelectedPath([...selectedPath, 0, list.length]);
      }
    },
    [doc, editorLocked, selectedPath, t, updateDoc],
  );

  const onRemove = useCallback(
    (path: ActionPath) => {
      updateDoc({ ...doc, actions: removeAtPath(doc.actions, path) });
      setSelectedPath(null);
    },
    [doc, updateDoc],
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
    (path: ActionPath, action: MacroAction) => {
      if (editorLocked) return;
      const result = pasteAfterAtPath(doc.actions, path, action);
      if (!result) return;
      updateDoc({ ...doc, actions: result.actions });
      setSelectedPath(result.newPath);
    },
    [doc, editorLocked, updateDoc],
  );

  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const graph = useMemo(
    () => macroToGraph(doc, uiLayout, t),
    [doc, uiLayout, t],
  );

  const selectedNodeId = useMemo(() => {
    if (!selectedPath) return null;
    const action = getAtPath(doc.actions, selectedPath);
    return action?.id ?? null;
  }, [doc.actions, selectedPath]);

  const onSelectGraphNode = useCallback(
    (nodeId: string | null) => {
      if (!nodeId) {
        setSelectedPath(null);
        return;
      }
      const path = findPathByActionId(doc.actions, nodeId);
      setSelectedPath(path);
    },
    [doc.actions],
  );

  const onGraphChange = useCallback(
    (nodes: MacroGraphNode[]) => {
      if (editorLocked || !hydratedRef.current || loadFailedRef.current) return;
      const layout = extractUiLayout({ nodes, edges: graph.edges });
      setUiLayout(layout);
      const payload = { ...docRef.current, uiLayout: layout };
      setDirty(JSON.stringify(payload) !== baselineRef.current);
    },
    [editorLocked, graph.edges],
  );

  const titleBarPortal = useTitleBarSlot(
    doc.name || macroId,
    <MacroTitleBarTools
      onBack={onBack}
      locked={locked}
      loading={loading}
      engineState={engineState}
      recording={recording}
      recordPaused={recordPaused}
      recordCount={recordCount}
      onPlay={() => void onPlay()}
      onStop={() => void onStopSession()}
      onPlayFrom={
        selectedPath && !editorLocked
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
      onConvertToScript={
        editorLocked
          ? undefined
          : () => {
              void (async () => {
                const outcome = await runLibraryConvert({
                  fromKind: "macro",
                  id: macroId,
                  toKind: "script",
                  name: doc.name || macroId,
                  t,
                });
                if (!outcome) return;
                toast.success(
                  t("automations.convert.success", {
                    name: outcome.result.newName,
                    kind: t(`automations.convert.kind.${outcome.result.toKind}`),
                  }),
                );
                if (outcome.openAfter && onOpenScript) {
                  onOpenScript(
                    outcome.result.newId,
                    outcome.result.newName,
                  );
                }
              })();
            }
      }
      meta={
        <MacroMetaBar
          doc={doc}
          macroId={macroId}
          locked={editorLocked || loading}
          onChange={updateDoc}
          onNameCommit={(name) => void commitRename(name)}
          onError={(msg) => toast.error(msg)}
        />
      }
    />,
  );

  return (
    <div
      className="caster-page caster-macro-editor"
      aria-busy={loading || undefined}
    >
      {titleBarPortal}
      <div className="caster-editor-layout">
        <div className="caster-seq-panel">
          <div className="caster-seq-toolbar">
            <ActionPickerMenu
              label={t("macros.toolbar.add")}
              disabled={editorLocked || !hydrated}
              items={buildActionAddMenu(addAction, t)}
              open={addMenuOpen}
              onOpenChange={setAddMenuOpen}
            />
            <div
              className="caster-segmented"
              role="group"
              aria-label={t("macros.toolbar.viewListAria")}
              style={{ marginLeft: "auto" }}
            >
              {(
                [
                  ["list", t("macros.toolbar.viewList"), t("macros.toolbar.viewListAria")],
                  ["graph", t("macros.toolbar.viewGraph"), t("macros.toolbar.viewGraphAria")],
                ] as const
              ).map(([value, label, aria]) => (
                <button
                  key={value}
                  type="button"
                  className={[
                    "caster-segmented-btn",
                    editorView === value ? "active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-label={aria}
                  aria-pressed={editorView === value}
                  disabled={editorLocked || !hydrated}
                  onClick={() => setEditorView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div
            className="caster-seq-scroll"
            onContextMenu={
              editorLocked
                ? undefined
                : (e) => {
                    const t = e.target as HTMLElement;
                    if (t.closest(".action-list-item")) return;
                    if (t.closest(".caster-context-menu")) return;
                    // Let ActionList handle empty/list background; still block browser menu on padding
                    if (!t.closest(".action-list")) {
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
            ) : editorView === "graph" ? (
              <MacroCanvas
                graphNodes={graph.nodes}
                graphEdges={graph.edges}
                selectedNodeId={selectedNodeId}
                onSelectNode={onSelectGraphNode}
                onGraphChange={onGraphChange}
                readOnly={editorLocked}
              />
            ) : (
              <ActionList
                actions={doc.actions}
                selectedPath={selectedPath}
                activePath={activePath}
                readOnly={editorLocked}
                onSelect={setSelectedPath}
                onReorder={(from, to) => {
                  const next = reorderAtPath(doc.actions, from, to);
                  if (next) updateDoc({ ...doc, actions: next });
                }}
                onRemove={onRemove}
                onDuplicate={onDuplicate}
                onMove={onMove}
                onRunFrom={editorLocked ? undefined : (path) => void onRunFrom(path)}
                onInsertBefore={onInsertBefore}
                onInsertAfter={onInsertAfter}
                onPasteAfter={onPasteAfter}
                onAddKind={editorLocked ? undefined : addAction}
                onOpenAddMenu={
                  editorLocked ? undefined : () => setAddMenuOpen(true)
                }
                onEmptyAdd={editorLocked ? undefined : () => addAction("mouse.click")}
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
                branchAddMenuItems={(branch) =>
                  buildActionAddMenu((kind) => addToBranch(branch, kind), t)
                }
                onOpenScript={onOpenScript}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
