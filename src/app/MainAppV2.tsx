import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AutomationsTable } from "../automations/AutomationsTable";
import { useAutomationsPageState } from "../automations/useAutomationsPageState";
import { ClickerStudio } from "../clicker/ClickerStudio";
import { MacroEditorView } from "../macros/graph/MacroEditorView";
import { ScriptEditorView, newScriptId } from "../scripts/ScriptEditorView";
import type { ScriptDoc } from "../scripts/types";
import {
  type EngineStatus,
  type HotkeyBindings,
} from "../macros/types";
import { SettingsView } from "../settings/SettingsView";
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
} from "../ui/v2";
import { TitleBarProvider, useTitleBarContext } from "../ui/v2/TitleBarContext";
import { ConfirmHost, confirmAction, PromptHost, promptAction } from "../ui";
import { applyTheme, readStoredTheme, subscribeSystemTheme, type ThemeMode } from "../theme";
import { stateLabelFr, sessionLabelFr } from "../ui/labels";
import { loadRecent, pushRecent, saveLastStudio } from "./recent";
import type { SettingsSection } from "./types";
import type { AppSettings } from "../clicker/clickerTypes";
import { DEFAULT_CLICKER } from "../clicker/clickerTypes";
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

const JOURNAL_OPEN_KEY = "v2-journal-open";

function readJournalOpen(): boolean {
  try {
    return localStorage.getItem(JOURNAL_OPEN_KEY) === "true";
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

export function MainAppV2() {
  return (
    <TitleBarProvider>
      <ToastProvider>
        <MainAppV2Inner />
      </ToastProvider>
    </TitleBarProvider>
  );
}

function MainAppV2Inner() {
  const toast = useToast();
  const titleBarCtx = useTitleBarContext();
  const automationsPage = useAutomationsPageState();
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => loadWorkspace());
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme());
  const [advanced, setAdvanced] = useState(false);
  const [hotkeys, setHotkeys] = useState<HotkeyBindings>(DEFAULT_HOTKEYS);
  const [status, setStatus] = useState<EngineStatus>({
    state: "idle",
    cancelled: false,
    message: null,
  });
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
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

  const onEmergencyStop = useCallback(() => {
    void invoke<EngineStatus>("emergency_stop")
      .then((s) => {
        setStatus(s);
        toast.info("Session arrêtée");
      })
      .catch(() =>
        void invoke<EngineStatus>("request_cancel")
          .then((s) => {
            setStatus(s);
            toast.info("Annulation demandée");
          })
          .catch((e) => toast.error(launchErr(e, "Impossible d’arrêter"))),
      );
  }, [toast]);

  const openDoc = useCallback((kind: DocTabKind, resourceId: string, label?: string) => {
    setWorkspace((ws) => {
      const next = openDocTab(ws, kind, resourceId, label ?? resourceId);
      if (kind === "macro" || kind === "clicker") {
        pushRecent({ id: resourceId, kind, label: label ?? resourceId });
        saveLastStudio({ id: resourceId, kind });
      }
      return next;
    });
  }, []);

  const goHome = useCallback(() => {
    setWorkspace((ws) => selectHome(ws));
  }, []);

  const goSettings = useCallback((section: SettingsSection = "general") => {
    setSettingsSection(section);
    setWorkspace((ws) => openSettings(ws, section));
  }, []);

  const onTabSelect = useCallback((tabId: string) => {
    if (tabId === HOME_TAB_ID) {
      goHome();
      return;
    }
    setWorkspace((ws) => selectDocTab(ws, tabId));
  }, [goHome]);

  const onTabClose = useCallback(
    async (tabId: string) => {
      const tab = workspace.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      if (tab.pinned) {
        toast.info("Onglet épinglé — désépinglez-le pour le fermer");
        return;
      }
      if (tab.dirty) {
        const ok = await confirmAction({
          title: "Fermer",
          message: `« ${tab.label} » a des modifications non enregistrées. Fermer quand même ?`,
          confirmLabel: "Fermer",
          danger: true,
        });
        if (!ok) return;
      }
      setWorkspace((ws) => closeDocTab(ws, tabId));
    },
    [toast, workspace.tabs],
  );

  const applyBatchTabClose = useCallback(
    async (apply: (ws: WorkspaceState) => WorkspaceState) => {
      const closing = tabsClosedBy(workspace, apply(workspace));
      if (closing.length === 0) return;
      const dirty = closing.filter((t) => t.dirty);
      if (dirty.length > 0) {
        const message =
          dirty.length === 1
            ? `« ${dirty[0]!.label} » a des modifications non enregistrées. Fermer quand même ?`
            : `${dirty.length} onglets ont des modifications non enregistrées (${dirty.map((t) => t.label).join(", ")}). Fermer quand même ?`;
        const ok = await confirmAction({
          title: "Fermer",
          message,
          confirmLabel: "Fermer",
          danger: true,
        });
        if (!ok) return;
      }
      setWorkspace(apply);
    },
    [workspace],
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
              toast.success(`Macro dupliquée · ${copy.name}`);
              openDoc("macro", copy.name);
            } else if (tab.kind === "clicker") {
              const copy = await invoke<{ name: string }>("duplicate_clicker_preset", {
                name: tab.resourceId,
              });
              bumpRefresh();
              toast.success(`Preset dupliqué · ${copy.name}`);
              openDoc("clicker", copy.name);
            } else {
              const src = await invoke<ScriptDoc>("load_script_cmd", {
                id: tab.resourceId,
              });
              const copy: ScriptDoc = {
                ...src,
                id: newScriptId(),
                name: `${src.name} (copie)`,
              };
              await invoke("save_script_cmd", { doc: copy });
              bumpRefresh();
              toast.success(`Script dupliqué · ${copy.name}`);
              openDoc("script", copy.id, copy.name);
            }
          } catch (e) {
            toast.error(launchErr(e, "Duplication impossible"));
          }
          return;
        case "rename": {
          if (tab.dirty) {
            const ok = await confirmAction({
              title: "Renommer",
              message: `« ${tab.label} » a des modifications non enregistrées. Renommer quand même ?`,
              confirmLabel: "Renommer",
            });
            if (!ok) return;
          }
          const nextName = await promptAction({
            title: "Renommer",
            defaultValue: tab.kind === "script" ? tab.label : tab.resourceId,
            confirmLabel: "Renommer",
            placeholder: "Nouveau nom",
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
              toast.success(`Macro renommée · ${doc.name}`);
            } else if (tab.kind === "clicker") {
              const preset = await invoke<{ name: string }>("rename_clicker_preset", {
                from: tab.resourceId,
                to: nextName,
              });
              bumpRefresh();
              setWorkspace((ws) => renameDocTab(ws, tabId, preset.name, preset.name));
              toast.success(`Preset renommé · ${preset.name}`);
            } else {
              const src = await invoke<ScriptDoc>("load_script_cmd", {
                id: tab.resourceId,
              });
              const updated = { ...src, name: nextName };
              await invoke("save_script_cmd", { doc: updated });
              bumpRefresh();
              setWorkspace((ws) => setTabLabel(ws, tabId, nextName));
              toast.success(`Script renommé · ${nextName}`);
            }
          } catch (e) {
            toast.error(launchErr(e, "Renommage impossible"));
          }
          return;
        }
        case "reveal":
          try {
            if (tab.kind === "script") {
              toast.info("Les scripts sont dans le dossier config / scripts");
              return;
            }
            await invoke("reveal_library_entry", {
              kind: tab.kind,
              name: tab.resourceId,
            });
          } catch (e) {
            toast.error(launchErr(e, "Impossible d’ouvrir l’emplacement"));
          }
          return;
      }
    },
    [applyBatchTabClose, bumpRefresh, onTabClose, openDoc, toast, workspace.tabs],
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
        bumpRefresh();
        toast.success(`Clicker lancé · ${name}`);
      } catch (e) {
        toast.error(launchErr(e, "Échec du lancement clicker"));
      }
    },
    [bumpRefresh, toast],
  );

  const onLaunchMacro = useCallback(
    async (name: string) => {
      try {
        const next = await invoke<EngineStatus>("launch_saved_macro", { name });
        setStatus(next);
        bumpRefresh();
        toast.success(`Macro lancée · ${name}`);
      } catch (e) {
        toast.error(launchErr(e, "Échec du lancement macro"));
      }
    },
    [bumpRefresh, toast],
  );

  const onCreateMacro = useCallback(async () => {
    try {
      const doc = await invoke<{ name: string }>("create_saved_macro", { name: null });
      bumpRefresh();
      toast.success("Macro créée");
      openDoc("macro", doc.name);
    } catch (e) {
      toast.error(launchErr(e, "Impossible de créer la macro"));
    }
  }, [bumpRefresh, openDoc, toast]);

  const onCreateClicker = useCallback(async () => {
    try {
      const name = `Preset ${Date.now().toString(36)}`;
      await invoke("save_clicker_preset", {
        name,
        config: DEFAULT_CLICKER,
      });
      bumpRefresh();
      toast.success("Preset clicker créé");
      openDoc("clicker", name);
    } catch (e) {
      toast.error(launchErr(e, "Impossible de créer le preset"));
    }
  }, [bumpRefresh, openDoc, toast]);

  const onCreateScript = useCallback(async () => {
    try {
      const id = newScriptId();
      const doc: ScriptDoc = {
        id,
        name: "Nouveau script",
        source:
          "//@param label string world\ncaster.log('hello ' + caster.get('label'));\n",
        allowNetwork: false,
        allowClipboard: false,
        allowFs: false,
        allowMacroControl: false,
        paramValues: {},
      };
      await invoke("save_script_cmd", { doc });
      bumpRefresh();
      toast.success("Script créé");
      openDoc("script", id, doc.name);
    } catch (e) {
      toast.error(launchErr(e, "Impossible de créer le script"));
    }
  }, [bumpRefresh, openDoc, toast]);

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
        label: "Accueil",
        hint: "Liste des automations",
        group: "Navigation",
        onSelect: () => goHome(),
      },
      {
        id: "nav-settings",
        label: "Paramètres",
        hint: "Ctrl+,",
        group: "Navigation",
        onSelect: () => goSettings("general"),
      },
      {
        id: "nav-journal",
        label: journalOpen ? "Masquer le journal" : "Afficher le journal",
        group: "Navigation",
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
        label: "Nouvelle macro",
        hint: "Ctrl+T",
        group: "Créer",
        onSelect: () => void onCreateMacro(),
      },
      {
        id: "create-clicker",
        label: "Nouveau clicker",
        group: "Créer",
        onSelect: () => void onCreateClicker(),
      },
      {
        id: "create-script",
        label: "Nouveau script",
        group: "Créer",
        onSelect: () => void onCreateScript(),
      },
    ];

    const tabs: CommandItem[] = sortTabsForDisplay(workspace.tabs).map((t) => ({
      id: `tab-${t.id}`,
      label: t.label,
      hint: t.kind,
      group: "Onglets ouverts",
      onSelect: () => setWorkspace((ws) => selectDocTab(ws, t.id)),
    }));

    const session: CommandItem[] = running
      ? [
          {
            id: "stop-session",
            label: "Arrêter la session",
            group: "Session",
            onSelect: () => onEmergencyStop(),
          },
        ]
      : [];

    return [...nav, ...create, ...tabs, ...session];
  }, [
    goHome,
    goSettings,
    journalOpen,
    onCreateClicker,
    onCreateMacro,
    onCreateScript,
    onEmergencyStop,
    persistShell,
    running,
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
      label: sessionLabelFr(status) ?? stateLabelFr(status.state),
    };
  }, [running, status]);

  const documentTabs = useMemo((): DocumentTabItem[] => {
    return [
      { id: HOME_TAB_ID, label: "Accueil", kind: "home", closable: false },
      ...sortTabsForDisplay(workspace.tabs).map((t) => ({
        id: t.id,
        label: t.label,
        kind: t.kind,
        dirty: t.dirty,
        pinned: t.pinned,
        closable: !t.pinned,
      })),
    ];
  }, [workspace.tabs]);

  const tabBarActiveId = titleBarHighlightTabId(workspace);

  const stage = (() => {
    if (workspace.shellView.type === "settings") {
      const section = workspace.shellView.section ?? settingsSection;
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
        />
      );
    }

    if (workspace.shellView.type === "doc" && activeDoc) {
      if (activeDoc.kind === "macro") {
        return (
          <MacroEditorView
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
            scriptId={activeDoc.resourceId}
            onBack={goHome}
            onDirtyChange={onActiveDocDirtyChange}
            onLabelChange={(name) => {
              if (!activeDocTabId) return;
              setWorkspace((ws) => setTabLabel(ws, activeDocTabId, name));
            }}
          />
        );
      }
      return (
        <ClickerStudio
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
          onOpenProcessSettings={() => goSettings("process")}
        />
      );
    }

    if (
      workspace.shellView.type === "home" ||
      workspace.shellView.type === "library"
    ) {
      return (
        <AutomationsTable
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
          folderKey={automationsPage.folderKey}
          onFolderKeyChange={automationsPage.setFolderKey}
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
        />
      );
    }

    return null;
  })();

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
            onTabContextAction={(tabId, action) => void onTabContextAction(tabId, action)}
            onBarContextAction={(action) => void onBarContextAction(action)}
            onTabReorder={onTabReorder}
            onPinnedCloseAttempt={() =>
              toast.info("Onglet épinglé — désépinglez-le pour le fermer")
            }
            settingsActive={settingsActive}
            onSettingsClick={() => goSettings(settingsSection)}
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
            recentItems={loadRecent().map((r) => ({
              id: `${r.kind}:${r.id}`,
              label: r.label,
              onSelect: () => openDoc(r.kind, r.id, r.label),
            }))}
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
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={commandItems}
      />
    </>
  );
}
