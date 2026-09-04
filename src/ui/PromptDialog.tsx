import { useEffect, useState } from "react";

export type PromptOptions = {
  title: string;
  message?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
};

type Pending = PromptOptions & {
  resolve: (value: string | null) => void;
};

let promptFn: ((opts: PromptOptions) => Promise<string | null>) | null = null;

export function promptAction(opts: PromptOptions): Promise<string | null> {
  if (!promptFn) return Promise.resolve(null);
  return promptFn(opts);
}

export function PromptHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    promptFn = (opts) =>
      new Promise((resolve) => {
        setValue(opts.defaultValue ?? "");
        setPending({ ...opts, resolve });
      });
    return () => {
      promptFn = null;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        pending.resolve(null);
        setPending(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  if (!pending) return null;

  const current = pending;

  function close(result: string | null) {
    current.resolve(result);
    setPending(null);
  }

  return (
    <div
      className="confirm-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close(null);
      }}
    >
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-dialog-title"
      >
        <h2 id="prompt-dialog-title" className="confirm-dialog-title">
          {current.title}
        </h2>
        <div className="confirm-dialog-body prompt-dialog-body">
          {current.message ? <p>{current.message}</p> : null}
          <input
            type="text"
            className="prompt-dialog-input"
            value={value}
            placeholder={current.placeholder}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const trimmed = value.trim();
                if (trimmed) close(trimmed);
              }
            }}
          />
        </div>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              const trimmed = value.trim();
              if (trimmed) close(trimmed);
            }}
          >
            {current.confirmLabel ?? "OK"}
          </button>
          <button type="button" className="ghost" onClick={() => close(null)}>
            {current.cancelLabel ?? "Annuler"}
          </button>
        </div>
      </div>
    </div>
  );
}
