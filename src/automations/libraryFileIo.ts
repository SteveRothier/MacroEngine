import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { TFunction } from "../i18n";
import type { MacroDocument } from "../macros/types";
import type { ScriptDoc } from "../scripts/types";
import type { AutomationKind } from "./types";

export type ImportedLibraryItem = {
  kind: AutomationKind;
  id: string;
  name: string;
};

function fileStem(path: string): string {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? "item";
  return base.replace(/\.json$/i, "");
}

/** Export one library item to a JSON file (dialog). */
export async function exportLibraryItem(
  kind: AutomationKind,
  id: string,
  _t: TFunction,
): Promise<boolean> {
  const safe = id.replace(/\s+/g, "-").toLowerCase();
  const path = await save({
    defaultPath: `${safe}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return false;
  if (kind === "macro") {
    await invoke("export_library_macro_path", { id, path });
  } else if (kind === "clicker") {
    await invoke("export_clicker_preset_path", { name: id, path });
  } else {
    await invoke("export_script_path", { id, path });
  }
  return true;
}

/** Export full library ZIP (dialog). */
export async function exportLibraryZip(): Promise<boolean> {
  const path = await save({
    defaultPath: "caster-library.zip",
    filters: [{ name: "ZIP", extensions: ["zip"] }],
  });
  if (!path) return false;
  await invoke("export_library_backup", { path });
  return true;
}

/** Import library ZIP (path already chosen). */
export async function importLibraryZipAt(path: string): Promise<void> {
  await invoke("import_library_backup", { path });
}

/**
 * Import a JSON file into the library.
 * Tries macro → clicker → script parsers in that order.
 */
export async function importLibraryItemFromPath(
  path: string,
): Promise<ImportedLibraryItem> {
  try {
    const doc = await invoke<MacroDocument>("import_library_macro_path", {
      path,
    });
    return { kind: "macro", id: doc.name, name: doc.name };
  } catch {
    /* try clicker */
  }
  try {
    const preset = await invoke<{ name: string }>("import_clicker_preset_path", {
      path,
    });
    return { kind: "clicker", id: preset.name, name: preset.name };
  } catch {
    /* try script */
  }
  const doc = await invoke<ScriptDoc>("import_script_path", { path });
  return {
    kind: "script",
    id: doc.id,
    name: doc.name || fileStem(path),
  };
}

/** Open-file dialog then import JSON or ZIP. */
export async function pickAndImportLibraryFile(options: {
  t: TFunction;
  confirmZip: () => Promise<boolean>;
}): Promise<
  | { type: "item"; item: ImportedLibraryItem }
  | { type: "zip" }
  | { type: "cancel" }
> {
  const path = await open({
    multiple: false,
    filters: [
      { name: options.t("automations.io.dialogAll"), extensions: ["json", "zip"] },
      { name: "JSON", extensions: ["json"] },
      { name: "ZIP", extensions: ["zip"] },
    ],
  });
  if (!path || Array.isArray(path)) return { type: "cancel" };
  const lower = path.toLowerCase();
  if (lower.endsWith(".zip")) {
    const ok = await options.confirmZip();
    if (!ok) return { type: "cancel" };
    await importLibraryZipAt(path);
    return { type: "zip" };
  }
  const item = await importLibraryItemFromPath(path);
  return { type: "item", item };
}

export async function exportSelectedItems(
  items: { kind: AutomationKind; id: string }[],
  t: TFunction,
): Promise<number> {
  let n = 0;
  for (const it of items) {
    const ok = await exportLibraryItem(it.kind, it.id, t);
    if (ok) n += 1;
  }
  return n;
}
