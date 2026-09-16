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
  /** Non-interactive hold (no buttons / Escape). */
  busy?: boolean;
};

export type ConfirmOutcome = "confirm" | "discard" | "cancel";

type Pending = ConfirmOptions & {
  resolve: (outcome: ConfirmOutcome) => void;
  token: number;
};

type PushPending = (
  next: Pending | null | ((prev: Pending | null) => Pending | null),
) => void;

let askFn: ((opts: ConfirmOptions) => Promise<ConfirmOutcome>) | null = null;
let pushPending: PushPending | null = null;
let pendingSeq = 0;

export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  return confirmChoice(opts).then((o) => o === "confirm");
}

/** Sauver / Abandonner / Annuler (ou Oui / Non si pas de discardLabel). */
export function confirmChoice(opts: ConfirmOptions): Promise<ConfirmOutcome> {
  if (!askFn) return Promise.resolve("cancel");
  return askFn(opts);
}

export type ConfirmHold = {
  /** Drop the busy overlay (deferred-safe). */
  release: () => void;
  /** Replace busy overlay in-place with a normal choice dialog. */
  replaceChoice: (opts: ConfirmOptions) => Promise<ConfirmOutcome>;
};

/**
 * Keep the confirm overlay mounted with a busy (non-interactive) state.
 * Use after a confirmChoice resolve so Accueil never flashes between steps.
 */
export function confirmBusy(opts: {
  title: string;
  message: string;
}): ConfirmHold {
  const token = ++pendingSeq;
  if (!pushPending) {
    return {
      release: () => undefined,
      replaceChoice: (o) => confirmChoice(o),
    };
  }
  pushPending({
    title: opts.title,
    message: opts.message,
    busy: true,
    danger: false,
    resolve: () => undefined,
    token,
  });
  return {
    release: () => {
      pushPending?.((p) => (p?.token === token ? null : p));
    },
    replaceChoice: (opts) => {
      if (!pushPending) return Promise.resolve("cancel" as const);
      return new Promise((resolve) => {
        pushPending!({
          ...opts,
          resolve,
          token: ++pendingSeq,
          busy: false,
        });
      });
    },
  };
}

export function ConfirmHost() {
  const t = useT();
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    pushPending = setPending;
    askFn = (opts) =>
      new Promise((resolve) => {
        setPending({
          ...opts,
          resolve,
          token: ++pendingSeq,
        });
      });
    return () => {
      askFn = null;
      pushPending = null;
    };
  }, []);

  useEffect(() => {
    if (!pending || pending.busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        const token = pending.token;
        pending.resolve("cancel");
        queueMicrotask(() => {
          setPending((p) => (p?.token === token ? null : p));
        });
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
  const busy = current.busy === true;

  function close(outcome: ConfirmOutcome) {
    const token = current.token;
    current.resolve(outcome);
    // Defer clear so the next confirmChoice/confirmBusy in the same turn
    // can replace pending without unmounting the overlay.
    queueMicrotask(() => {
      setPending((p) => (p?.token === token ? null : p));
    });
  }

  return (
    <div
      className="caster-dialog-overlay"
      onMouseDown={(e) => {
        if (busy) return;
        if (e.target === e.currentTarget) close("cancel");
      }}
    >
      <div
        className="caster-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-msg"
        aria-busy={busy || undefined}
      >
        <h2 id="confirm-dialog-title" className="caster-dialog-title">
          {current.title}
        </h2>
        <div className="caster-dialog-body">
          <AlertTriangle
            className={
              danger && !busy
                ? "caster-dialog-icon caster-dialog-icon--danger"
                : "caster-dialog-icon"
            }
            size={22}
            aria-hidden
          />
          <p id="confirm-dialog-msg">{current.message}</p>
        </div>
        {busy ? null : (
          <div className="caster-dialog-actions">
            <button
              type="button"
              className={
                danger
                  ? "caster-btn caster-btn-danger"
                  : "caster-btn caster-btn-primary"
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
        )}
      </div>
    </div>
  );
}
