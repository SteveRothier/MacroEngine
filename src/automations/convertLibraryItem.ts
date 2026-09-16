import { invoke } from "@tauri-apps/api/core";
import { confirmBusy, confirmChoice } from "../ui";
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

export type ConvertRunOutcome = {
  result: ConvertResultDto;
  openAfter: boolean;
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

function openAfterFromOutcome(
  outcome: "confirm" | "discard" | "cancel",
): boolean | null {
  if (outcome === "cancel") return null;
  return outcome === "confirm";
}

const choiceLabels = (t: TFunction) => ({
  confirmLabel: t("automations.convert.confirmOpen"),
  discardLabel: t("automations.convert.confirmOnly"),
  cancelLabel: t("common.cancel"),
  danger: false as const,
});

/** Ask Convert+open / Convert only / Cancel. Returns null if cancelled. */
async function askConvertOpenChoice(
  t: TFunction,
  opts: { title: string; message: string },
): Promise<boolean | null> {
  const outcome = await confirmChoice({
    title: opts.title,
    message: opts.message,
    ...choiceLabels(t),
  });
  return openAfterFromOutcome(outcome);
}

/** Create a new item from conversion. Returns null if cancelled / refused. */
export async function runLibraryConvert(opts: {
  fromKind: AutomationKind;
  id: string;
  toKind: AutomationKind;
  name: string;
  t: TFunction;
}): Promise<ConvertRunOutcome | null> {
  const { fromKind, id, toKind, name, t } = opts;
  const preferredMode =
    fromKind === "macro" && toKind === "script" ? "transpile" : "wrap";

  const openAfter = await askConvertOpenChoice(t, {
    title: t("automations.convert.confirmTitle"),
    message: t("automations.convert.confirmMessage", {
      name,
      to: t(`automations.convert.kind.${toKind}`),
    }),
  });
  if (openAfter == null) return null;

  // Cover Accueil immediately so invoke / wrap dialog never flash the list.
  const hold = confirmBusy({
    title: t("automations.convert.workingTitle"),
    message: t("automations.convert.workingMessage"),
  });

  try {
    const result = await invoke<ConvertResultDto>("convert_library_item_cmd", {
      fromKind,
      id,
      toKind,
      mode: preferredMode,
    });
    hold.release();
    return { result, openAfter };
  } catch (e) {
    const msg = typeof e === "string" ? e : String(e);
    if (
      preferredMode === "transpile" &&
      fromKind === "macro" &&
      toKind === "script"
    ) {
      const wrapOutcome = await hold.replaceChoice({
        title: t("automations.convert.wrapTitle"),
        message: t("automations.convert.wrapMessage", { detail: msg }),
        ...choiceLabels(t),
      });
      const wrapOpen = openAfterFromOutcome(wrapOutcome);
      if (wrapOpen == null) return null;

      const hold2 = confirmBusy({
        title: t("automations.convert.workingTitle"),
        message: t("automations.convert.workingMessage"),
      });
      try {
        const result = await invoke<ConvertResultDto>(
          "convert_library_item_cmd",
          {
            fromKind,
            id,
            toKind,
            mode: "wrap",
          },
        );
        hold2.release();
        return { result, openAfter: wrapOpen };
      } catch (err) {
        hold2.release();
        throw err;
      }
    }
    hold.release();
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
