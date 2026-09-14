/** Shared engine status labels (FR/EN via i18n). */

import type { EngineStatus } from "../macros/types";
import { tStatic, type AppLocale } from "../i18n";

export function stateLabel(locale: AppLocale, state: string): string {
  switch (state) {
    case "idle":
      return tStatic(locale, "labels.idle");
    case "running":
      return tStatic(locale, "labels.running");
    case "paused":
      return tStatic(locale, "labels.paused");
    case "stopping":
      return tStatic(locale, "labels.stopping");
    default:
      return state;
  }
}

export function runningPillLabel(locale: AppLocale, running: boolean): string {
  return running
    ? tStatic(locale, "labels.active")
    : tStatic(locale, "labels.stopped");
}

/** What is running — for Automations, dock, statusbar. */
export function sessionLabel(
  locale: AppLocale,
  status: EngineStatus,
): string | null {
  const busy =
    status.state === "running" ||
    status.state === "paused" ||
    status.state === "stopping";
  if (!busy) return null;
  const kind = status.sessionKind;
  const name = status.sessionName?.trim();
  if (kind === "macro") {
    return name
      ? tStatic(locale, "labels.macroNamed", { name })
      : tStatic(locale, "labels.macro");
  }
  if (kind === "clicker") {
    return name
      ? tStatic(locale, "labels.clickerNamed", { name })
      : tStatic(locale, "labels.clicker");
  }
  if (kind === "record") {
    return name
      ? tStatic(locale, "labels.recordNamed", { name })
      : tStatic(locale, "labels.record");
  }
  if (kind === "script") {
    return name
      ? tStatic(locale, "labels.scriptNamed", { name })
      : tStatic(locale, "labels.script");
  }
  return null;
}

/** @deprecated Use stateLabel(locale, state). */
export function stateLabelFr(state: string): string {
  return stateLabel("fr", state);
}

/** @deprecated Use sessionLabel(locale, status). */
export function sessionLabelFr(status: EngineStatus): string | null {
  return sessionLabel("fr", status);
}

/** Hide engine-internal status strings from the chrome. */
export function statusMessageFr(message?: string | null): string | null {
  if (!message) return null;
  const msg = message.trim();
  if (!msg) return null;
  if (/^state:/i.test(msg)) return null;
  if (/^(running|paused|resumed|stop requested|emergency stop)$/i.test(msg)) {
    return null;
  }
  if (/^(clicker:|macro:)/i.test(msg)) return null;
  return msg;
}
