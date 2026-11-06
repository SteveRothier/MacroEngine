import { useT } from "../../i18n";

export type StatusBarState = "idle" | "running" | "paused" | "error";

type Props = {
  state?: StatusBarState;
  label?: string;
  hotkeyHint?: string | null;
  timerLabel?: string | null;
  message?: string | null;
};

export function StatusBar({
  state = "idle",
  label,
  hotkeyHint,
  timerLabel,
  message,
}: Props) {
  const t = useT();
  const resolvedLabel =
    label ??
    (state === "running"
      ? t("shell.exec.running")
      : state === "paused"
        ? t("shell.exec.paused")
        : state === "error"
          ? t("shell.errorTitle")
          : t("shell.exec.ready"));

  const dotClass =
    state === "running"
      ? "is-running"
      : state === "paused"
        ? "is-paused"
        : state === "error"
          ? "is-error"
          : "is-ready";

  return (
    <div className="caster-status-bar" role="status" aria-live="polite">
      <span className={`caster-status-bar-dot ${dotClass}`} aria-hidden />
      <span className="caster-status-bar-label">{resolvedLabel}</span>
      {message ? (
        <span className="caster-status-bar-meta">{message}</span>
      ) : null}
      <span className="caster-status-bar-spacer" />
      {hotkeyHint ? (
        <span className="caster-status-bar-meta">{hotkeyHint}</span>
      ) : null}
      {timerLabel ? (
        <span className="caster-status-bar-timer">{timerLabel}</span>
      ) : null}
    </div>
  );
}
