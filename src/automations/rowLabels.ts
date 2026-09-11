import type { AutomationRow, AutomationStatus } from "./types";

export function kindTooltip(row: AutomationRow): string {
  const kind =
    row.kind === "macro"
      ? "Macro"
      : row.kind === "clicker"
        ? "Clicker preset"
        : "Script";
  if (row.folderLabel && row.folderLabel !== "—") {
    return `${kind} · Dossier : ${row.folderLabel}`;
  }
  return kind;
}

export function metaTooltip(row: AutomationRow): string {
  const parts = [
    row.triggerLabel,
    row.folderLabel !== "—" ? row.folderLabel : null,
    row.lastRunLabel,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function statusTooltip(status: AutomationStatus): string {
  switch (status) {
    case "attention":
      return "Modifications non enregistrées";
    case "locked":
      return "Verrouillé";
    case "failed":
      return "Erreur d'exécution";
    case "healthy":
      return "OK";
  }
}

export function favoriteTooltip(favorite: boolean): string {
  return favorite ? "Retirer des favoris" : "Ajouter aux favoris";
}

export function sortByLabel(sortBy: "name" | "type" | "status"): string {
  switch (sortBy) {
    case "name":
      return "Nom";
    case "type":
      return "Type";
    case "status":
      return "Statut";
  }
}

export function filterPillTooltip(
  filter: "all" | "favorites" | "recent" | "scripts",
): string {
  switch (filter) {
    case "all":
      return "Toutes les automations";
    case "favorites":
      return "Favoris uniquement";
    case "recent":
      return "Dernières exécutions";
    case "scripts":
      return "Scripts JavaScript réutilisables";
  }
}

/** Secondary line under the name (Linear-style) — never repeats the type badge. */
export function rowSubtitle(
  row: AutomationRow,
  opts?: { running?: boolean },
): string | null {
  if (opts?.running) return "En cours";
  if (row.kind === "script") {
    const n = row.permLabels?.length ?? 0;
    if (n > 0) return `${n} accès`;
    if (row.lastRunLabel !== "—") return row.lastRunLabel;
    return null;
  }
  const parts: string[] = [];
  if (row.meta?.trim()) parts.push(row.meta.trim());
  if (row.folderLabel && row.folderLabel !== "—") parts.push(row.folderLabel);
  if (parts.length > 0) return parts.join(" · ");
  if (row.lastRunLabel !== "—") return row.lastRunLabel;
  if (row.triggerLabel && row.triggerLabel !== "Manuel") return row.triggerLabel;
  return null;
}
