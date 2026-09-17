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

export type ConvertBatchItem = {
  fromKind: AutomationKind;
  id: string;
  name: string;
};

export type ConvertBatchOutcome = {
  openAfter: boolean;
  ok: ConvertResultDto[];
  failed: { name: string; error: string }[];
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

/** Intersection of convert targets for unlocked rows (empty if none). */
export function commonConvertTargets(
  rows: { kind: AutomationKind; locked?: boolean }[],
): AutomationKind[] {
  const unlocked = rows.filter((r) => !r.locked);
  if (unlocked.length === 0) return [];
  let common: Set<AutomationKind> | null = null;
  for (const r of unlocked) {
    const targets = new Set(convertTargetsFor(r.kind));
    common = common
      ? new Set([...common].filter((k) => targets.has(k)))
      : targets;
  }
  return common ? [...common] : [];
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

const BLOCKER_PREFIX = "transpile blocked by:";

/** Map backend blocker codes to localized labels for the wrap dialog. */
export function formatTranspileBlockers(msg: string, t: TFunction): string {
  const trimmed = msg.trim();
  const raw = trimmed.toLowerCase().startsWith(BLOCKER_PREFIX)
    ? trimmed.slice(BLOCKER_PREFIX.length).trim()
    : trimmed;
  const codes = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (codes.length === 0) return trimmed;
  return codes
    .map((code) => {
      switch (code) {
        case "process.run":
          return t("automations.convert.blockers.processRun");
        case "control.if":
          return t("automations.convert.blockers.controlIf");
        case "control.while":
          return t("automations.convert.blockers.controlWhile");
        default:
          return t("automations.convert.blockers.other", { code });
      }
    })
    .join(", ");
}

const choiceLabels = (t: TFunction) => ({
  confirmLabel: t("automations.convert.confirmOpen"),
  discardLabel: t("automations.convert.confirmOnly"),
  cancelLabel: t("common.cancel"),
  danger: false as const,
});

function preferredMode(
  fromKind: AutomationKind,
  toKind: AutomationKind,
): "transpile" | "wrap" {
  return fromKind === "macro" && toKind === "script" ? "transpile" : "wrap";
}

async function invokeConvert(
  fromKind: AutomationKind,
  id: string,
  toKind: AutomationKind,
  mode: "transpile" | "wrap",
): Promise<ConvertResultDto> {
  return invoke<ConvertResultDto>("convert_library_item_cmd", {
    fromKind,
    id,
    toKind,
    mode,
  });
}

/** Transpile then auto-wrap on blocker (no dialog). */
export async function convertOneSilent(opts: {
  fromKind: AutomationKind;
  id: string;
  toKind: AutomationKind;
}): Promise<ConvertResultDto> {
  const mode = preferredMode(opts.fromKind, opts.toKind);
  try {
    return await invokeConvert(opts.fromKind, opts.id, opts.toKind, mode);
  } catch (e) {
    if (
      mode === "transpile" &&
      opts.fromKind === "macro" &&
      opts.toKind === "script"
    ) {
      return await invokeConvert(opts.fromKind, opts.id, opts.toKind, "wrap");
    }
    throw e;
  }
}

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
  const mode = preferredMode(fromKind, toKind);

  const openAfter = await askConvertOpenChoice(t, {
    title: t("automations.convert.confirmTitle"),
    message: t("automations.convert.confirmMessage", {
      name,
      to: t(`automations.convert.kind.${toKind}`),
    }),
  });
  if (openAfter == null) return null;

  const hold = confirmBusy({
    title: t("automations.convert.workingTitle"),
    message: t("automations.convert.workingMessage"),
  });

  try {
    const result = await invokeConvert(fromKind, id, toKind, mode);
    hold.release();
    return { result, openAfter };
  } catch (e) {
    const msg = typeof e === "string" ? e : String(e);
    if (mode === "transpile" && fromKind === "macro" && toKind === "script") {
      const wrapOutcome = await hold.replaceChoice({
        title: t("automations.convert.wrapTitle"),
        message: t("automations.convert.wrapMessage", {
          detail: formatTranspileBlockers(msg, t),
        }),
        ...choiceLabels(t),
      });
      const wrapOpen = openAfterFromOutcome(wrapOutcome);
      if (wrapOpen == null) return null;

      const hold2 = confirmBusy({
        title: t("automations.convert.workingTitle"),
        message: t("automations.convert.workingMessage"),
      });
      try {
        const result = await invokeConvert(fromKind, id, toKind, "wrap");
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

/** Convert several items with one confirm + hold overlay. */
export async function runLibraryConvertBatch(opts: {
  items: ConvertBatchItem[];
  toKind: AutomationKind;
  t: TFunction;
}): Promise<ConvertBatchOutcome | null> {
  const { items, toKind, t } = opts;
  if (items.length === 0) return null;

  const openAfter = await askConvertOpenChoice(t, {
    title: t("automations.convert.batchTitle"),
    message: t("automations.convert.batchMessage", {
      count: items.length,
      to: t(`automations.convert.kind.${toKind}`),
    }),
  });
  if (openAfter == null) return null;

  const hold = confirmBusy({
    title: t("automations.convert.workingTitle"),
    message: t("automations.convert.workingMessage"),
  });

  const ok: ConvertResultDto[] = [];
  const failed: { name: string; error: string }[] = [];

  try {
    for (const item of items) {
      try {
        const result = await convertOneSilent({
          fromKind: item.fromKind,
          id: item.id,
          toKind,
        });
        ok.push(result);
      } catch (e) {
        failed.push({
          name: item.name,
          error: typeof e === "string" ? e : String(e),
        });
      }
    }
  } finally {
    hold.release();
  }

  return { openAfter, ok, failed };
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

export function convertBatchSummaryMessage(
  outcome: ConvertBatchOutcome,
  t: TFunction,
): string {
  const lines = [
    t("automations.convert.batchSummary", {
      ok: outcome.ok.length,
      fail: outcome.failed.length,
    }),
  ];
  for (const f of outcome.failed.slice(0, 3)) {
    lines.push(`${f.name}: ${f.error}`);
  }
  if (outcome.failed.length > 3) {
    lines.push(
      t("automations.convert.batchMoreFails", {
        count: outcome.failed.length - 3,
      }),
    );
  }
  const dropped = new Set<string>();
  for (const r of outcome.ok) {
    for (const d of r.report.dropped) dropped.add(d);
  }
  if (dropped.size) {
    lines.push(
      t("automations.convert.dropped", {
        list: [...dropped].slice(0, 8).join(", "),
      }),
    );
  }
  return lines.join("\n");
}
