import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AutomationKind } from "./types";

const HISTORY_MAX = 50;

export type AccueilUndoEntry =
  | {
      type: "trash-item";
      kind: AutomationKind;
      id: string;
      label: string;
    }
  | {
      type: "rename-item";
      kind: AutomationKind;
      id: string;
      fromName: string;
      toName: string;
    }
  | {
      type: "move-item";
      kind: AutomationKind;
      id: string;
      fromFolderId: string | null;
      toFolderId: string | null;
      label: string;
    }
  | {
      type: "create-folder";
      id: string;
      name: string;
    }
  | {
      type: "rename-folder";
      id: string;
      fromName: string;
      toName: string;
    }
  | {
      type: "delete-folder";
      name: string;
    }
  | {
      type: "convert-item";
      kind: AutomationKind;
      id: string;
      label: string;
    }
  | {
      type: "convert-batch";
      items: { kind: AutomationKind; id: string }[];
    };

function isUndoOnly(entry: AccueilUndoEntry): boolean {
  return (
    entry.type === "create-folder" ||
    entry.type === "delete-folder" ||
    entry.type === "convert-item" ||
    entry.type === "convert-batch"
  );
}

async function removeCreatedItem(
  kind: AutomationKind,
  id: string,
): Promise<void> {
  await invoke("trash_library_item_cmd", { kind, id });
}

async function applyInverse(entry: AccueilUndoEntry): Promise<void> {
  switch (entry.type) {
    case "trash-item":
      await invoke("restore_library_item_cmd", {
        kind: entry.kind,
        id: entry.id,
      });
      return;
    case "rename-item":
      if (entry.kind === "macro") {
        await invoke("rename_saved_macro", {
          from: entry.toName,
          to: entry.fromName,
        });
      } else if (entry.kind === "clicker") {
        await invoke("rename_clicker_preset", {
          from: entry.toName,
          to: entry.fromName,
        });
      } else {
        const src = await invoke<{ id: string; name: string; source: string }>(
          "load_script_cmd",
          { id: entry.id },
        );
        await invoke("save_script_cmd", {
          doc: { ...src, name: entry.fromName },
        });
      }
      return;
    case "move-item":
      await invoke("move_library_item_cmd", {
        kind: entry.kind,
        id: entry.id,
        folderId: entry.fromFolderId,
        beforeId: null,
      });
      return;
    case "create-folder":
      await invoke("delete_library_folder_cmd", {
        kind: "macro",
        id: entry.id,
      });
      return;
    case "rename-folder":
      await invoke("rename_library_folder_cmd", {
        kind: "macro",
        id: entry.id,
        name: entry.fromName,
      });
      return;
    case "delete-folder":
      await invoke("create_library_folder_cmd", {
        kind: "macro",
        name: entry.name,
        parentId: null,
      });
      return;
    case "convert-item":
      await removeCreatedItem(entry.kind, entry.id);
      return;
    case "convert-batch":
      for (const item of entry.items) {
        await removeCreatedItem(item.kind, item.id);
      }
      return;
  }
}

export function useAccueilUndo(opts: {
  onAfterUndo: () => void | Promise<void>;
}) {
  const pastRef = useRef<AccueilUndoEntry[]>([]);
  const futureRef = useRef<AccueilUndoEntry[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const push = useCallback(
    (entry: AccueilUndoEntry) => {
      pastRef.current = [...pastRef.current, entry].slice(-HISTORY_MAX);
      futureRef.current = [];
      syncFlags();
    },
    [syncFlags],
  );

  const undo = useCallback(async () => {
    const entry = pastRef.current[pastRef.current.length - 1];
    if (!entry) return;
    pastRef.current = pastRef.current.slice(0, -1);
    try {
      await applyInverse(entry);
      // Folder create/delete + convert redo is ambiguous (new ids) — undo-only.
      if (!isUndoOnly(entry)) {
        futureRef.current = [...futureRef.current, entry];
      } else {
        futureRef.current = [];
      }
      syncFlags();
      await opts.onAfterUndo();
    } catch {
      pastRef.current = [...pastRef.current, entry];
      syncFlags();
      throw new Error("undo-failed");
    }
  }, [opts, syncFlags]);

  const redo = useCallback(async () => {
    const entry = futureRef.current[futureRef.current.length - 1];
    if (!entry) return;
    // Redo = re-apply the forward action by inverting the inverse snapshot.
    // For our stack we store forward entries; redo re-executes forward.
    futureRef.current = futureRef.current.slice(0, -1);
    try {
      await applyForward(entry);
      pastRef.current = [...pastRef.current, entry].slice(-HISTORY_MAX);
      syncFlags();
      await opts.onAfterUndo();
    } catch {
      futureRef.current = [...futureRef.current, entry];
      syncFlags();
      throw new Error("redo-failed");
    }
  }, [opts, syncFlags]);

  return { push, undo, redo, canUndo, canRedo };
}

async function applyForward(entry: AccueilUndoEntry): Promise<void> {
  switch (entry.type) {
    case "trash-item":
      await invoke("trash_library_item_cmd", {
        kind: entry.kind,
        id: entry.id,
      });
      return;
    case "rename-item":
      if (entry.kind === "macro") {
        await invoke("rename_saved_macro", {
          from: entry.fromName,
          to: entry.toName,
        });
      } else if (entry.kind === "clicker") {
        await invoke("rename_clicker_preset", {
          from: entry.fromName,
          to: entry.toName,
        });
      } else {
        const src = await invoke<{ id: string; name: string; source: string }>(
          "load_script_cmd",
          { id: entry.id },
        );
        await invoke("save_script_cmd", {
          doc: { ...src, name: entry.toName },
        });
      }
      return;
    case "move-item":
      await invoke("move_library_item_cmd", {
        kind: entry.kind,
        id: entry.id,
        folderId: entry.toFolderId,
        beforeId: null,
      });
      return;
    case "create-folder":
      await invoke("create_library_folder_cmd", {
        kind: "macro",
        name: entry.name,
        parentId: null,
      });
      return;
    case "rename-folder":
      await invoke("rename_library_folder_cmd", {
        kind: "macro",
        id: entry.id,
        name: entry.toName,
      });
      return;
    case "delete-folder":
    case "convert-item":
    case "convert-batch":
      // Undo-only entries — never re-applied via redo.
      return;
  }
}
