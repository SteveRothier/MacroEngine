import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { confirmAction } from "../../ui";
import { ActionPickerMenu, useToast } from "../../ui/v2";
import { ActionList } from "../ActionList";
import { buildActionAddMenu, makeAction } from "../actionFactory";
import { MacroMetaBar } from "../MacroMetaBar";
import {
  appendChild,
  duplicateAtPath,
  emptyMacro,
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
import type { MacroUiLayout } from "./macroToGraph";
import { MacroTitleBarTools } from "./MacroTitleBarTools";
import { useTitleBarSlot } from "../../ui/v2/TitleBarContext";
import { mergeAutomationPrefs } from "../../settings/settingsTypes";

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
  onBack: () => void;
  onDirtyChange?: (id: string, dirty: boolean) => void;
  /** Called after a successful library rename (id changed). */
  onRenamed?: (from: string, to: string) => void;
  engineState: string;
  onStatus: (s: EngineStatus) => void;
  onOpenScript?: (scriptId: string, label?: string) => void;
};

function saveErrorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return "Échec de l’enregistrement";
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
  const automationPrefs = mergeAutomationPrefs();
  const toast = useToast();
  const [doc, setDoc] = useState<MacroDocument>(() => emptyMacro(macroId));
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<ActionPath | null>(null);
  const [activePath, setActivePath] = useState<ActionPath | null>(null);
  const [locked, setLocked] = useState(false);
  const [uiLayout, setUiLayout] = useState<MacroUiLayout | undefined>();
  const [recording, setRecording] = useState(false);
  const [recordPaused, setRecordPaused] = useState(false);
  const [recordCount, setRecordCount] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const baselineRef = useRef("");
  const autosaveTimer = useRef<number | null>(null);
  const docRef = useRef(doc);
  const uiLayoutRef = useRef(uiLayout);
  const macroIdRef = useRef(macroId);
  const lockedRef = useRef(locked);
  const dirtyRef = useRef(dirty);
  const selectedPathRef = useRef(selectedPath);
  const pastRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);

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
    setLoading(true);
    void (async () => {
      try {
        const loaded = await invoke<MacroDocument>("load_saved_macro", { name: macroId });
        if (cancelled) return;
        setDoc(loaded);
        baselineRef.current = JSON.stringify(loaded);
        setDirty(false);
        setSelectedPath(null);
        setActivePath(null);
        pastRef.current = [];
        futureRef.current = [];
        setCanUndo(false);
        setCanRedo(false);
        const ext = loaded as MacroDocument & { uiLayout?: MacroUiLayout };
        setUiLayout(ext.uiLayout);
        try {
          const lib = await invoke<{ name: string; locked?: boolean }[]>("list_macro_library");
          if (!cancelled) {
            setLocked(Boolean(lib.find((m) => m.name === macroId)?.locked));
          }
        } catch {
          if (!cancelled) setLocked(false);
        }
      } catch {
        if (!cancelled) setDoc(emptyMacro(macroId));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [macroId]);

  useEffect(() => {
    onDirtyChange?.(macroId, dirty);
  }, [dirty, macroId, onDirtyChange]);

  const persistNow = useCallback(
    async (nextDoc: MacroDocument, id: string) => {
      try {
        const payload = { ...nextDoc, uiLayout: uiLayoutRef.current } as MacroDocument & {
          uiLayout?: MacroUiLayout;
        };
        await invoke("save_saved_macro", { id, doc: payload });
        baselineRef.current = JSON.stringify(nextDoc);
        setDirty(false);
      } catch (e) {
        toast.error(saveErrorMessage(e));
        throw e;
      }
    },
    [toast],
  );

  const flushAutosave = useCallback(async () => {
    if (autosaveTimer.current != null) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (dirtyRef.current && !lockedRef.current) {
      await persistNow(docRef.current, macroIdRef.current);
    }
  }, [persistNow]);

  useEffect(() => {
    if (!dirty || locked || loading || recording) return;
    if (autosaveTimer.current != null) {
      window.clearTimeout(autosaveTimer.current);
    }
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = null;
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
      if (dirtyRef.current && !lockedRef.current) {
        const payload = {
          ...docRef.current,
          uiLayout: uiLayoutRef.current,
        } as MacroDocument & { uiLayout?: MacroUiLayout };
        void invoke("save_saved_macro", {
          id: macroIdRef.current,
          doc: payload,
        }).catch(() => {});
      }
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
        toast.error(errMessage(e, "Renommage impossible"));
      }
    },
    [onRenamed, persistNow, recording, toast, updateDoc],
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
      toast.success("Test lancé");
    } catch (e) {
      toast.error(errMessage(e, "Échec du test"));
    }
  }, [automationPrefs.autoSaveBeforeRun, flushAutosave, locked, onStatus, recording, toast]);

  const onRunFrom = useCallback(
    async (path: ActionPath) => {
      if (locked || recording || editorLocked) return;
      if (!path.length) {
        if (automationPrefs.runFromRequiresSelection) {
          toast.error("Sélectionnez une étape pour tester depuis ici");
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
        toast.success("Test depuis l’étape lancé");
      } catch (e) {
        const msg = errMessage(e, "Échec du test depuis l’étape");
        if (/from_path|hors limites|branche manquante/i.test(msg)) {
          toast.error(
            "Chemin d’étape invalide — resélectionnez l’action puis réessayez",
          );
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
      toast,
    ],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (lockedRef.current || recording || editorLocked) return;
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      if (e.key !== "Enter" && e.code !== "Enter") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      const path = selectedPathRef.current;
      if (!path) {
        toast.info("Sélectionnez une étape (Ctrl+Shift+Entrée)");
        return;
      }
      e.preventDefault();
      void onRunFrom(path);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editorLocked, onRunFrom, recording, toast]);

  const onStartRecord = useCallback(async () => {
    if (locked || recording) return;
    try {
      let replace = false;
      if (docRef.current.actions.length > 0) {
        const ok = await confirmAction({
          title: "Mode enregistrement",
          message:
            "Cette macro a déjà des actions. Remplacer la séquence ou ajouter à la fin ?",
          confirmLabel: "Remplacer",
          cancelLabel: "Ajouter",
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
      toast.success("Capture démarrée");
    } catch (e) {
      setRecording(false);
      toast.error(errMessage(e, "Impossible de démarrer l’enregistrement."));
      await syncRecordState();
    }
  }, [flushAutosave, locked, recording, syncRecordState, toast]);

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
        toast.success(`Modèle « ${name} » appliqué`);
      } catch (e) {
        toast.error(errMessage(e, "Preset introuvable"));
      }
    },
    [recording, toast, updateDoc],
  );

  const onPauseRecord = useCallback(async () => {
    try {
      const rec = await invoke<{ paused?: boolean; actionCount?: number }>(
        "pause_record",
      );
      setRecordPaused(!!rec.paused);
      if (typeof rec.actionCount === "number") setRecordCount(rec.actionCount);
    } catch (e) {
      toast.error(errMessage(e, "Pause capture impossible."));
    }
  }, [toast]);

  const onResumeRecord = useCallback(async () => {
    try {
      const rec = await invoke<{ paused?: boolean; actionCount?: number }>(
        "resume_record",
      );
      setRecordPaused(!!rec.paused);
      if (typeof rec.actionCount === "number") setRecordCount(rec.actionCount);
    } catch (e) {
      toast.error(errMessage(e, "Reprise capture impossible."));
    }
  }, [toast]);

  const onStopRecord = useCallback(async () => {
    try {
      const next = await invoke<MacroDocument>("stop_record");
      setRecording(false);
      setRecordPaused(false);
      applyRecordedDoc(next);
      void persistNow(next, macroIdRef.current).catch(() => {});
      toast.success("Capture appliquée");
    } catch (e) {
      setRecording(false);
      toast.error(errMessage(e, "Enregistrement déjà arrêté."));
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
  }, [applyRecordedDoc, persistNow, syncRecordState, toast]);

  const addAction = useCallback(
    (kind: MacroAction["type"]) => {
      if (editorLocked) return;
      const action = makeAction(kind);
      const next = { ...doc, actions: [...doc.actions, action] };
      updateDoc(next);
      setSelectedPath([next.actions.length - 1]);
    },
    [doc, editorLocked, updateDoc],
  );

  const addToBranch = useCallback(
    (branch: "then" | "else", kind: MacroAction["type"]) => {
      if (!selectedPath || editorLocked) return;
      const selected = getAtPath(doc.actions, selectedPath);
      if (!selected || selected.type !== "control.if") return;
      const child = makeAction(kind);
      const actions = appendChild(doc.actions, selectedPath, branch, child);
      const branchIdx = branch === "then" ? 0 : 1;
      const list = branch === "then" ? selected.then : selected.else ?? [];
      updateDoc({ ...doc, actions });
      setSelectedPath([...selectedPath, branchIdx, list.length]);
    },
    [doc, editorLocked, selectedPath, updateDoc],
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
      const action = makeAction(kind);
      const actions = insertAtPath(doc.actions, insertPath, action);
      updateDoc({ ...doc, actions });
      setSelectedPath(insertPath);
    },
    [doc, editorLocked, updateDoc],
  );

  const onInsertBefore = useCallback(
    (path: ActionPath, kind: MacroAction["type"]) => {
      if (editorLocked) return;
      const leaf = path[path.length - 1]!;
      const insertPath: ActionPath = [...path.slice(0, -1), leaf];
      const action = makeAction(kind);
      const actions = insertAtPath(doc.actions, insertPath, action);
      updateDoc({ ...doc, actions });
      setSelectedPath(insertPath);
    },
    [doc, editorLocked, updateDoc],
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

  const titleBarPortal = useTitleBarSlot(
    doc.name || macroId,
    <MacroTitleBarTools
      onBack={onBack}
      locked={locked}
      engineState={engineState}
      recording={recording}
      recordPaused={recordPaused}
      recordCount={recordCount}
      onPlay={() => void onPlay()}
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
      meta={
        <MacroMetaBar
          doc={doc}
          macroId={macroId}
          locked={editorLocked}
          onChange={updateDoc}
          onNameCommit={(name) => void commitRename(name)}
          onError={(msg) => toast.error(msg)}
        />
      }
    />,
  );

  if (loading) {
    return (
      <div className="v2-page v2-macro-editor">
        {titleBarPortal}
        <div
          className="v2-macro-loading"
          aria-busy="true"
          aria-label="Chargement de la macro"
        >
          <div className="v2-skeleton-page v2-skeleton-page--center">
            <div
              className="v2-skeleton v2-skeleton-line v2-skeleton-line--lg"
              style={{ width: "55%" }}
            />
            <div className="v2-skeleton v2-skeleton-line" style={{ width: "88%" }} />
            <div className="v2-skeleton v2-skeleton-line" style={{ width: "72%" }} />
            <div className="v2-skeleton v2-skeleton-line" style={{ width: "80%" }} />
            <div className="v2-skeleton v2-skeleton-line" style={{ width: "64%" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="v2-page v2-macro-editor">
      {titleBarPortal}
      <div className="v2-editor-layout">
        <div className="v2-seq-panel">
          <div className="v2-seq-toolbar">
            <ActionPickerMenu
              label="+ Ajouter"
              disabled={editorLocked}
              items={buildActionAddMenu(addAction)}
              open={addMenuOpen}
              onOpenChange={setAddMenuOpen}
            />
          </div>
          <div
            className="v2-seq-scroll"
            onContextMenu={
              editorLocked
                ? undefined
                : (e) => {
                    const t = e.target as HTMLElement;
                    if (t.closest(".action-list-item")) return;
                    if (t.closest(".v2-context-menu")) return;
                    // Let ActionList handle empty/list background; still block browser menu on padding
                    if (!t.closest(".action-list")) {
                      e.preventDefault();
                    }
                  }
            }
          >
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
                buildActionAddMenu((kind) => addToBranch(branch, kind))
              }
              onOpenScript={onOpenScript}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
