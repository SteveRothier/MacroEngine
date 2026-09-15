import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useT } from "../i18n";

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

export function ConfirmHost() {
  const t = useT();
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
  const confirmLabel = current.confirmLabel ?? t("common.yes");
  const cancelLabel = current.cancelLabel ?? t("common.no");
  const discardLabel = current.discardLabel;
  const danger = current.danger !== false;

  function close(outcome: ConfirmOutcome) {
    current.resolve(outcome);
    setPending(null);
  }

  return (
    <div
      className="caster-dialog-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close("cancel");
      }}
    >
      <div
        className="caster-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-msg"
      >
        <h2 id="confirm-dialog-title" className="caster-dialog-title">
          {current.title}
        </h2>
        <div className="caster-dialog-body">
          <AlertTriangle
            className={
              danger ? "caster-dialog-icon caster-dialog-icon--danger" : "caster-dialog-icon"
            }
            size={22}
            aria-hidden
          />
          <p id="confirm-dialog-msg">{current.message}</p>
        </div>
        <div className="caster-dialog-actions">
          <button
            type="button"
            className={
              danger ? "caster-btn caster-btn-danger" : "caster-btn caster-btn-primary"
            }
            autoFocus
            onClick={() => close("confirm")}
          >
            {confirmLabel}
          </button>
          {discardLabel ? (
            <button
              type="button"
              className="caster-btn caster-btn-ghost"
              onClick={() => close("discard")}
            >
              {discardLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="caster-btn caster-btn-ghost"
            onClick={() => close("cancel")}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
