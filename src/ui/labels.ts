/** Libellés UI français partagés. */

import type { EngineStatus } from "../macros/types";

export function stateLabelFr(state: string): string {
  switch (state) {
    case "idle":
      return "Inactif";
    case "running":
      return "En cours";
    case "paused":
      return "En pause";
    case "stopping":
      return "Arrêt…";
    default:
      return state;
  }
}

export function runningPillLabel(running: boolean): string {
  return running ? "Actif" : "Arrêt";
}

/** What is running — for Automations, dock, statusbar. */
export function sessionLabelFr(status: EngineStatus): string | null {
  const busy =
    status.state === "running" ||
    status.state === "paused" ||
    status.state === "stopping";
  if (!busy) return null;
  const kind = status.sessionKind;
  const name = status.sessionName?.trim();
  if (kind === "macro") {
    return name ? `Macro « ${name} »` : "Macro";
  }
  if (kind === "clicker") {
    return name ? `Clicker · ${name}` : "Clicker";
  }
  if (kind === "record") {
    return name ? `Enregistrement « ${name} »` : "Enregistrement";
  }
  if (kind === "script") {
    return name ? `Script « ${name} »` : "Script";
  }
  return null;
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
