import { useEffect, useState } from "react";

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Third action (e.g. Abandonner) between confirm and cancel. */
  discardLabel?: string;
  danger?: boolean;
};

export type ConfirmOutcome = "confirm" | "discard" | "cancel";

type Pending = ConfirmOptions & {
  resolve: (outcome: ConfirmOutcome) => void;
};

let askFn: ((opts: ConfirmOptions) => Promise<ConfirmOutcome>) | null = null;

export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  return confirmChoice(opts).then((o) => o === "confirm");
}

/** Sauver / Abandonner / Annuler (ou Oui / Non si pas de discardLabel). */
export function confirmChoice(opts: ConfirmOptions): Promise<ConfirmOutcome> {
  if (!askFn) return Promise.resolve("cancel");
  return askFn(opts);
}

function WarningIcon() {
  return (
    <svg
      className="confirm-dialog-icon"
      viewBox="0 0 24 24"
      width="28"
      height="28"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12 3.2 22 20.5H2L12 3.2zm0 5.3c-.5 0-.8.4-.8.9v4.2c0 .5.3.9.8.9s.8-.4.8-.9V9.4c0-.5-.3-.9-.8-.9zm0 8.3c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1z"
      />
    </svg>
  );
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    askFn = (opts) =>
      new Promise((resolve) => {
        setPending({ ...opts, resolve });
      });
    return () => {
      askFn = null;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        pending.resolve("cancel");
        setPending(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  if (!pending) return null;

  const current = pending;
  const confirmLabel = current.confirmLabel ?? "Oui";
  const cancelLabel = current.cancelLabel ?? "Non";
  const discardLabel = current.discardLabel;
  const danger = current.danger !== false;

  function close(outcome: ConfirmOutcome) {
    current.resolve(outcome);
    setPending(null);
  }

  return (
    <div
      className="confirm-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close("cancel");
      }}
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-msg"
      >
        <h2 id="confirm-dialog-title" className="confirm-dialog-title">
          {current.title}
        </h2>
        <div className="confirm-dialog-body">
          <WarningIcon />
          <p id="confirm-dialog-msg">{current.message}</p>
        </div>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className={danger ? "danger" : "primary"}
            autoFocus
            onClick={() => close("confirm")}
          >
            {confirmLabel}
          </button>
          {discardLabel ? (
            <button
              type="button"
              className="ghost"
              onClick={() => close("discard")}
            >
              {discardLabel}
            </button>
          ) : null}
          <button type="button" className="ghost" onClick={() => close("cancel")}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
