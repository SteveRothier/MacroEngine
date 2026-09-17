import { useEffect, useState } from "react";
import { Code2 } from "lucide-react";
import { useT } from "../i18n";

export type ScriptLanguageChoice = "javascript" | "typescript";

export type ScriptLanguageDialogOptions = {
  title: string;
  message: string;
  javascriptLabel?: string;
  typescriptLabel?: string;
  cancelLabel?: string;
};

type Pending = ScriptLanguageDialogOptions & {
  resolve: (value: ScriptLanguageChoice | null) => void;
};

let askFn:
  | ((opts: ScriptLanguageDialogOptions) => Promise<ScriptLanguageChoice | null>)
  | null = null;

/** Dedicated JS | TS | Cancel picker (not confirm/discard). */
export function askScriptLanguage(
  opts: ScriptLanguageDialogOptions,
): Promise<ScriptLanguageChoice | null> {
  if (!askFn) return Promise.resolve(null);
  return askFn(opts);
}

export function ScriptLanguageHost() {
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
        pending.resolve(null);
        setPending(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  if (!pending) return null;

  const current = pending;
  const jsLabel =
    current.javascriptLabel ?? t("automations.convert.languageJs");
  const tsLabel =
    current.typescriptLabel ?? t("automations.convert.languageTs");
  const cancelLabel = current.cancelLabel ?? t("common.cancel");

  function close(value: ScriptLanguageChoice | null) {
    current.resolve(value);
    setPending(null);
  }

  return (
    <div
      className="caster-dialog-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close(null);
      }}
    >
      <div
        className="caster-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="script-lang-dialog-title"
        aria-describedby="script-lang-dialog-msg"
      >
        <h2 id="script-lang-dialog-title" className="caster-dialog-title">
          {current.title}
        </h2>
        <div className="caster-dialog-body">
          <Code2 className="caster-dialog-icon" size={22} aria-hidden />
          <p id="script-lang-dialog-msg">{current.message}</p>
        </div>
        <div className="caster-dialog-actions caster-dialog-actions--lang">
          <button
            type="button"
            className="caster-btn caster-btn-primary"
            autoFocus
            onClick={() => close("javascript")}
          >
            {jsLabel}
          </button>
          <button
            type="button"
            className="caster-btn caster-btn-primary"
            onClick={() => close("typescript")}
          >
            {tsLabel}
          </button>
          <button
            type="button"
            className="caster-btn caster-btn-ghost"
            onClick={() => close(null)}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
