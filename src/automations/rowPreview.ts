import type { TFunction } from "../i18n";
import type { AutomationRow } from "./types";

/** Rich hover lines for Accueil row preview. */
export function rowPreviewLines(row: AutomationRow, t: TFunction): string[] {
  const lines: string[] = [];
  if (row.triggerLabel) {
    lines.push(t("automations.row.previewTrigger", { label: row.triggerLabel }));
  }
  if (row.kind === "macro" && row.previewActionCount != null) {
    lines.push(
      t("automations.row.previewActions", { count: row.previewActionCount }),
    );
  }
  if (
    row.kind === "clicker" &&
    row.previewCps != null &&
    row.previewMode
  ) {
    lines.push(
      t("automations.row.previewCps", {
        cps: row.previewCps,
        mode: row.previewMode,
      }),
    );
  }
  if (row.kind === "script") {
    const lang =
      row.scriptLanguage === "typescript" ? "TypeScript" : "JavaScript";
    const perms =
      row.permLabels && row.permLabels.length > 0
        ? row.permLabels.join(", ")
        : "—";
    lines.push(t("automations.row.previewScript", { lang, perms }));
  }
  if (row.folderLabel) {
    lines.push(row.folderLabel);
  }
  if (row.conflictWith) {
    lines.push(
      t("automations.row.conflictTip", { name: row.conflictWith.name }),
    );
  } else if (row.conflictWith === null && row.triggerLabel) {
    /* reserved conflicts use conflictReserved when flagged — optional */
  }
  return lines;
}
