import type { AutomationRow, AutomationStatus } from "./types";

export function kindTooltip(row: AutomationRow): string {
  const kind = row.kind === "macro" ? "Macro" : "Clicker preset";
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
