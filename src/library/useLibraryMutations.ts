import { invoke } from "@tauri-apps/api/core";
import { runLibraryConvert } from "../automations/convertLibraryItem";
import type {
  AutomationFolderOption,
  AutomationRow,
} from "../automations/types";
import {
  askScriptLanguage,
  confirmAction,
  confirmChoice,
} from "../ui";
import type { useT } from "../i18n";
import type { useToast } from "../ui/shell";
import { DEFAULT_CLICKER } from "../clicker/clickerTypes";
import { defaultScriptSource } from "../scripts/defaultSources";
import { newScriptId } from "../scripts/newScriptId";
import type { ScriptDoc, ScriptLanguage } from "../scripts/types";
import { computeFolderReorderIds } from "./libFolderOrder";
import {
  patchFoldersAfterFolderMove,
  patchRowsAfterItemMove,
} from "./libOptimisticMove";
import { errMessage, folderNavKey, rowDomKey, stubRow } from "./libTree";
import type { useUnifiedAutomations } from "../automations/useUnifiedAutomations";

type UnifiedAutomations = ReturnType<typeof useUnifiedAutomations>;

export type ScriptCreateOpts = {
  language: ScriptLanguage;
  isModule: boolean;
};

export type LibraryMutationsDeps = {
  t: ReturnType<typeof useT>;
  toast: ReturnType<typeof useToast>;
  bump: () => void;
  onOpen: (row: AutomationRow) => void;
  onRefresh?: () => void;
  onItemRenamed?: (
    kind: AutomationRow["kind"],
    id: string,
    newName: string,
  ) => void;
  onItemDeleted?: (kind: AutomationRow["kind"], id: string) => void;
  confirmTrash: boolean;
  confirmDeleteFolder: boolean;
  captureSnapshot: UnifiedAutomations["captureSnapshot"];
  applyLocalMove: UnifiedAutomations["applyLocalMove"];
  replaceAutomationsSnapshot: UnifiedAutomations["replaceAutomationsSnapshot"];
  setEditingKey: (key: string | null) => void;
};

export function useLibraryMutations({
  t,
  toast,
  bump,
  onOpen,
  onRefresh,
  onItemRenamed,
  onItemDeleted,
  confirmTrash,
  confirmDeleteFolder,
  captureSnapshot,
  applyLocalMove,
  replaceAutomationsSnapshot,
  setEditingKey,
}: LibraryMutationsDeps) {
  /** Persist a new folder; returns nav key on success, null on failure/cancel. */
  async function commitCreateFolder(
    parentId: string | null,
    name: string,
  ): Promise<string | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    try {
      const folder = await invoke<{ id: string }>("create_library_folder_cmd", {
        kind: "macro",
        name: trimmed,
        parentId,
      });
      toast.success(t("automations.toast.folderCreated", { name: trimmed }));
      bump();
      return folderNavKey(folder.id);
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
      return null;
    }
  }

  /** Persist a named item; returns rowDomKey on success, null on failure/cancel. */
  async function commitCreateItem(
    kind: AutomationRow["kind"],
    name: string,
    folderId: string | null,
    scriptOpts?: ScriptCreateOpts,
  ): Promise<string | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const folder =
      folderId == null
        ? null
        : ({
            id: folderId,
            name: "",
            sortOrder: 0,
            parentId: null,
          } satisfies AutomationFolderOption);
    try {
      if (kind === "macro") {
        const doc = await invoke<{ name: string }>("create_saved_macro", {
          name: trimmed,
        });
        if (folderId) {
          await invoke("move_library_item_cmd", {
            kind: "macro",
            id: doc.name,
            folderId,
            beforeId: null,
          });
        }
        bump();
        toast.success(t("shell.macroCreated"));
        const row = stubRow("macro", doc.name, doc.name, folder);
        onOpen(row);
        return rowDomKey(row);
      }
      if (kind === "clicker") {
        await invoke("save_clicker_preset", {
          name: trimmed,
          config: DEFAULT_CLICKER,
        });
        if (folderId) {
          await invoke("move_library_item_cmd", {
            kind: "clicker",
            id: trimmed,
            folderId,
            beforeId: null,
          });
        }
        bump();
        toast.success(t("shell.clickerCreated"));
        const row = stubRow("clicker", trimmed, trimmed, folder);
        onOpen(row);
        return rowDomKey(row);
      }
      if (!scriptOpts) {
        toast.error(t("automations.toast.moveFail"));
        return null;
      }
      const id = newScriptId();
      const doc: ScriptDoc = {
        id,
        name: trimmed,
        source: defaultScriptSource(scriptOpts.language, scriptOpts.isModule),
        language: scriptOpts.language,
        isModule: scriptOpts.isModule,
        allowNetwork: false,
        allowClipboard: false,
        allowFs: false,
        allowMacroControl: false,
        allowInput: false,
        allowProcess: false,
        paramValues: {},
      };
      await invoke("save_script_cmd", { doc });
      if (folderId) {
        await invoke("move_library_item_cmd", {
          kind: "script",
          id,
          folderId,
          beforeId: null,
        });
      }
      bump();
      toast.success(t("shell.scriptCreated"));
      const row = stubRow("script", id, trimmed, folder);
      onOpen(row);
      return rowDomKey(row);
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
      return null;
    }
  }

  /** Ask script type + language; null if cancelled. */
  async function promptScriptCreateOpts(): Promise<ScriptCreateOpts | null> {
    const outcome = await confirmChoice({
      title: t("scripts.create.title"),
      message: t("scripts.create.message"),
      confirmLabel: t("scripts.create.runnable"),
      discardLabel: t("scripts.create.module"),
      cancelLabel: t("common.cancel"),
    });
    if (outcome === "cancel") return null;
    const isModule = outcome === "discard";
    const language = await askScriptLanguage({
      title: t("scripts.create.languageTitle"),
      message: t("scripts.create.languageMessage"),
      javascriptLabel: t("scripts.language.javascript"),
      typescriptLabel: t("scripts.language.typescript"),
      cancelLabel: t("common.cancel"),
    });
    if (!language) return null;
    return { language, isModule };
  }

  function startFolderRename(folder: AutomationFolderOption) {
    setEditingKey(folderNavKey(folder.id));
  }

  async function applyFolderRename(
    folder: AutomationFolderOption,
    next: string,
  ) {
    setEditingKey(null);
    const name = next.trim();
    if (!name || name === folder.name) return;
    try {
      await invoke("rename_library_folder_cmd", {
        kind: "macro",
        id: folder.id,
        name,
      });
      toast.success(t("automations.toast.folderRenamed", { name }));
      bump();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  function renameFolder(folder: AutomationFolderOption) {
    startFolderRename(folder);
  }

  async function deleteFolder(folder: AutomationFolderOption) {
    if (confirmDeleteFolder) {
      const ok = await confirmAction({
        title: t("automations.confirm.deleteFolderTitle"),
        message: t("automations.confirm.deleteFolderMessage", {
          name: folder.name,
        }),
        confirmLabel: t("automations.confirm.deleteConfirm"),
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await invoke("delete_library_folder_cmd", {
        kind: "macro",
        id: folder.id,
      });
      toast.success(
        t("automations.toast.folderDeleted", { name: folder.name }),
      );
      bump();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  function startRowRename(row: AutomationRow) {
    if (row.locked) return;
    setEditingKey(rowDomKey(row));
  }

  async function applyRowRename(row: AutomationRow, next: string) {
    setEditingKey(null);
    if (row.locked) return;
    const to = next.trim();
    if (!to || to === row.name) return;
    try {
      if (row.kind === "macro") {
        const doc = await invoke<{ name: string }>("rename_saved_macro", {
          from: row.id,
          to,
        });
        onItemRenamed?.(row.kind, row.id, doc.name);
        toast.success(t("automations.toast.renamed", { name: doc.name }));
      } else if (row.kind === "clicker") {
        const preset = await invoke<{ name: string }>("rename_clicker_preset", {
          from: row.id,
          to,
        });
        onItemRenamed?.(row.kind, row.id, preset.name);
        toast.success(t("automations.toast.renamed", { name: preset.name }));
      } else {
        const src = await invoke<{ id: string; name: string; source: string }>(
          "load_script_cmd",
          { id: row.id },
        );
        await invoke("save_script_cmd", { doc: { ...src, name: to } });
        onItemRenamed?.(row.kind, row.id, to);
        toast.success(t("automations.toast.renamed", { name: to }));
      }
      bump();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  function renameRow(row: AutomationRow) {
    startRowRename(row);
  }

  async function duplicateRow(row: AutomationRow) {
    try {
      if (row.kind === "macro") {
        const copy = await invoke<{ name: string }>("duplicate_saved_macro", {
          name: row.id,
        });
        bump();
        toast.success(
          t("automations.toast.duplicatedOne", { name: copy.name }),
        );
        onOpen({ ...row, id: copy.name, name: copy.name });
      } else if (row.kind === "clicker") {
        const copy = await invoke<{ name: string }>(
          "duplicate_clicker_preset",
          { name: row.id },
        );
        bump();
        toast.success(
          t("automations.toast.duplicatedOne", { name: copy.name }),
        );
        onOpen({ ...row, id: copy.name, name: copy.name });
      } else {
        const src = await invoke<{
          id: string;
          name: string;
          source: string;
          language?: string;
        }>("load_script_cmd", { id: row.id });
        const copy = {
          ...src,
          id: newScriptId(),
          name: `${src.name} copy`,
        };
        await invoke("save_script_cmd", { doc: copy });
        bump();
        toast.success(
          t("automations.toast.duplicatedOne", { name: copy.name }),
        );
        onOpen({ ...row, id: copy.id, name: copy.name });
      }
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  async function toggleFavorite(row: AutomationRow) {
    try {
      await invoke("set_quick_favorite", {
        kind: row.kind,
        id: row.id,
        favorite: !row.favorite,
      });
      bump();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.favoriteFail")));
    }
  }

  async function setLocked(row: AutomationRow, locked: boolean) {
    try {
      await invoke("set_library_item_locked_cmd", {
        kind: row.kind,
        id: row.id,
        locked,
      });
      bump();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  async function deleteRow(row: AutomationRow) {
    if (row.locked) {
      toast.error(t("automations.toast.unlockBeforeDelete"));
      return;
    }
    if (confirmTrash) {
      const ok = await confirmAction({
        title: t("automations.confirm.deleteTitle"),
        message: t("automations.confirm.deleteOne", { name: row.name }),
        confirmLabel: t("automations.confirm.deleteConfirm"),
        danger: true,
      });
      if (!ok) return;
    }
    try {
      if (row.kind === "macro") {
        await invoke("delete_saved_macro", { name: row.id });
      } else if (row.kind === "clicker") {
        await invoke("delete_clicker_preset", { name: row.id });
      } else {
        await invoke("delete_script_cmd", { id: row.id });
      }
      toast.success(t("automations.toast.deleted"));
      onItemDeleted?.(row.kind, row.id);
      bump();
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.deleteFail")));
    }
  }

  /** Bulk delete: one confirm dialog (if `confirmTrash`), locked rows skipped. */
  async function deleteRows(rows: AutomationRow[]): Promise<boolean> {
    const deletable = rows.filter((r) => !r.locked);
    const lockedCount = rows.length - deletable.length;
    if (deletable.length === 0) {
      if (lockedCount > 0) {
        toast.error(t("automations.toast.unlockBeforeDelete"));
      }
      return false;
    }
    if (confirmTrash) {
      const ok = await confirmAction({
        title: t("automations.confirm.deleteTitle"),
        message:
          deletable.length === 1
            ? t("automations.confirm.deleteOne", { name: deletable[0].name })
            : t("automations.confirm.deleteManyOther", {
                count: deletable.length,
              }),
        confirmLabel: t("automations.confirm.deleteConfirm"),
        danger: true,
      });
      if (!ok) return false;
    }
    let failed = false;
    for (const row of deletable) {
      try {
        if (row.kind === "macro") {
          await invoke("delete_saved_macro", { name: row.id });
        } else if (row.kind === "clicker") {
          await invoke("delete_clicker_preset", { name: row.id });
        } else {
          await invoke("delete_script_cmd", { id: row.id });
        }
        onItemDeleted?.(row.kind, row.id);
      } catch (e) {
        failed = true;
        toast.error(errMessage(e, t("automations.toast.deleteFail")));
      }
    }
    if (!failed) toast.success(t("automations.toast.deleted"));
    if (lockedCount > 0) {
      toast.error(t("automations.toast.unlockBeforeDelete"));
    }
    bump();
    return !failed;
  }

  async function moveRow(
    row: AutomationRow,
    folder: AutomationFolderOption | null,
    beforeId?: string | null,
    beforeKind?: AutomationRow["kind"] | null,
  ) {
    const snap = captureSnapshot();
    const nextFolderId = folder?.id ?? null;
    const folderLabel = folder?.name ?? t("common.empty");
    applyLocalMove({
      rows: patchRowsAfterItemMove(
        snap.rows,
        row,
        nextFolderId,
        folderLabel,
        beforeId ?? null,
        beforeKind ?? null,
      ),
    });
    try {
      await invoke("move_library_item_cmd", {
        kind: row.kind,
        id: row.id,
        folderId: nextFolderId,
        beforeId: beforeId ?? null,
        beforeKind: beforeKind ?? null,
      });
      toast.success(t("automations.toast.moved"));
      bump();
    } catch (e) {
      replaceAutomationsSnapshot(snap);
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }


  async function moveFolder(
    folder: AutomationFolderOption,
    parentId: string | null,
    beforeFolderId: string | null,
  ) {
    const snap = captureSnapshot();
    const ordered = computeFolderReorderIds(
      snap.folders,
      folder.id,
      parentId,
      beforeFolderId,
    );
    const patched = patchFoldersAfterFolderMove(
      snap.folders,
      folder.id,
      parentId,
      beforeFolderId,
    );
    if (!ordered || !patched) {
      toast.error(t("automations.toast.moveFail"));
      return;
    }
    applyLocalMove({ folders: patched });
    try {
      if ((folder.parentId ?? null) !== parentId) {
        await invoke("set_library_folder_parent_cmd", {
          id: folder.id,
          parentId,
        });
      }
      await invoke("reorder_library_folders_cmd", { orderedIds: ordered });
      toast.success(t("automations.toast.moved"));
      bump();
    } catch (e) {
      replaceAutomationsSnapshot(snap);
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  async function launchRow(row: AutomationRow) {
    try {
      if (row.kind === "macro") {
        await invoke("launch_saved_macro", { name: row.id });
      } else if (row.kind === "clicker") {
        await invoke("launch_clicker_preset", { name: row.id });
      } else {
        if (row.isModule) {
          toast.error(t("automations.toast.scriptModuleBlocked"));
          return;
        }
        await invoke("run_script_session_cmd", { id: row.id });
        toast.success(
          t("automations.toast.scriptLaunched", { name: row.name }),
        );
      }
      onRefresh?.();
    } catch (e) {
      toast.error(
        errMessage(
          e,
          row.kind === "script"
            ? t("automations.toast.scriptLaunchFail")
            : t("automations.toast.moveFail"),
        ),
      );
    }
  }

  async function revealRow(row: AutomationRow) {
    try {
      await invoke("reveal_library_entry", { kind: row.kind, name: row.id });
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.revealFail")));
    }
  }

  async function convertRow(row: AutomationRow, toKind: AutomationRow["kind"]) {
    try {
      const outcome = await runLibraryConvert({
        fromKind: row.kind,
        id: row.id,
        toKind,
        name: row.name,
        t,
      });
      if (!outcome) return;
      bump();
      if (outcome.openAfter) {
        onOpen({
          ...row,
          kind: toKind,
          id: outcome.result.newId,
          name: outcome.result.newName,
        });
      }
    } catch (e) {
      toast.error(errMessage(e, t("automations.toast.moveFail")));
    }
  }

  return {
    commitCreateFolder,
    commitCreateItem,
    promptScriptCreateOpts,
    startFolderRename,
    applyFolderRename,
    renameFolder,
    deleteFolder,
    startRowRename,
    applyRowRename,
    renameRow,
    duplicateRow,
    toggleFavorite,
    setLocked,
    deleteRow,
    deleteRows,
    moveRow,
    moveFolder,
    launchRow,
    revealRow,
    convertRow,
  };
}
