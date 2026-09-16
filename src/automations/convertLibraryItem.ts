import { invoke } from "@tauri-apps/api/core";
import { confirmAction } from "../ui";
import type { TFunction } from "../i18n";
import type { AutomationKind } from "./types";

export type ConvertResultDto = {
  newId: string;
  newName: string;
  toKind: string;
  report: {
    kept: string[];
    dropped: string[];
    warnings: string[];
  };
};

export function convertTargetsFor(
  kind: AutomationKind,
): AutomationKind[] {
  switch (kind) {
    case "script":
      return ["macro"];
    case "macro":
      return ["script"];
    case "clicker":
      return ["macro", "script"];
  }
}

function formatReport(
  report: ConvertResultDto["report"],
  t: TFunction,
): string {
  const lines: string[] = [];
  if (report.kept.length) {
    lines.push(
      t("automations.convert.kept", { list: report.kept.join(", ") }),
    );
  }
  if (report.dropped.length) {
    lines.push(
      t("automations.convert.dropped", { list: report.dropped.join(", ") }),
    );
  }
  if (report.warnings.length) {
    lines.push(report.warnings.join("\n"));
  }
  return lines.join("\n");
}

/** Create a new item from conversion. Returns null if cancelled / refused. */
export async function runLibraryConvert(opts: {
  fromKind: AutomationKind;
  id: string;
  toKind: AutomationKind;
  name: string;
  t: TFunction;
}): Promise<ConvertResultDto | null> {
  const { fromKind, id, toKind, name, t } = opts;
  const preferredMode =
    fromKind === "macro" && toKind === "script" ? "transpile" : "wrap";

  const confirmFirst = await confirmAction({
    title: t("automations.convert.confirmTitle"),
    message: t("automations.convert.confirmMessage", {
      name,
      to: t(`automations.convert.kind.${toKind}`),
    }),
    confirmLabel: t("automations.convert.confirm"),
  });
  if (!confirmFirst) return null;

  try {
    return await invoke<ConvertResultDto>("convert_library_item_cmd", {
      fromKind,
      id,
      toKind,
      mode: preferredMode,
    });
  } catch (e) {
    const msg = typeof e === "string" ? e : String(e);
    if (
      preferredMode === "transpile" &&
      fromKind === "macro" &&
      toKind === "script"
    ) {
      const wrap = await confirmAction({
        title: t("automations.convert.wrapTitle"),
        message: t("automations.convert.wrapMessage", { detail: msg }),
        confirmLabel: t("automations.convert.wrapConfirm"),
      });
      if (!wrap) return null;
      return await invoke<ConvertResultDto>("convert_library_item_cmd", {
        fromKind,
        id,
        toKind,
        mode: "wrap",
      });
    }
    throw e;
  }
}

export function convertSuccessMessage(
  result: ConvertResultDto,
  t: TFunction,
): string {
  const base = t("automations.convert.success", {
    name: result.newName,
    kind: t(`automations.convert.kind.${result.toKind}`),
  });
  const report = formatReport(result.report, t);
  return report ? `${base}\n${report}` : base;
}
