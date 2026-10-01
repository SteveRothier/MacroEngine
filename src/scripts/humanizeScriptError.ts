import type { TFunction } from "../i18n";
import {
  permissionFromErrorMessage,
  permLabelKey,
} from "./scriptApiPerms";

/** Shared humanization for script run / launch errors (editor + Accueil). */
export function humanizeScriptError(raw: string, t: TFunction): string {
  const s = String(raw);

  if (s === "module_not_runnable" || /module_not_runnable/i.test(s)) {
    return t("scripts.module.runBlocked");
  }
  if (s === "script_timeout" || /script_timeout|timed?\s*out|timeout/i.test(s)) {
    return t("scripts.toast.timeout");
  }
  if (/engine already|already active|clicker is active|record is active/i.test(s)) {
    return t("scripts.toast.engineBusy");
  }
  if (
    /process[_ ]?filter|filtre process|not in allow|blocked by process|exe not allowed/i.test(
      s,
    )
  ) {
    return t("scripts.toast.processFilterBlocked");
  }
  if (
    /input (permission|denied)|allowInput|permission.*input|Input.*manquante/i.test(
      s,
    )
  ) {
    return t("scripts.toast.inputPermission");
  }

  const assertMatch = s.match(/assertion failed(?::\s*(.*))?/i);
  if (assertMatch) {
    const detail = (assertMatch[1] ?? "").trim();
    return detail
      ? t("scripts.toast.assertionFailedDetail", { detail })
      : t("scripts.toast.assertionFailed");
  }

  const perm = permissionFromErrorMessage(s);
  if (perm) {
    return t("scripts.toast.permissionDenied", {
      permission: t(permLabelKey(perm)),
    });
  }

  if (/network|fetch disabled|allowNetwork|réseau/i.test(s)) {
    return t("scripts.toast.networkDenied");
  }

  return s.startsWith("Erreur") || s.startsWith("Error")
    ? s
    : t("scripts.toast.errorPrefix", { detail: s });
}
