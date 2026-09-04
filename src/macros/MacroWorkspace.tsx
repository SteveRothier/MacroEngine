/**
 * @deprecated Legacy shell — not mounted by MainAppV2.
 * Prefer ClickerStudio / MacroEditorView + AppShell v2.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Card, AddMenu, EmptyState, Icons, KbdChip, confirmAction, Badge } from "../ui";
import { actionDetailFr, actionTitleFr } from "./actionLabels";
import { LibrarySidebar } from "../library/LibrarySidebar";
import { ActionList } from "./ActionList";
import { ActionProps } from "./ActionProps";
import { buildActionAddMenu, makeAction } from "./actionFactory";
import {
  DEFAULT_PROCESS_FILTER,
  processFilterAllows,
  type ProcessFilter,
} from "../clicker/clickerTypes";
import {
  appendChild,
  emptyMacro,
  eventToVk,
  getAtPath,
  removeAtPath,
  reorderAtPath,
  updateAtPath,
  hotkeyTriggerMatches,
  triggerHotkeyLabel,
  type ActionPath,
  type EngineStatus,
  type HotkeyBindings,
  type KeyMods,
  type MacroAction,
  type MacroDocument,
  type MacroTrigger,
  vkLabel,
} from "./types";
import type { QuickAccess } from "../quickAccess";

type Props = {
  engineState: string;
  sessionName?: string | null;
  sessionKind?: EngineStatus["sessionKind"];
  onStatus: (s: EngineStatus) => void;
  macroHotkeyLabel?: string;
  emergencyHotkeyLabel?: string;
  hotkeys?: HotkeyBindings;
  onHotkeysChange?: (b: HotkeyBindings) => void;
  /** Open this macro when set (Automations → Ouvrir). */
  focusMacroName?: string | null;
  onFocusMacroConsumed?: () => void;
  /** Automations: signaler la macro dirty active. */
  onDirtyChange?: (name: string | null, dirty: boolean) => void;
};

const LAST_MACRO_KEY = "caster-last-macro";
const LEGACY_LAST_MACRO_KEY = "macroengine-last-macro";
const AUTOSAVE_MS = 400;
const HISTORY_MAX = 50;

type HistoryEntry = {
  doc: MacroDocument;
  selectedPath: ActionPath | null;
};

function cloneDoc(doc: MacroDocument): MacroDocument {
  return structuredClone(doc);
}

function captureMods(e: KeyboardEvent): KeyMods {
  return {
    ctrl: e.ctrlKey || e.metaKey,
    alt: e.altKey,
    shift: e.shiftKey,
  };
}

function triggerConflictsWithReserved(
  vk: number,
  mods: KeyMods,
  reserved: HotkeyBindings,
): boolean {
  if (vk === reserved.macroVk || vk === reserved.emergencyVk) return true;
  if (vk === reserved.actionVk) {
    return (
      !!mods.ctrl === !!reserved.actionCtrl &&
      !!mods.alt === !!reserved.actionAlt &&
      !!mods.shift === !!reserved.actionShift
    );
  }
  return false;
}

function errMessage(e: unknown, fallback: string): string {
  if (typeof e === "string" && e.trim()) return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

function readLastMacro(): string | null {
  try {
    const v =
      localStorage.getItem(LAST_MACRO_KEY) ??
      localStorage.getItem(LEGACY_LAST_MACRO_KEY);
    if (v && !localStorage.getItem(LAST_MACRO_KEY)) {
      localStorage.setItem(LAST_MACRO_KEY, v);
    }
    return v;
  } catch {
    return null;
  }
}

function writeLastMacro(name: string | null) {
  try {
    if (name) localStorage.setItem(LAST_MACRO_KEY, name);
    else localStorage.removeItem(LAST_MACRO_KEY);
  } catch {
    /* ignore */
  }
}

export function MacroWorkspace({
  engineState,
  sessionName = null,
  sessionKind = null,
  onStatus,
  macroHotkeyLabel = "F9",
  emergencyHotkeyLabel: _emergencyHotkeyLabel = "F8",
  hotkeys,
  onHotkeysChange,
  focusMacroName = null,
  onFocusMacroConsumed,
  onDirtyChange,
}: Props) {
  const [doc, setDoc] = useState<MacroDocument>(emptyMacro());
  const [library, setLibrary] = useState<
    {
      name: string;
      actionCount: number;
      triggerKey?: string | null;
      triggerMods?: KeyMods | null;
      locked?: boolean;
    }[]
  >([]);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [favoriteMacros, setFavoriteMacros] = useState<string[]>([]);
  const [activeLocked, setActiveLocked] = useState(false);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPath, setSelectedPath] = useState<ActionPath | null>(null);
  const [activePath, setActivePath] = useState<ActionPath | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordPaused, setRecordPaused] = useState(false);
  const [recordMouseOnly, setRecordMouseOnly] = useState(false);
  const [recordKeyboardOnly, setRecordKeyboardOnly] = useState(false);
  const [recordCount, setRecordCount] = useState(0);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const [capturingTrigger, setCapturingTrigger] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [processFilter, setProcessFilter] = useState<ProcessFilter>(
    DEFAULT_PROCESS_FILTER,
  );
  const [foregroundExe, setForegroundExe] = useState<string | null>(null);
  const autosaveTimer = useRef<number | null>(null);
  const docRef = useRef(doc);
  const activeNameRef = useRef(activeName);
  const hotkeysRef = useRef(hotkeys);
  const libraryRef = useRef(library);
  const selectedPathRef = useRef(selectedPath);
  const activeLockedRef = useRef(activeLocked);
  const pastRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  docRef.current = doc;
  activeNameRef.current = activeName;

  useEffect(() => {
    onDirtyChange?.(activeName, dirty);
    return () => {
      onDirtyChange?.(null, false);
    };
  }, [activeName, dirty, onDirtyChange]);
  hotkeysRef.current = hotkeys;
  libraryRef.current = library;
  selectedPathRef.current = selectedPath;
  activeLockedRef.current = activeLocked;

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const busy =
    engineState === "running" ||
    engineState === "paused" ||
    engineState === "stopping" ||
    recording;

  const refreshList = useCallback(async () => {
    const [list, qa] = await Promise.all([
      invoke<
        {
          name: string;
          actionCount: number;
          triggerKey?: string | null;
          triggerMods?: KeyMods | null;
          locked?: boolean;
        }[]
      >("list_macro_library"),
      invoke<QuickAccess>("get_quick_access").catch(() => null),
    ]);
    setLibrary(list);
    setLibraryRefreshKey((k) => k + 1);
    const active = activeNameRef.current;
    if (active) {
      const row = list.find((m) => m.name === active);
      setActiveLocked(Boolean(row?.locked));
    }
    if (qa) setFavoriteMacros(qa.favorites.macros);
    return list.map((i) => i.name);
  }, []);

  const applyLoaded = useCallback((loaded: MacroDocument, locked = false) => {
    setDoc(loaded);
    setActiveName(loaded.name);
    setActiveLocked(locked);
    writeLastMacro(loaded.name);
    setDirty(false);
    setSelectedPath(null);
    setActivePath(null);
    pastRef.current = [];
    futureRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
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
      } else if (!rec.recording) {
        /* keep last count until next start */
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistNow = useCallback(
    async (next: MacroDocument, id: string) => {
      setSaving(true);
      try {
        const saved = await invoke<MacroDocument>("save_saved_macro", {
          id,
          doc: { ...next, name: id },
        });
        setDoc(saved);
        setDirty(false);
        await refreshList();
      } finally {
        setSaving(false);
      }
    },
    [refreshList],
  );

  const scheduleAutosave = useCallback(
    (next: MacroDocument, id: string) => {
      if (autosaveTimer.current != null) {
        window.clearTimeout(autosaveTimer.current);
      }
      autosaveTimer.current = window.setTimeout(() => {
        autosaveTimer.current = null;
        void persistNow(next, id).catch((e) => {
          setTransportError(errMessage(e, "Enregistrement impossible."));
        });
      }, AUTOSAVE_MS);
    },
    [persistNow],
  );

  const pushDoc = useCallback(
    async (
      next: MacroDocument,
      opts?: { skipAutosave?: boolean; skipHistory?: boolean },
    ) => {
      if (activeLockedRef.current) return;
      if (!opts?.skipHistory) {
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
      setDirty(true);
      await invoke("set_macro", { doc: next });
      const id = activeNameRef.current;
      if (id && !opts?.skipAutosave) {
        scheduleAutosave(next, id);
      }
    },
    [scheduleAutosave, syncHistoryFlags],
  );

  const undo = useCallback(() => {
    if (activeLockedRef.current || pastRef.current.length === 0) return;
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
    void pushDoc(prev.doc, { skipHistory: true });
  }, [pushDoc, syncHistoryFlags]);

  const redo = useCallback(() => {
    if (activeLockedRef.current || futureRef.current.length === 0) return;
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
    void pushDoc(next.doc, { skipHistory: true });
  }, [pushDoc, syncHistoryFlags]);

  useEffect(() => {
    void (async () => {
      try {
        const list = await refreshList();
        const last = readLastMacro();
        const pick =
          (last && list.includes(last) ? last : null) ?? list[0] ?? null;
        if (pick) {
          const loaded = await invoke<MacroDocument>("load_saved_macro", {
            name: pick,
          });
          applyLoaded(loaded);
        } else {
          setDoc(emptyMacro());
          setActiveName(null);
          writeLastMacro(null);
          await invoke("clear_macro");
        }
      } catch (e) {
        setTransportError(errMessage(e, "Impossible de charger les macros."));
      } finally {
        setBootstrapped(true);
        await syncRecordState();
      }
    })();
    return () => {
      if (autosaveTimer.current != null) {
        window.clearTimeout(autosaveTimer.current);
      }
    };
  }, [applyLoaded, refreshList, syncRecordState]);

  useEffect(() => {
    if (!bootstrapped || !focusMacroName) return;
    void onSelectMacro(focusMacroName).finally(() => {
      onFocusMacroConsumed?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once when focusMacroName is set
  }, [bootstrapped, focusMacroName]);

  useEffect(() => {
    if (!bootstrapped) return;
    const name = sessionName?.trim();
    if (!name || name === activeNameRef.current) return;
    if (sessionKind !== "macro" && sessionKind !== "record") return;
    void (async () => {
      try {
        if (dirty && activeNameRef.current && activeNameRef.current !== name) {
          await persistNow(docRef.current, activeNameRef.current);
        }
        const loaded = await invoke<MacroDocument | null>("get_macro");
        if (loaded && loaded.name === name) {
          applyLoaded(loaded);
          return;
        }
        const fromDisk = await invoke<MacroDocument>("load_saved_macro", {
          name,
        });
        applyLoaded(fromDisk);
      } catch {
        /* engine may still be switching */
      }
    })();
  }, [applyLoaded, bootstrapped, dirty, persistNow, sessionKind, sessionName]);

  // Stable engine listeners — cancelled flag avoids StrictMode double-subscribe races.
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

      const recordUn = await listen<{ count: number }>(
        "engine://record",
        (e) => {
          setRecordCount(e.payload.count);
          setRecording(true);
        },
      );
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
    void syncRecordState();
  }, [engineState, syncRecordState]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void syncRecordState();
    }, 500);
    return () => window.clearInterval(id);
  }, [syncRecordState]);

  useEffect(() => {
    if (!capturingHotkey) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturingHotkey(false);
        return;
      }
      const vk = eventToVk(e);
      if (vk == null) return;
      setCapturingHotkey(false);
      void (async () => {
        try {
          const current =
            hotkeysRef.current ??
            (await invoke<HotkeyBindings>("get_hotkey_bindings"));
          const next = await invoke<HotkeyBindings>("set_hotkey_bindings", {
            bindings: { ...current, macroVk: vk },
          });
          onHotkeysChange?.(next);
          setTransportError(null);
        } catch (err) {
          setTransportError(
            errMessage(err, "Impossible de changer le raccourci macro."),
          );
        }
      })();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturingHotkey, onHotkeysChange]);

  useEffect(() => {
    void invoke<{ processFilter?: ProcessFilter }>("get_settings")
      .then((s) => setProcessFilter(s.processFilter ?? DEFAULT_PROCESS_FILTER))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!processFilter.enabled) {
      setForegroundExe(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const exe = await invoke<string | null>("get_foreground_exe");
        if (!cancelled) setForegroundExe(exe);
      } catch {
        if (!cancelled) setForegroundExe(null);
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 750);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [processFilter.enabled]);

  useEffect(() => {
    if (!capturingTrigger || !activeName) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturingTrigger(false);
        return;
      }
      const vk = eventToVk(e);
      if (vk == null) return;
      const mods = captureMods(e);
      setCapturingTrigger(false);
      const reserved = hotkeysRef.current;
      if (reserved && triggerConflictsWithReserved(vk, mods, reserved)) {
        setTransportError(
          "Raccourci réservé (clicker / global / urgence).",
        );
        return;
      }
      const clash = libraryRef.current.find((m) => {
        if (m.name === activeNameRef.current || !m.triggerKey) return false;
        const otherVk = Number(m.triggerKey);
        if (!Number.isFinite(otherVk)) return false;
        const otherTrigger: MacroTrigger = {
          type: "hotkey",
          key: String(otherVk),
          mods: m.triggerMods ?? undefined,
        };
        return hotkeyTriggerMatches(otherTrigger, vk, mods);
      });
      if (clash) {
        setTransportError(`Déjà utilisé par « ${clash.name} ».`);
        return;
      }
      const next: MacroDocument = {
        ...docRef.current,
        trigger: { type: "hotkey", key: String(vk), mods },
      };
      void pushDoc(next).catch((err) => {
        setTransportError(errMessage(err, "Raccourci macro impossible."));
      });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturingTrigger, activeName, pushDoc]);

  useEffect(() => {
    if (!activeName) return;
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeName, undo, redo]);

  async function onCreate() {
    setTransportError(null);
    try {
      if (dirty && activeName) {
        await persistNow(docRef.current, activeName);
      }
      const created = await invoke<MacroDocument>("create_saved_macro", {
        name: null,
      });
      await refreshList();
      applyLoaded(created);
    } catch (e) {
      setTransportError(errMessage(e, "Création impossible."));
    }
  }

  async function onSelectMacro(name: string) {
    if (name === activeName) return;
    setTransportError(null);
    try {
      if (dirty && activeName) {
        await persistNow(docRef.current, activeName);
      }
      const loaded = await invoke<MacroDocument>("load_saved_macro", { name });
      const row = libraryRef.current.find((m) => m.name === name);
      applyLoaded(loaded, Boolean(row?.locked));
    } catch (e) {
      setTransportError(errMessage(e, "Chargement impossible."));
    }
  }

  async function onDuplicate(name: string) {
    setTransportError(null);
    try {
      if (dirty && activeName === name) {
        await persistNow(docRef.current, name);
      }
      const copy = await invoke<MacroDocument>("duplicate_saved_macro", {
        name,
      });
      await refreshList();
      applyLoaded(copy);
    } catch (e) {
      setTransportError(errMessage(e, "Duplication impossible."));
    }
  }

  async function onDelete(name: string) {
    setTransportError(null);
    try {
      const ok = await confirmAction({
        title: "Supprimer la macro",
        message: `Supprimer « ${name} » ? Cette action est définitive.`,
      });
      if (!ok) return;
      if (autosaveTimer.current != null) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      const next = await invoke<MacroDocument | null>("delete_saved_macro", {
        name,
      });
      try {
        await invoke("set_quick_favorite", {
          kind: "macro",
          id: name,
          favorite: false,
        });
      } catch {
        /* ignore */
      }
      const list = await refreshList();
      if (next) {
        applyLoaded(next);
      } else if (list.length > 0) {
        const loaded = await invoke<MacroDocument>("load_saved_macro", {
          name: list[0],
        });
        applyLoaded(loaded);
      } else {
        setDoc(emptyMacro());
        setActiveName(null);
        writeLastMacro(null);
        setDirty(false);
        setSelectedPath(null);
      }
    } catch (e) {
      setTransportError(errMessage(e, "Suppression impossible."));
    }
  }

  async function onToggleFavorite(name: string) {
    const favorite = !favoriteMacros.includes(name);
    try {
      const qa = await invoke<QuickAccess>("set_quick_favorite", {
        kind: "macro",
        id: name,
        favorite,
      });
      setFavoriteMacros(qa.favorites.macros);
    } catch (e) {
      setTransportError(errMessage(e, "Favori impossible."));
    }
  }

  async function commitRename(rawName: string) {
    if (!activeName || activeLocked) return;
    const trimmed = rawName.trim();
    if (!trimmed || trimmed === activeName) {
      setDoc((d) => ({ ...d, name: activeName }));
      return;
    }
    setTransportError(null);
    try {
      if (dirty) {
        await persistNow({ ...docRef.current, name: activeName }, activeName);
      }
      const renamed = await invoke<MacroDocument>("rename_saved_macro", {
        from: activeName,
        to: trimmed,
      });
      await refreshList();
      applyLoaded(renamed);
    } catch (e) {
      setDoc((d) => ({ ...d, name: activeName }));
      setTransportError(errMessage(e, "Renommage impossible."));
    }
  }

  async function onSaveExplicit() {
    if (!activeName) return;
    setTransportError(null);
    try {
      if (autosaveTimer.current != null) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      await persistNow(doc, activeName);
    } catch (e) {
      setTransportError(errMessage(e, "Enregistrement impossible."));
    }
  }

  async function onPlay() {
    setTransportError(null);
    if (!activeName) {
      setTransportError("Crée ou sélectionne une macro.");
      return;
    }
    if (doc.actions.length === 0) {
      setTransportError("Macro vide — ajoute une action ou enregistre.");
      return;
    }
    try {
      if (dirty) await persistNow(doc, activeName);
      else await invoke("set_macro", { doc });
      const s = await invoke<EngineStatus>("run_macro");
      onStatus(s);
    } catch (e) {
      setTransportError(errMessage(e, "Impossible de lancer la macro."));
    }
  }

  async function onPause() {
    setTransportError(null);
    try {
      const s = await invoke<EngineStatus>("pause_macro");
      onStatus(s);
    } catch (e) {
      setTransportError(errMessage(e, "Impossible de mettre en pause."));
    }
  }

  async function onResume() {
    setTransportError(null);
    try {
      const s = await invoke<EngineStatus>("resume_macro");
      onStatus(s);
    } catch (e) {
      setTransportError(errMessage(e, "Impossible de reprendre."));
    }
  }

  async function onStop() {
    setTransportError(null);
    const wasRecording = recording;
    try {
      const s = await invoke<EngineStatus>("emergency_stop");
      onStatus(s);
    } catch {
      try {
        if (wasRecording) {
          await invoke<MacroDocument>("stop_record");
        }
      } catch {
        /* already stopped */
      }
      try {
        const s = await invoke<EngineStatus>("request_cancel");
        onStatus(s);
      } catch (e) {
        setTransportError(errMessage(e, "Impossible d’arrêter."));
      }
    } finally {
      setRecording(false);
      setActivePath(null);
      if (wasRecording && !activeLockedRef.current) {
        try {
          const loaded = await invoke<MacroDocument | null>("get_macro");
          if (loaded) {
            await pushDoc(loaded);
          }
        } catch {
          /* ignore */
        }
      }
      await syncRecordState();
    }
  }

  async function onStartRecord() {
    setTransportError(null);
    if (!activeName) {
      setTransportError("Crée une macro avant d’enregistrer.");
      return;
    }
    if (activeLocked) {
      setTransportError("Macro verrouillée — enregistrement impossible.");
      return;
    }
    try {
      let replace = false;
      if (doc.actions.length > 0) {
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
      await invoke("set_macro", { doc });
      await invoke("start_record", {
        args: {
          replace,
          mouseOnly: recordMouseOnly,
          keyboardOnly: recordKeyboardOnly,
        },
      });
      setRecording(true);
      setRecordPaused(false);
      setRecordCount(0);
    } catch (e) {
      setRecording(false);
      setTransportError(errMessage(e, "Impossible de démarrer l’enregistrement."));
      await syncRecordState();
    }
  }

  async function onPauseRecord() {
    try {
      const rec = await invoke<{ paused?: boolean; actionCount?: number }>(
        "pause_record",
      );
      setRecordPaused(!!rec.paused);
      if (typeof rec.actionCount === "number") setRecordCount(rec.actionCount);
    } catch (e) {
      setTransportError(errMessage(e, "Pause capture impossible."));
    }
  }

  async function onResumeRecord() {
    try {
      const rec = await invoke<{ paused?: boolean; actionCount?: number }>(
        "resume_record",
      );
      setRecordPaused(!!rec.paused);
      if (typeof rec.actionCount === "number") setRecordCount(rec.actionCount);
    } catch (e) {
      setTransportError(errMessage(e, "Reprise capture impossible."));
    }
  }

  async function onStopRecord() {
    setTransportError(null);
    try {
      const next = await invoke<MacroDocument>("stop_record");
      setRecording(false);
      setSelectedPath(null);
      selectedPathRef.current = null;
      await pushDoc(next);
      await refreshList();
    } catch (e) {
      setRecording(false);
      setTransportError(errMessage(e, "Enregistrement déjà arrêté."));
      await syncRecordState();
      try {
        const loaded = await invoke<MacroDocument | null>("get_macro");
        if (loaded) {
          await pushDoc(loaded);
        }
      } catch {
        /* ignore */
      }
    }
  }

  async function onImport() {
    setTransportError(null);
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "Macro", extensions: ["json", "macro.json"] }],
      });
      if (!path || Array.isArray(path)) return;
      const loaded = await invoke<MacroDocument>("import_macro_path", { path });
      const created = await invoke<MacroDocument>("create_saved_macro", {
        name: loaded.name || "Import",
      });
      const merged = { ...loaded, name: created.name, schemaVersion: 6 };
      const saved = await invoke<MacroDocument>("save_saved_macro", {
        id: created.name,
        doc: merged,
      });
      await refreshList();
      applyLoaded(saved);
    } catch (e) {
      setTransportError(errMessage(e, "Import impossible."));
    }
  }

  async function onExport() {
    setTransportError(null);
    try {
      await invoke("set_macro", { doc });
      const path = await save({
        filters: [{ name: "Macro", extensions: ["macro.json"] }],
        defaultPath: `${doc.name.replace(/\s+/g, "-").toLowerCase()}.macro.json`,
      });
      if (!path) return;
      await invoke("export_macro_path", { path });
    } catch (e) {
      setTransportError(errMessage(e, "Export impossible."));
    }
  }

  async function onPreset(name: string) {
    setTransportError(null);
    try {
      const loaded = await invoke<MacroDocument>("load_preset_macro", { name });
      const created = await invoke<MacroDocument>("create_saved_macro", {
        name: loaded.name || name,
      });
      const merged = { ...loaded, name: created.name, schemaVersion: 6 };
      const saved = await invoke<MacroDocument>("save_saved_macro", {
        id: created.name,
        doc: merged,
      });
      await refreshList();
      applyLoaded(saved);
    } catch (e) {
      setTransportError(errMessage(e, "Preset introuvable."));
    }
  }

  function addAction(kind: MacroAction["type"]) {
    if (!activeName) {
      setTransportError("Crée une macro avant d’ajouter des actions.");
      return;
    }
    if (activeLocked) return;
    const action = makeAction(kind);
    const next = {
      ...doc,
      schemaVersion: 6,
      actions: [...doc.actions, action],
    };
    void pushDoc(next);
    setSelectedPath([next.actions.length - 1]);
  }

  function updateSelected(action: MacroAction) {
    if (!selectedPath || activeLocked) return;
    void pushDoc({
      ...doc,
      schemaVersion: 6,
      actions: updateAtPath(doc.actions, selectedPath, action),
    });
  }

  function remove(path: ActionPath) {
    if (activeLocked) return;
    void pushDoc({
      ...doc,
      actions: removeAtPath(doc.actions, path),
    });
    setSelectedPath(null);
  }

  function onListReorder(fromPath: ActionPath, toPath: ActionPath) {
    if (activeLocked) return;
    void pushDoc({
      ...doc,
      actions: reorderAtPath(doc.actions, fromPath, toPath),
    });
  }

  function addToBranch(branch: "then" | "else", kind: MacroAction["type"]) {
    if (!selectedPath || activeLocked) return;
    const selected = getAtPath(doc.actions, selectedPath);
    if (!selected || selected.type !== "control.if") return;
    const child = makeAction(kind);
    const actions = appendChild(doc.actions, selectedPath, branch, child);
    const branchIdx = branch === "then" ? 0 : 1;
    const list = branch === "then" ? selected.then : selected.else ?? [];
    void pushDoc({ ...doc, schemaVersion: 6, actions });
    setSelectedPath([...selectedPath, branchIdx, list.length]);
  }

  useEffect(() => {
    if (!activeLocked) return;
    setCapturingHotkey(false);
    setCapturingTrigger(false);
  }, [activeLocked]);

  const selectedAction = selectedPath
    ? getAtPath(doc.actions, selectedPath)
    : null;

  const editorDisabled = busy || !activeName || activeLocked;

  const processFilterBlocked =
    processFilter.enabled &&
    foregroundExe != null &&
    !processFilterAllows(processFilter, foregroundExe);

  const docTriggerLabel =
    doc.trigger &&
    typeof doc.trigger === "object" &&
    doc.trigger.type === "hotkey"
      ? triggerHotkeyLabel(doc.trigger)
      : null;

  return (
    <section className="macro-workspace workspace-panel">
      <div className="macro-layout">
        <LibrarySidebar
          kind="macro"
          title="Bibliothèque"
          subtitle="Macros"
          activeId={activeName}
          favoriteIds={favoriteMacros}
          dirtyId={dirty ? activeName : null}
          disabled={busy || !bootstrapped}
          refreshKey={libraryRefreshKey}
          onSelect={(n) => void onSelectMacro(n)}
          onCreate={() => void onCreate()}
          onDuplicate={(n) => void onDuplicate(n)}
          onDelete={(n) => void onDelete(n)}
          onToggleFavorite={(n) => void onToggleFavorite(n)}
          onRenameRequest={(n) => {
            if (n === activeName) {
              const el = document.querySelector<HTMLInputElement>(
                ".macro-toolbar-name",
              );
              el?.focus();
              el?.select();
            } else {
              void onSelectMacro(n).then(() => {
                window.setTimeout(() => {
                  const el = document.querySelector<HTMLInputElement>(
                    ".macro-toolbar-name",
                  );
                  el?.focus();
                  el?.select();
                }, 0);
              });
            }
          }}
        />

        <div className="macro-editor">
          {!activeName ? (
            <EmptyState
              icon={Icons.macros}
              title="Aucune macro"
              lead="Crée une macro pour capturer des gestes ou construire une séquence."
              actions={
                <button
                  type="button"
                  className="primary"
                  disabled={!bootstrapped || busy}
                  onClick={() => void onCreate()}
                >
                  + Nouvelle macro
                </button>
              }
            />
          ) : (
            <>
              <div className="macro-toolbar ui-toolbar">
                <input
                  className="seq-name macro-toolbar-name"
                  value={doc.name}
                  disabled={busy || activeLocked}
                  aria-label="Nom de la macro"
                  onChange={(e) =>
                    setDoc((d) => ({ ...d, name: e.target.value }))
                  }
                  onBlur={(e) => void commitRename(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                  }}
                />
                {activeLocked ? (
                  <span className="library-lock" title="Macro verrouillée">
                    Verrouillée
                  </span>
                ) : null}
                {processFilter.enabled ? (
                  <span
                    title={
                      processFilterBlocked
                        ? `Filtre processus actif — « ${foregroundExe ?? "?"} » bloqué (${processFilter.mode === "allow" ? "autoriser" : "bloquer"})`
                        : "Filtre processus actif — premier plan autorisé"
                    }
                  >
                    <Badge
                      className={
                        processFilterBlocked ? "macro-filter-blocked" : "macro-filter-ok"
                      }
                    >
                      {processFilterBlocked ? "Filtre · bloqué" : "Filtre · OK"}
                    </Badge>
                  </span>
                ) : null}
                <div className="macro-hotkey-group">
                  {docTriggerLabel ? (
                    <button
                      type="button"
                      className={`macro-toolbar-hotkey-btn${capturingTrigger ? " is-capturing" : ""}`}
                      disabled={busy || activeLocked}
                      title="Raccourci de cette macro — clic pour modifier, clic droit pour retirer"
                      aria-label={
                        capturingTrigger
                          ? "Appuie sur une touche, Échap pour annuler"
                          : `Raccourci macro ${docTriggerLabel}`
                      }
                      onClick={() => {
                        setCapturingHotkey(false);
                        setCapturingTrigger((v) => !v);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (busy || activeLocked) return;
                        void pushDoc({
                          ...doc,
                          trigger: { type: "manual" },
                        });
                      }}
                    >
                      <span className="macro-hotkey-tag">Macro</span>
                      <KbdChip className="macro-toolbar-hotkey">
                        {capturingTrigger ? "…" : docTriggerLabel}
                      </KbdChip>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`macro-toolbar-hotkey-btn${capturingHotkey || capturingTrigger ? " is-capturing" : ""}`}
                      disabled={busy || activeLocked}
                      title="Raccourci app (fallback) — clic pour modifier. Clic droit = raccourci de cette macro."
                      aria-label={
                        capturingHotkey
                          ? "Appuie sur une touche, Échap pour annuler"
                          : capturingTrigger
                            ? "Appuie sur une touche pour le raccourci macro"
                            : `Raccourci app ${macroHotkeyLabel}`
                      }
                      onClick={() => {
                        setCapturingTrigger(false);
                        setCapturingHotkey((v) => !v);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (busy || activeLocked) return;
                        setCapturingHotkey(false);
                        setCapturingTrigger(true);
                      }}
                    >
                      <span className="macro-hotkey-tag">App</span>
                      <KbdChip className="macro-toolbar-hotkey">
                        {capturingHotkey || capturingTrigger
                          ? "…"
                          : hotkeys
                            ? vkLabel(hotkeys.macroVk)
                            : macroHotkeyLabel}
                      </KbdChip>
                    </button>
                  )}
                </div>
                <span className="ui-toolbar-spacer" />
                <div className="macro-toolbar-actions actions wrap">
                  <div className="macro-history-btns">
                    <button
                      type="button"
                      className="ghost tiny"
                      disabled={!canUndo || busy || activeLocked}
                      title="Annuler (Ctrl+Z)"
                      aria-label="Annuler"
                      onClick={() => undo()}
                    >
                      ↶
                    </button>
                    <button
                      type="button"
                      className="ghost tiny"
                      disabled={!canRedo || busy || activeLocked}
                      title="Rétablir (Ctrl+Y)"
                      aria-label="Rétablir"
                      onClick={() => redo()}
                    >
                      ↷
                    </button>
                  </div>
                  {dirty || saving ? (
                    <button
                      type="button"
                      className="ghost"
                      disabled={!dirty || busy || saving || activeLocked}
                      onClick={() => void onSaveExplicit()}
                    >
                      {saving ? "…" : "Sauver"}
                    </button>
                  ) : null}
                  {engineState === "running" ? (
                    <button
                      type="button"
                      disabled={recording}
                      onClick={() => void onPause()}
                    >
                      Pause
                    </button>
                  ) : null}
                  {engineState === "paused" ? (
                    <button type="button" onClick={() => void onResume()}>
                      Reprendre
                    </button>
                  ) : null}
                  {engineState === "running" ||
                  engineState === "paused" ||
                  engineState === "stopping" ||
                  recording ? (
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void onStop()}
                    >
                      Arrêter
                    </button>
                  ) : null}
                  <label className="field macro-toolbar-repeat">
                    <span>× </span>
                    <input
                      type="number"
                      min={0}
                      value={doc.repeatCount}
                      disabled={busy || activeLocked}
                      title="Répétitions (0 = infini)"
                      aria-label="Répétitions"
                      onChange={(e) =>
                        void pushDoc({
                          ...doc,
                          repeatCount: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <AddMenu
                    label="⋯"
                    disabled={busy || activeLocked}
                    items={[
                      {
                        id: "play",
                        label: "Jouer",
                        onSelect: () => void onPlay(),
                      },
                      {
                        id: "hk-app",
                        label: "Raccourci app…",
                        onSelect: () => {
                          setCapturingTrigger(false);
                          setCapturingHotkey(true);
                        },
                      },
                      {
                        id: "hk-macro",
                        label: "Raccourci macro…",
                        onSelect: () => {
                          setCapturingHotkey(false);
                          setCapturingTrigger(true);
                        },
                      },
                      ...(docTriggerLabel
                        ? [
                            {
                              id: "hk-clear",
                              label: "Retirer raccourci macro",
                              onSelect: () => {
                                void pushDoc({
                                  ...doc,
                                  trigger: { type: "manual" },
                                });
                              },
                            },
                          ]
                        : []),
                      {
                        id: "preset-click",
                        label: "Preset click-delay",
                        onSelect: () => void onPreset("click-delay"),
                      },
                      {
                        id: "preset-echo",
                        label: "Preset process-echo",
                        onSelect: () => void onPreset("process-echo"),
                      },
                      {
                        id: "import",
                        label: "Importer…",
                        onSelect: () => void onImport(),
                      },
                      {
                        id: "export",
                        label: "Exporter…",
                        onSelect: () => void onExport(),
                      },
                    ]}
                  />
                </div>
              </div>
              {transportError ? (
                <p className="hint danger-text" role="alert" aria-live="assertive">
                  {transportError}
                </p>
              ) : null}
              {processFilterBlocked ? (
                <p className="hint macro-filter-hint" role="status">
                  Filtre processus actif — la macro attendra un premier plan autorisé
                  ({processFilter.mode === "allow" ? "liste blanche" : "liste noire"}).
                </p>
              ) : null}
              <div className="sr-only" aria-live="polite">
                {recording
                  ? `Capture en cours — ${recordCount} événement${recordCount === 1 ? "" : "s"}`
                  : ""}
              </div>

              <Card className="macro-canvas">
                <div className="seq-header">
                  <div className="actions wrap seq-toolbar">
                    {!recording ? (
                      <button
                        type="button"
                        className="ghost"
                        disabled={
                          editorDisabled ||
                          engineState === "running" ||
                          engineState === "paused"
                        }
                        title="Capturer des gestes à l’écran"
                        onClick={() => void onStartRecord()}
                      >
                        Capturer
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            void (recordPaused
                              ? onResumeRecord()
                              : onPauseRecord())
                          }
                        >
                          {recordPaused ? "Reprendre" : "Pause"}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void onStopRecord()}
                        >
                          Stop ({recordCount})
                        </button>
                      </>
                    )}
                    {recording ? (
                      <span className="record-filters">
                        <label className="hint">
                          <input
                            type="checkbox"
                            checked={recordMouseOnly}
                            disabled
                          />{" "}
                          Souris seule
                        </label>
                        <label className="hint">
                          <input
                            type="checkbox"
                            checked={recordKeyboardOnly}
                            disabled
                          />{" "}
                          Clavier seul
                        </label>
                      </span>
                    ) : (
                      <span className="record-filters">
                        <label className="hint">
                          <input
                            type="checkbox"
                            checked={recordMouseOnly}
                            onChange={(e) => {
                              setRecordMouseOnly(e.target.checked);
                              if (e.target.checked) setRecordKeyboardOnly(false);
                            }}
                          />{" "}
                          Souris seule
                        </label>
                        <label className="hint">
                          <input
                            type="checkbox"
                            checked={recordKeyboardOnly}
                            onChange={(e) => {
                              setRecordKeyboardOnly(e.target.checked);
                              if (e.target.checked) setRecordMouseOnly(false);
                            }}
                          />{" "}
                          Clavier seul
                        </label>
                      </span>
                    )}
                    <AddMenu
                      label="+ Ajouter"
                      disabled={editorDisabled}
                      items={buildActionAddMenu(addAction)}
                    />
                  </div>
                </div>

                <div className="macro-canvas-body">
                  {doc.actions.length === 0 ? (
                    <EmptyState
                      icon={Icons.macros}
                      title="Macro vide"
                      lead="Capture des gestes ou ajoute une action pour commencer."
                      actions={
                        <>
                          <button
                            type="button"
                            className="primary"
                            disabled={busy || activeLocked}
                            onClick={() => void onStartRecord()}
                          >
                            Capturer des gestes
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            disabled={busy || activeLocked}
                            onClick={() => addAction("mouse.click")}
                          >
                            + Clic
                          </button>
                        </>
                      }
                    />
                  ) : (
                    <div className="macro-seq-split">
                      <div className="macro-seq-main">
                        <ActionList
                          actions={doc.actions}
                          selectedPath={selectedPath}
                          activePath={activePath}
                          disabled={busy}
                          readOnly={activeLocked}
                          onSelect={setSelectedPath}
                          onReorder={onListReorder}
                          onRemove={remove}
                          onChangeAction={(path, a) => {
                            void pushDoc({
                              ...doc,
                              schemaVersion: 6,
                              actions: updateAtPath(doc.actions, path, a),
                            });
                          }}
                          branchAddMenuItems={(branch) =>
                            buildActionAddMenu((kind) => addToBranch(branch, kind))
                          }
                        />
                      </div>
                      <aside className="macro-props-panel" aria-label="Propriétés">
                        <div className="macro-props-head">
                          <span className="v2-meta-label">Propriétés</span>
                          {selectedAction ? (
                            <p className="macro-props-title">
                              <strong>{actionTitleFr(selectedAction.type)}</strong>
                              <span>{actionDetailFr(selectedAction)}</span>
                            </p>
                          ) : (
                            <p className="hint">
                              Sélectionne une action dans la liste.
                            </p>
                          )}
                        </div>
                        {activeLocked ? (
                          <p className="ui-alert" role="status">
                            Macro verrouillée — lecture seule.
                          </p>
                        ) : null}
                        <ActionProps
                          action={selectedAction}
                          disabled={editorDisabled}
                          onChange={updateSelected}
                          branchAddMenuItems={(branch) =>
                            buildActionAddMenu((kind) => addToBranch(branch, kind))
                          }
                        />
                      </aside>
                    </div>
                  )}
                </div>
              </Card>
            </>
          )}
          {!activeName && transportError ? (
            <p className="hint danger-text" role="alert">
              {transportError}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
