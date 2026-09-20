import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AutomationsTable } from "../automations/AutomationsTable";
import { useAutomationsPageState } from "../automations/useAutomationsPageState";
import type { ScriptDoc } from "../scripts/types";
import { newScriptId } from "../scripts/newScriptId";
import {
  type EngineStatus,
  type HotkeyBindings,
} from "../macros/types";
import {
  mergeAccueilPrefs,
  mergeAutomationPrefs,
  mergeScriptsPrefs,
  mergeShellPrefs,
  type AccueilPrefs,
  type AutomationPrefs,
  type ScriptsPrefs,
  type ShellPrefs,
} from "../settings/settingsTypes";
import { RunJournalDock } from "../runs/RunJournalDock";
import { useEngineLog } from "../runs/useEngineLog";
import {
  AppShell,
  CommandPalette,
  ToastProvider,
  useToast,
  WindowTitleBar,
  type BarContextAction,
  type CommandItem,
  type DocumentTabItem,
  type StatusKind,
  type TabContextAction,
} from "../ui/shell";
import { TitleBarProvider, useTitleBarContext } from "../ui/shell/TitleBarContext";
import {
  ConfirmHost,
  askScriptLanguage,
  confirmAction,
  confirmChoice,
  PromptHost,
  promptAction,
  ScriptLanguageHost,
} from "../ui";
import { applyTheme, readStoredTheme, subscribeSystemTheme, type ThemeMode } from "../theme";
import { stateLabel, sessionLabel } from "../ui/labels";
import { LocaleProvider, useLocale, useT } from "../i18n";
import { loadLastStudio, pushRecent, saveLastStudio } from "./recent";
import type { SettingsSection } from "./types";
import type { AppSettings } from "../clicker/clickerTypes";
import { DEFAULT_CLICKER } from "../clicker/clickerTypes";
import { defaultScriptSource } from "../scripts/defaultSources";
import {
  loadClickerStudio,
  loadMacroEditor,
  loadScriptEditor,
  loadSettingsView,
  prefetchEditor,
} from "./lazyEditors";
import {
  HOME_TAB_ID,
  activeDocTab,
  closeAllDocTabs,
  closeDocTab,
  closeDocTabsToRight,
  closeOtherDocTabs,
  docTabId,
  loadWorkspace,
  nextDocTabId,
  openDocTab,
  openSettings,
  persistWorkspace,
  prevDocTabId,
  renameDocTab,
  reorderDocTabs,
  selectDocTab,
  selectHome,
  setTabDirty,
  setTabLabel,
  sortTabsForDisplay,
  tabsClosedBy,
  titleBarHighlightTabId,
  toggleTabPin,
  type DocTabKind,
  type WorkspaceState,
} from "./workspaces";

const MacroEditorView = lazy(async () => {
  const m = await loadMacroEditor();
  return { default: m.MacroEditorView };
});
const ScriptEditorView = lazy(async () => {
  const m = await loadScriptEditor();
  return { default: m.ScriptEditorView };
});
const ClickerStudio = lazy(async () => {
  const m = await loadClickerStudio();
  return { default: m.ClickerStudio };
});
const SettingsView = lazy(async () => {
  const m = await loadSettingsView();
  return { default: m.SettingsView };
});

function EditorSuspenseFallback() {
  return <div className="caster-editor-suspense" aria-busy="true" />;
}

const JOURNAL_OPEN_KEY = "caster-journal-open";
const LEGACY_JOURNAL_OPEN_KEY = "v2-journal-open";

function readJournalOpen(): boolean {
  try {
    const raw =
      localStorage.getItem(JOURNAL_OPEN_KEY) ??
      localStorage.getItem(LEGACY_JOURNAL_OPEN_KEY);
    if (raw != null && localStorage.getItem(JOURNAL_OPEN_KEY) == null) {
      localStorage.setItem(JOURNAL_OPEN_KEY, raw);
    }
    return raw === "true";
  } catch {
    return false;
  }
}

const DEFAULT_HOTKEYS: HotkeyBindings = {
  actionVk: 0x75,
  actionCtrl: false,
  actionAlt: false,
  actionShift: false,
  macroVk: 0x78,
  emergencyVk: 0x77,
};

function launchErr(e: unknown, fallback: string): string {
  if (typeof e === "string" && e.trim()) return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

function playFinishBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    window.setTimeout(() => void ctx.close(), 200);
  } catch {
    /* ignore */
  }
}

export function MainApp() {
  const [uiLocalePref, setUiLocalePref] = useState(() => mergeShellPrefs().uiLocale);
  return (
    <TitleBarProvider>
      <LocaleProvider
        preference={uiLocalePref}
        onPreferenceChange={setUiLocalePref}
      >
        <ToastProvider>
          <MainAppInner onUiLocalePrefChange={setUiLocalePref} />
        </ToastProvider>
      </LocaleProvider>
    </TitleBarProvider>
  );
}

function MainAppInner({
  onUiLocalePrefChange,
}: {
  onUiLocalePrefChange: (pref: ShellPrefs["uiLocale"]) => void;
}) {
  const toast = useToast();
  const t = useT();
  const { locale } = useLocale();
  const titleBarCtx = useTitleBarContext();
  const automationsPage = useAutomationsPageState();
  const [shellPrefs, setShellPrefs] = useState<ShellPrefs>(() => mergeShellPrefs());
  const [automationPrefs, setAutomationPrefs] = useState<AutomationPrefs>(() =>
    mergeAutomationPrefs(),
  );
  const [scriptsPrefs, setScriptsPrefs] = useState<ScriptsPrefs>(() =>
    mergeScriptsPrefs(),
  );
  const [accueilPrefs, setAccueilPrefs] = useState<AccueilPrefs>(() =>
    mergeAccueilPrefs(),
  );
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => loadWorkspace());
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme());
  const [advanced, setAdvanced] = useState(false);
  const [hotkeys, setHotkeys] = useState<HotkeyBindings>(DEFAULT_HOTKEYS);
  const [status, setStatus] = useState<EngineStatus>({
    state: "idle",
    cancelled: false,
    message: null,
  });
  const prevEngineState = useRef(status.state);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("application");
  const [refreshKey, setRefreshKey] = useState(0);
  const { lines: journalLines, clear: clearJournal } = useEngineLog();
  const [journalOpen, setJournalOpen] = useState(readJournalOpen);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const running = status.state === "running" || status.state === "paused";
  const activeDoc = activeDocTab(workspace);
  const settingsActive = workspace.shellView.type === "settings";

  const refresh = useCallback(async () => {
    const next = await invoke<EngineStatus>("get_engine_state");
    setStatus(next);
  }, []);

  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const [docRemountKey, setDocRemountKey] = useState(0);

  const onThemeChange = useCallback((next: ThemeMode) => {
    setTheme(next);
    applyTheme(next);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    return subscribeSystemTheme(theme, () => applyTheme("system"));
  }, [theme]);

  useEffect(() => {
    persistWorkspace(workspace);
  }, [workspace]);

  useEffect(() => {
    void refresh();
    let un: (() => void) | undefined;
    void listen("engine://status", () => void refresh()).then((fn) => {
      un = fn;
    });
    const t = window.setInterval(() => void refresh(), 400);
    return () => {
      un?.();
      window.clearInterval(t);
    };
  }, [refresh]);

  useEffect(() => {
    void invoke<AppSettings>("get_settings")
      .then((s) => {
        if (typeof s.advancedUi === "boolean") setAdvanced(s.advancedUi);
        if (s.theme === "dark" || s.theme === "light" || s.theme === "system") {
          onThemeChange(s.theme);
        }
        if (typeof s.journalOpen === "boolean") setJournalOpen(s.journalOpen);
        const sh = mergeShellPrefs(s.shell);
        setShellPrefs(sh);
        onUiLocalePrefChange(sh.uiLocale);
        setAutomationPrefs(mergeAutomationPrefs(s.automation));
        setScriptsPrefs(mergeScriptsPrefs(s.scripts));
        setAccueilPrefs(mergeAccueilPrefs(s.accueil));
        if (!sh.restoreWorkspaceTabs) {
          setWorkspace((ws) => selectHome({ ...ws, tabs: [] }));
        } else if (sh.startupView === "lastDocument") {
          const last = loadLastStudio();
          if (last) {
            setWorkspace((ws) =>
              openDocTab(ws, last.kind, last.id, last.id),
            );
          }
        }
      })
      .catch(() => undefined);
    void invoke<HotkeyBindings>("get_hotkey_bindings")
      .then(setHotkeys)
      .catch(() => undefined);
  }, [onThemeChange]);

  const persistShell = useCallback(async (partial: Partial<AppSettings>) => {
    try {
      const current = await invoke<AppSettings>("get_settings");
      await invoke("save_app_settings", { settings: { ...current, ...partial } });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const prev = prevEngineState.current;
    prevEngineState.current = status.state;
    const wasActive = prev === "running" || prev === "paused";
    if (wasActive && status.state === "idle") {
      if (shellPrefs.toastOnFinish) {
        toast.success(t("shell.sessionEnded"));
      }
      if (automationPrefs.soundOnFinish) {
        playFinishBeep();
      }
    }
    if (prev !== "running" && status.state === "running" && automationPrefs.focusFollowsRun) {
      setJournalOpen(true);
      void persistShell({ journalOpen: true });
    }
  }, [
    automationPrefs.focusFollowsRun,
    automationPrefs.soundOnFinish,
    persistShell,
    shellPrefs.toastOnFinish,
    status.state,
    t,
    toast,
  ]);

  useEffect(() => {
    let un: (() => void) | undefined;
    void listen("app://confirm-quit", () => {
      void (async () => {
        const ok = await confirmAction({
          title: t("shell.quitTitle"),
          message: t("shell.quitMessage"),
          confirmLabel: t("shell.quitConfirm"),
          danger: true,
        });
        if (ok) void invoke("confirm_app_exit");
      })();
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, [t]);

  const rememberLastRun = useCallback(
    async (kind: "macro" | "clicker", id: string) => {
      try {
        const current = await invoke<AppSettings>("get_settings");
        const nextShell = mergeShellPrefs({
          ...current.shell,
          ...(kind === "clicker" ? { lastClickerId: id } : { lastMacroId: id }),
        });
        setShellPrefs(nextShell);
        await invoke("save_app_settings", {
          settings: { ...current, shell: nextShell },
        });
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const openJournalOnRun = useCallback(() => {
    if (!automationPrefs.focusFollowsRun) return;
    setJournalOpen(true);
    void persistShell({ journalOpen: true });
  }, [automationPrefs.focusFollowsRun, persistShell]);

  const onEmergencyStop = useCallback(async () => {
    void invoke<EngineStatus>("emergency_stop")
      .then((s) => {
        setStatus(s);
        toast.info(t("shell.sessionStopped"));
        if (shellPrefs.goHomeAfterEmergency) {
          setWorkspace((ws) => selectHome(ws));
        }
      })
      .catch(() =>
        void invoke<EngineStatus>("request_cancel")
          .then((s) => {
            setStatus(s);
            toast.info(t("shell.cancelRequested"));
            if (shellPrefs.goHomeAfterEmergency) {
              setWorkspace((ws) => selectHome(ws));
            }
          })
          .catch((e) => toast.error(launchErr(e, t("shell.cannotStop")))),
      );
  }, [shellPrefs.goHomeAfterEmergency, t, toast]);

  const openDoc = useCallback(
    (kind: DocTabKind, resourceId: string, label?: string) => {
      prefetchEditor(kind);
      setWorkspace((ws) => {
        const next = openDocTab(ws, kind, resourceId, label ?? resourceId);
        if (kind === "macro" || kind === "clicker") {
          pushRecent({ id: resourceId, kind, label: label ?? resourceId });
          saveLastStudio({ id: resourceId, kind });
          void rememberLastRun(kind, resourceId);
        }
        return next;
      });
    },
    [rememberLastRun],
  );

  const goHome = useCallback(() => {
    setWorkspace((ws) => selectHome(ws));
  }, []);

  const goSettings = useCallback((section: SettingsSection = "application") => {
    setSettingsSection(section);
    setWorkspace((ws) => openSettings(ws, section));
  }, []);

  const onTabSelect = useCallback((tabId: string) => {
    if (tabId === HOME_TAB_ID) {
      // Accueil stays mounted — no forced remount refresh (avoids empty flash).
      goHome();
      return;
    }
    const activeId =
      workspace.shellView.type === "doc" ? workspace.shellView.tabId : null;
    if (activeId === tabId) {
      setDocRemountKey((k) => k + 1);
    }
    setWorkspace((ws) => selectDocTab(ws, tabId));
  }, [goHome, workspace.shellView]);

  const onTabClose = useCallback(
    async (tabId: string) => {
      const tab = workspace.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      if (tab.pinned) {
        toast.info(t("shell.pinnedTab"));
        return;
      }
      if (tab.dirty) {
        const ok = await confirmAction({
          title: t("shell.closeTitle"),
          message: t("shell.closeDirty", { label: tab.label }),
          confirmLabel: t("shell.closeConfirm"),
          danger: true,
        });
        if (!ok) return;
      }
      setWorkspace((ws) => closeDocTab(ws, tabId));
    },
    [t, toast, workspace.tabs],
  );

  const applyBatchTabClose = useCallback(
    async (apply: (ws: WorkspaceState) => WorkspaceState) => {
      const closing = tabsClosedBy(workspace, apply(workspace));
      if (closing.length === 0) return;
      const dirty = closing.filter((t) => t.dirty);
      if (dirty.length > 0) {
        const message =
          dirty.length === 1
            ? t("shell.closeDirty", { label: dirty[0]!.label })
            : t("shell.closeDirtyMany", {
                n: dirty.length,
                names: dirty.map((tab) => tab.label).join(", "),
              });
        const ok = await confirmAction({
          title: t("shell.closeTitle"),
          message,
          confirmLabel: t("shell.closeConfirm"),
          danger: true,
        });
        if (!ok) return;
      }
      setWorkspace(apply);
    },
    [t, workspace],
  );

  const onTabContextAction = useCallback(
    async (tabId: string, action: TabContextAction) => {
      const tab = workspace.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      switch (action) {
        case "close":
          await onTabClose(tabId);
          return;
        case "closeOthers":
          await applyBatchTabClose((ws) => closeOtherDocTabs(ws, tabId));
          return;
        case "closeToRight":
          await applyBatchTabClose((ws) => closeDocTabsToRight(ws, tabId));
          return;
        case "pin":
        case "unpin":
          setWorkspace((ws) => toggleTabPin(ws, tabId));
          return;
        case "duplicate":
          try {
            if (tab.kind === "macro") {
              const copy = await invoke<{ name: string }>("duplicate_saved_macro", {
                name: tab.resourceId,
              });
              bumpRefresh();
              toast.success(t("shell.macroDuplicated", { name: copy.name }));
              openDoc("macro", copy.name);
            } else if (tab.kind === "clicker") {
              const copy = await invoke<{ name: string }>("duplicate_clicker_preset", {
                name: tab.resourceId,
              });
              bumpRefresh();
              toast.success(t("shell.presetDuplicated", { name: copy.name }));
              openDoc("clicker", copy.name);
            } else {
              const src = await invoke<ScriptDoc>("load_script_cmd", {
                id: tab.resourceId,
              });
              const copy: ScriptDoc = {
                ...src,
                id: newScriptId(),
                name: `${src.name}${t("shell.copySuffix")}`,
              };
              await invoke("save_script_cmd", { doc: copy });
              bumpRefresh();
              toast.success(t("shell.scriptDuplicated", { name: copy.name }));
              openDoc("script", copy.id, copy.name);
            }
          } catch (e) {
            toast.error(launchErr(e, t("shell.duplicateFailed")));
          }
          return;
        case "rename": {
          if (tab.dirty) {
            const ok = await confirmAction({
              title: t("shell.renameTitle"),
              message: t("shell.renameDirty", { label: tab.label }),
              confirmLabel: t("shell.renameConfirm"),
            });
            if (!ok) return;
          }
          const nextName = await promptAction({
            title: t("shell.renameTitle"),
            defaultValue: tab.kind === "script" ? tab.label : tab.resourceId,
            confirmLabel: t("shell.renameConfirm"),
            placeholder: t("shell.renamePlaceholder"),
          });
          if (!nextName || nextName === tab.resourceId || nextName === tab.label) return;
          try {
            if (tab.kind === "macro") {
              const doc = await invoke<{ name: string }>("rename_saved_macro", {
                from: tab.resourceId,
                to: nextName,
              });
              bumpRefresh();
              setWorkspace((ws) => renameDocTab(ws, tabId, doc.name, doc.name));
              toast.success(t("shell.macroRenamed", { name: doc.name }));
            } else if (tab.kind === "clicker") {
              const preset = await invoke<{ name: string }>("rename_clicker_preset", {
                from: tab.resourceId,
                to: nextName,
              });
              bumpRefresh();
              setWorkspace((ws) => renameDocTab(ws, tabId, preset.name, preset.name));
              toast.success(t("shell.presetRenamed", { name: preset.name }));
            } else {
              const src = await invoke<ScriptDoc>("load_script_cmd", {
                id: tab.resourceId,
              });
              const updated = { ...src, name: nextName };
              await invoke("save_script_cmd", { doc: updated });
              bumpRefresh();
              setWorkspace((ws) => setTabLabel(ws, tabId, nextName));
              toast.success(t("shell.scriptRenamed", { name: nextName }));
            }
          } catch (e) {
            toast.error(launchErr(e, t("shell.renameFailed")));
          }
          return;
        }
        case "reveal":
          try {
            if (tab.kind === "script") {
              toast.info(t("shell.scriptsFolderHint"));
              return;
            }
            await invoke("reveal_library_entry", {
              kind: tab.kind,
              name: tab.resourceId,
            });
          } catch (e) {
            toast.error(launchErr(e, t("shell.openLocationFailed")));
          }
          return;
      }
    },
    [applyBatchTabClose, bumpRefresh, onTabClose, openDoc, t, toast, workspace.tabs],
  );

  const onTabReorder = useCallback(
    (fromTabId: string, insertBeforeTabId: string | null) => {
      setWorkspace((ws) => reorderDocTabs(ws, fromTabId, insertBeforeTabId));
    },
    [],
  );

  const activeDocTabId =
    workspace.shellView.type === "doc" ? workspace.shellView.tabId : null;

  const onActiveDocDirtyChange = useCallback(
    (_id: string, dirty: boolean) => {
      if (!activeDocTabId) return;
      setWorkspace((ws) => setTabDirty(ws, activeDocTabId, dirty));
    },
    [activeDocTabId],
  );

  const activeDocId = activeDoc?.id;
  const activeDocLabel = activeDoc?.label;
  const pageTitle = titleBarCtx?.pageTitle;

  useEffect(() => {
    if (!activeDocId || !pageTitle) return;
    const title = pageTitle.trim();
    if (!title || title === activeDocLabel) return;
    setWorkspace((ws) => setTabLabel(ws, activeDocId, title));
  }, [activeDocId, activeDocLabel, pageTitle]);

  const onLaunchClicker = useCallback(
    async (name: string) => {
      try {
        const next = await invoke<EngineStatus>("launch_clicker_preset", { name });
        setStatus(next);
        // Accueil refreshes on engine://status busy→idle (last-run finalize).
        toast.success(t("shell.clickerLaunched", { name }));
        openJournalOnRun();
        void rememberLastRun("clicker", name);
      } catch (e) {
        toast.error(launchErr(e, t("shell.launchClickerFailed")));
      }
    },
    [openJournalOnRun, rememberLastRun, t, toast],
  );

  const onLaunchMacro = useCallback(
    async (name: string) => {
      try {
        const next = await invoke<EngineStatus>("launch_saved_macro", { name });
        setStatus(next);
        toast.success(t("shell.macroLaunched", { name }));
        openJournalOnRun();
        void rememberLastRun("macro", name);
      } catch (e) {
        toast.error(launchErr(e, t("shell.launchMacroFailed")));
      }
    },
    [openJournalOnRun, rememberLastRun, t, toast],
  );

  const onCreateMacro = useCallback(async () => {
    try {
      const doc = await invoke<{ name: string }>("create_saved_macro", { name: null });
      bumpRefresh();
      toast.success(t("shell.macroCreated"));
      openDoc("macro", doc.name);
    } catch (e) {
      toast.error(launchErr(e, t("shell.createMacroFailed")));
    }
  }, [bumpRefresh, openDoc, t, toast]);

  const onCreateClicker = useCallback(async () => {
    try {
      const name = `Preset ${Date.now().toString(36)}`;
      await invoke("save_clicker_preset", {
        name,
        config: DEFAULT_CLICKER,
      });
      bumpRefresh();
      toast.success(t("shell.clickerCreated"));
      openDoc("clicker", name);
    } catch (e) {
      toast.error(launchErr(e, t("shell.createClickerFailed")));
    }
  }, [bumpRefresh, openDoc, t, toast]);

  const onCreateScript = useCallback(async () => {
    const outcome = await confirmChoice({
      title: t("scripts.create.title"),
      message: t("scripts.create.message"),
      confirmLabel: t("scripts.create.runnable"),
      discardLabel: t("scripts.create.module"),
      cancelLabel: t("common.cancel"),
    });
    if (outcome === "cancel") return;
    const isModule = outcome === "discard";
      const language = await askScriptLanguage({
      title: t("scripts.create.languageTitle"),
      message: t("scripts.create.languageMessage"),
      javascriptLabel: t("scripts.language.javascript"),
      typescriptLabel: t("scripts.language.typescript"),
      cancelLabel: t("common.cancel"),
    });
    if (!language) return;
    try {
      const id = newScriptId();
      const doc: ScriptDoc = {
        id,
        name: t("shell.newScriptName"),
        source: defaultScriptSource(language, isModule),
        language,
        isModule,
        allowNetwork: false,
        allowClipboard: false,
        allowFs: false,
        allowMacroControl: false,
        allowInput: false,
        allowProcess: false,
        paramValues: {},
      };
      await invoke("save_script_cmd", { doc });
      bumpRefresh();
      toast.success(t("shell.scriptCreated"));
      openDoc("script", id, doc.name);
    } catch (e) {
      toast.error(launchErr(e, t("shell.createScriptFailed")));
    }
  }, [bumpRefresh, openDoc, t, toast]);

  const onBarContextAction = useCallback(
    async (action: BarContextAction) => {
      switch (action) {
        case "createMacro":
          await onCreateMacro();
          return;
        case "createClicker":
          await onCreateClicker();
          return;
        case "createScript":
          await onCreateScript();
          return;
        case "closeAll":
          await applyBatchTabClose(closeAllDocTabs);
          return;
      }
    },
    [applyBatchTabClose, onCreateClicker, onCreateMacro, onCreateScript],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }

      if (e.key === "w" && !e.shiftKey) {
        if (workspace.shellView.type !== "doc") return;
        e.preventDefault();
        void onTabClose(workspace.shellView.tabId);
        return;
      }

      if (e.key === "t" && !e.shiftKey) {
        e.preventDefault();
        void onCreateMacro();
        return;
      }

      if (e.key === "Tab") {
        if (workspace.tabs.length === 0) return;
        e.preventDefault();
        const currentId =
          workspace.shellView.type === "doc" ? workspace.shellView.tabId : null;
        const nextId = e.shiftKey
          ? prevDocTabId(workspace, currentId)
          : nextDocTabId(workspace, currentId);
        if (nextId) {
          setWorkspace((ws) => selectDocTab(ws, nextId));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCreateMacro, onTabClose, workspace]);

  const commandItems = useMemo((): CommandItem[] => {
    const nav: CommandItem[] = [
      {
        id: "nav-home",
        label: t("shell.navHome"),
        hint: t("shell.navHomeHint"),
        group: t("shell.navGroup"),
        onSelect: () => goHome(),
      },
      {
        id: "nav-settings",
        label: t("shell.navSettings"),
        hint: "Ctrl+,",
        group: t("shell.navGroup"),
        onSelect: () => goSettings("application"),
      },
      {
        id: "nav-journal",
        label: journalOpen ? t("shell.hideJournal") : t("shell.showJournal"),
        group: t("shell.navGroup"),
        onSelect: () => {
          setJournalOpen((o) => {
            const next = !o;
            void persistShell({ journalOpen: next });
            return next;
          });
        },
      },
    ];

    const create: CommandItem[] = [
      {
        id: "create-macro",
        label: t("shell.newMacro"),
        hint: "Ctrl+T",
        group: t("shell.createGroup"),
        onSelect: () => void onCreateMacro(),
      },
      {
        id: "create-clicker",
        label: t("shell.newClicker"),
        group: t("shell.createGroup"),
        onSelect: () => void onCreateClicker(),
      },
      {
        id: "create-script",
        label: t("shell.newScript"),
        group: t("shell.createGroup"),
        onSelect: () => void onCreateScript(),
      },
    ];

    const tabs: CommandItem[] = sortTabsForDisplay(workspace.tabs).map((tab) => ({
      id: `tab-${tab.id}`,
      label: tab.label,
      hint: tab.kind,
      group: t("shell.openTabs"),
      onSelect: () => setWorkspace((ws) => selectDocTab(ws, tab.id)),
    }));

    const session: CommandItem[] = running
      ? [
          {
            id: "stop-session",
            label: t("shell.stopSession"),
            group: t("shell.sessionGroup"),
            onSelect: () => onEmergencyStop(),
          },
        ]
      : [];

    const actions: CommandItem[] = [
      {
        id: "home-order",
        label: t("shell.homeSortManual"),
        group: t("shell.actionsGroup"),
        onSelect: () => {
          goHome();
          automationsPage.setDisplay({
            ...automationsPage.display,
            sortBy: "order",
            sortDir: "asc",
          });
        },
      },
      {
        id: "launch-focused",
        label: t("shell.launchSelected"),
        group: t("shell.actionsGroup"),
        onSelect: () => {
          const key = automationsPage.focusKey;
          if (!key) {
            const tabId =
              workspace.shellView.type === "doc"
                ? workspace.shellView.tabId
                : null;
            const tab = tabId
              ? workspace.tabs.find((t) => t.id === tabId)
              : null;
            if (tab?.resourceId) {
              if (tab.kind === "macro") void onLaunchMacro(tab.resourceId);
              else if (tab.kind === "clicker") void onLaunchClicker(tab.resourceId);
              else if (tab.kind === "script") {
                void invoke("run_script_session_cmd", { id: tab.resourceId })
                  .then(() => {
                    bumpRefresh();
                    toast.success(t("shell.scriptLaunched", { name: tab.label }));
                  })
                  .catch((e) =>
                    toast.error(launchErr(e, t("shell.launchScriptFailed"))),
                  );
              }
              return;
            }
            toast.info(t("shell.selectAutomation"));
            return;
          }
          const colon = key.indexOf(":");
          if (colon < 0) return;
          const kind = key.slice(0, colon);
          const id = key.slice(colon + 1);
          if (kind === "macro") void onLaunchMacro(id);
          else if (kind === "clicker") void onLaunchClicker(id);
          else if (kind === "script") {
            void invoke("run_script_session_cmd", { id })
              .then(() => {
                bumpRefresh();
                toast.success(t("shell.scriptLaunched", { name: id }));
              })
              .catch((e) =>
                toast.error(launchErr(e, t("shell.launchScriptFailed"))),
              );
          }
        },
      },
    ];

    return [...nav, ...create, ...tabs, ...session, ...actions];
  }, [
    automationsPage,
    bumpRefresh,
    goHome,
    goSettings,
    journalOpen,
    onCreateClicker,
    onCreateMacro,
    onCreateScript,
    onEmergencyStop,
    onLaunchClicker,
    onLaunchMacro,
    persistShell,
    running,
    t,
    toast,
    workspace.shellView,
    workspace.tabs,
  ]);

  const sessionPill = useMemo((): { kind: StatusKind; label: string } | null => {
    if (!running && status.state === "idle") return null;
    const kind: StatusKind =
      status.state === "running"
        ? "running"
        : status.state === "paused"
          ? "paused"
          : "healthy";
    return {
      kind,
      label: sessionLabel(locale, status) ?? stateLabel(locale, status.state),
    };
  }, [locale, running, status]);

  const documentTabs = useMemo((): DocumentTabItem[] => {
    return [
      { id: HOME_TAB_ID, label: t("shell.navHome"), kind: "home", closable: false },
      ...sortTabsForDisplay(workspace.tabs).map((tab) => ({
        id: tab.id,
        label: tab.label,
        kind: tab.kind,
        dirty: tab.dirty,
        pinned: tab.pinned,
        closable: !tab.pinned,
      })),
    ];
  }, [t, workspace.tabs]);

  const tabBarActiveId = titleBarHighlightTabId(workspace);

  const showHome =
    workspace.shellView.type === "home" ||
    workspace.shellView.type === "library";
  const showSettings = workspace.shellView.type === "settings";
  const showDoc = workspace.shellView.type === "doc" && !!activeDoc;

  const homeTable = (
    <div
      className="caster-stage-home"
      hidden={!showHome}
      style={showHome ? { height: "100%" } : { display: "none" }}
      aria-hidden={!showHome}
      ref={(el) => {
        if (!el) return;
        if (!showHome) el.setAttribute("inert", "");
        else el.removeAttribute("inert");
      }}
    >
      <AutomationsTable
        active={showHome}
        onNavigate={(r) => {
          if (r.name === "automation") {
            openDoc(r.kind, r.id, r.label ?? r.id);
          }
        }}
        onCreateMacro={() => void onCreateMacro()}
        onCreateClicker={() => void onCreateClicker()}
        onCreateScript={() => void onCreateScript()}
        onLaunchClicker={(n) => void onLaunchClicker(n)}
        onLaunchMacro={(n) => void onLaunchMacro(n)}
        dirtyMacroId={
          workspace.tabs.find((t) => t.kind === "macro" && t.dirty)?.resourceId ?? null
        }
        dirtyClickerId={
          workspace.tabs.find((t) => t.kind === "clicker" && t.dirty)?.resourceId ?? null
        }
        dirtyScriptId={
          workspace.tabs.find((t) => t.kind === "script" && t.dirty)?.resourceId ?? null
        }
        refreshKey={refreshKey}
        query={automationsPage.query}
        onQueryChange={automationsPage.setQuery}
        filter={automationsPage.filter}
        display={automationsPage.display}
        onDisplayChange={automationsPage.setDisplay}
        onFilterChange={automationsPage.setFilter}
        onRefresh={bumpRefresh}
        onResourceRenamed={(kind, fromId, toId, label) => {
          const tabId = docTabId(kind, fromId);
          setWorkspace((ws) => {
            if (!ws.tabs.some((t) => t.id === tabId)) return ws;
            if (kind === "script") return setTabLabel(ws, tabId, label);
            return renameDocTab(ws, tabId, toId, label);
          });
        }}
        runningScriptName={
          running && status.sessionKind === "script"
            ? status.sessionName ?? null
            : null
        }
        onFocusKeyChange={automationsPage.setFocusKey}
        scriptsPrefs={scriptsPrefs}
        accueilPrefs={accueilPrefs}
        onOpenSettings={() => goSettings("application")}
      />
    </div>
  );

  const stageInner = (() => {
    if (showSettings) {
      const section = workspace.shellView.type === "settings"
        ? (workspace.shellView.section ?? settingsSection)
        : settingsSection;
      return (
        <SettingsView
          section={section}
          onSectionChange={(s) => {
            setSettingsSection(s);
            setWorkspace((ws) => openSettings(ws, s));
          }}
          theme={theme}
          onThemeChange={onThemeChange}
          onHotkeysChange={setHotkeys}
          advanced={advanced}
          onAdvancedChange={setAdvanced}
          running={running}
          journalOpen={journalOpen}
          onJournalOpenChange={(v) => {
            setJournalOpen(v);
            void persistShell({ journalOpen: v });
          }}
          onShellPrefsChange={(prefs) => {
            setShellPrefs(prefs);
            onUiLocalePrefChange(prefs.uiLocale);
          }}
          onAutomationPrefsChange={setAutomationPrefs}
          onScriptsPrefsChange={setScriptsPrefs}
          onAccueilPrefsChange={setAccueilPrefs}
        />
      );
    }

    if (showDoc && activeDoc) {
      if (activeDoc.kind === "macro") {
        return (
          <MacroEditorView
            key={`${activeDocTabId}:${docRemountKey}`}
            macroId={activeDoc.resourceId}
            onBack={goHome}
            onDirtyChange={onActiveDocDirtyChange}
            onRenamed={(_from, to) => {
              if (!activeDocTabId) return;
              setWorkspace((ws) => renameDocTab(ws, activeDocTabId, to, to));
              bumpRefresh();
            }}
            engineState={status.state}
            onStatus={setStatus}
            onOpenScript={(id, label) => openDoc("script", id, label ?? id)}
          />
        );
      }
      if (activeDoc.kind === "script") {
        return (
          <ScriptEditorView
            key={`${activeDocTabId}:${docRemountKey}`}
            scriptId={activeDoc.resourceId}
            onBack={goHome}
            onDirtyChange={onActiveDocDirtyChange}
            onLabelChange={(name) => {
              if (!activeDocTabId) return;
              setWorkspace((ws) => setTabLabel(ws, activeDocTabId, name));
            }}
            onOpenSettings={() =>
              setWorkspace((ws) => openSettings(ws, "application"))
            }
            onOpenMacro={(id, label) => openDoc("macro", id, label ?? id)}
            scriptsPrefs={scriptsPrefs}
          />
        );
      }
      return (
        <ClickerStudio
          key={`${activeDocTabId}:${docRemountKey}`}
          presetId={activeDoc.resourceId}
          onBack={goHome}
          status={status}
          onStatus={setStatus}
          refresh={refresh}
          theme={theme}
          onThemeChange={onThemeChange}
          onDirtyChange={onActiveDocDirtyChange}
          onRenamed={(_from, to) => {
            if (!activeDocTabId) return;
            setWorkspace((ws) => renameDocTab(ws, activeDocTabId, to, to));
            bumpRefresh();
          }}
          hotkeys={hotkeys}
          onOpenProcessSettings={() => goSettings("security")}
          onSavedAsNew={(id) => {
            bumpRefresh();
            openDoc("clicker", id);
          }}
        />
      );
    }

    return null;
  })();

  const stage = (
    <>
      {homeTable}
      {showSettings || showDoc ? (
        <Suspense fallback={<EditorSuspenseFallback />}>{stageInner}</Suspense>
      ) : null}
    </>
  );

  return (
    <>
      <AppShell
        titleBar={
          <WindowTitleBar
            tabs={documentTabs}
            activeTabId={tabBarActiveId}
            onTabSelect={onTabSelect}
            onTabClose={(id) => void onTabClose(id)}
            onCreateMacro={() => void onCreateMacro()}
            onCreateClicker={() => void onCreateClicker()}
            onCreateScript={() => void onCreateScript()}
            onOpenExisting={(kind, id, label) => openDoc(kind, id, label ?? id)}
            onPrefetchEditor={prefetchEditor}
            onTabContextAction={(tabId, action) => void onTabContextAction(tabId, action)}
            onBarContextAction={(action) => void onBarContextAction(action)}
            onTabReorder={onTabReorder}
            onPinnedCloseAttempt={() => toast.info(t("shell.pinnedTab"))}
            settingsActive={settingsActive}
            onSettingsClick={() => {
              prefetchEditor("settings");
              goSettings(settingsSection);
            }}
            onJournalClick={() => {
              setJournalOpen((o) => {
                const next = !o;
                void persistShell({ journalOpen: next });
                return next;
              });
            }}
            journalOpen={journalOpen}
            sessionStatus={sessionPill}
            showStop={running}
            onStop={onEmergencyStop}
          />
        }
      >
        {stage}
      </AppShell>
      <RunJournalDock
        lines={journalLines}
        onClear={clearJournal}
        open={journalOpen}
        onOpenChange={(open) => {
          setJournalOpen(open);
          void persistShell({ journalOpen: open });
        }}
      />
      <ConfirmHost />
      <PromptHost />
      <ScriptLanguageHost />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={commandItems}
      />
    </>
  );
}
