import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AddMenu, confirmAction } from "../../ui";
import { useToast } from "../../ui/v2";
import { ActionList } from "../ActionList";
import { buildActionAddMenu, makeAction } from "../actionFactory";
import { MacroMetaBar } from "../MacroMetaBar";
import {
  appendChild,
  emptyMacro,
  getAtPath,
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

const AUTOSAVE_MS = 400;

type Props = {
  macroId: string;
  onBack: () => void;
  onDirtyChange?: (id: string, dirty: boolean) => void;
  engineState: string;
  onStatus: (s: EngineStatus) => void;
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
  onStatus,
  engineState,
}: Props) {
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
  const baselineRef = useRef("");
  const autosaveTimer = useRef<number | null>(null);
  const docRef = useRef(doc);
  const uiLayoutRef = useRef(uiLayout);
  const macroIdRef = useRef(macroId);
  const lockedRef = useRef(locked);
  const dirtyRef = useRef(dirty);

  docRef.current = doc;
  uiLayoutRef.current = uiLayout;
  macroIdRef.current = macroId;
  lockedRef.current = locked;
  dirtyRef.current = dirty;

  const editorLocked = locked || recording;

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

  const updateDoc = useCallback((next: MacroDocument) => {
    setDoc(next);
    setDirty(JSON.stringify(next) !== baselineRef.current);
  }, []);

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
      await flushAutosave();
      const st = await invoke<EngineStatus>("launch_saved_macro", {
        name: macroIdRef.current,
      });
      onStatus(st);
      toast.success("Test lancé");
    } catch (e) {
      toast.error(errMessage(e, "Échec du test"));
    }
  }, [flushAutosave, locked, onStatus, recording, toast]);

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
      onStartRecord={() => void onStartRecord()}
      onPauseRecord={() => void onPauseRecord()}
      onResumeRecord={() => void onResumeRecord()}
      onStopRecord={() => void onStopRecord()}
      meta={
        <MacroMetaBar
          doc={doc}
          macroId={macroId}
          locked={editorLocked}
          onChange={updateDoc}
          onError={(msg) => toast.error(msg)}
        />
      }
    />,
  );

  if (loading) {
    return (
      <div className="v2-page v2-macro-editor">
        {titleBarPortal}
        <div className="v2-macro-loading">Chargement de la macro…</div>
      </div>
    );
  }

  return (
    <div className="v2-page v2-macro-editor">
      {titleBarPortal}
      <div className="v2-editor-layout">
        <div className="v2-seq-panel">
          <div className="v2-seq-toolbar">
            <AddMenu
              label="+ Ajouter"
              disabled={editorLocked}
              items={buildActionAddMenu(addAction)}
            />
          </div>
          <div className="v2-seq-scroll">
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
              onEmptyAdd={editorLocked ? undefined : () => addAction("mouse.click")}
              onChangeAction={(path, a) =>
                updateDoc({
                  ...doc,
                  actions: updateAtPath(doc.actions, path, a),
                })
              }
              branchAddMenuItems={(branch) =>
                buildActionAddMenu((kind) => addToBranch(branch, kind))
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
