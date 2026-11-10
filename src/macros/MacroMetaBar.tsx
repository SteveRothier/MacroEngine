import {
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Pencil } from "lucide-react";
import { useT } from "../i18n";
import { Tooltip } from "../ui/shell";
import type { MacroDocument } from "./types";

type NameProps = {
  doc: MacroDocument;
  locked: boolean;
  onChange: (next: MacroDocument) => void;
  onNameCommit?: (name: string) => void;
};

/** Name — in-place rename; same DOM when editing to avoid layout jump. */
export function MacroMetaBar({
  doc,
  locked,
  onChange,
  onNameCommit,
}: NameProps) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const labelRef = useRef<HTMLSpanElement>(null);
  const doneRef = useRef(false);

  useLayoutEffect(() => {
    if (!editing) return;
    const el = labelRef.current;
    if (!el) return;
    doneRef.current = false;
    el.textContent = doc.name;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing, doc.name]);

  useEffect(() => {
    if (locked) setEditing(false);
  }, [locked]);

  function startEditing() {
    if (locked || editing) return;
    setEditing(true);
  }

  function finish(commit: boolean) {
    if (!editing || doneRef.current) return;
    doneRef.current = true;
    const raw = (labelRef.current?.textContent ?? "").replace(/\u00a0/g, " ");
    const next = raw.trim();
    if (!commit) {
      if (labelRef.current) labelRef.current.textContent = doc.name;
      setEditing(false);
      return;
    }
    const name = next || doc.name;
    if (labelRef.current) labelRef.current.textContent = name;
    setEditing(false);
    if (name !== doc.name) onChange({ ...doc, name });
    onNameCommit?.(name);
  }

  return (
    <div
      className={[
        "caster-macro-meta",
        editing ? "caster-macro-meta--editing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="caster-macro-meta-row caster-macro-meta-row--name">
        <span
          className="caster-macro-meta-name-btn"
          title={editing ? undefined : doc.name}
          aria-label={t("macros.toolbar.metaNameAria")}
          onDoubleClick={startEditing}
        >
          <span
            ref={labelRef}
            className="caster-macro-meta-name-label"
            role={editing ? "textbox" : undefined}
            aria-label={editing ? t("macros.toolbar.metaName") : undefined}
            contentEditable={editing && !locked}
            suppressContentEditableWarning
            spellCheck={false}
            onClick={(e) => {
              if (editing) e.stopPropagation();
            }}
            onDoubleClick={(e) => {
              if (editing) e.stopPropagation();
            }}
            onPointerDown={(e) => {
              if (editing) e.stopPropagation();
            }}
            onKeyDown={(e: ReactKeyboardEvent<HTMLSpanElement>) => {
              if (!editing) return;
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                finish(true);
              } else if (e.key === "Escape") {
                e.preventDefault();
                finish(false);
              }
            }}
            onPaste={(e) => {
              if (!editing) return;
              e.preventDefault();
              const text = e.clipboardData
                .getData("text/plain")
                .replace(/\s+/g, " ");
              document.execCommand("insertText", false, text);
            }}
            onBlur={() => finish(true)}
          >
            {editing ? null : doc.name}
          </span>
        </span>
        {!locked ? (
          <Tooltip content={t("macros.toolbar.metaName")}>
            <button
              type="button"
              className="caster-macro-meta-name-edit"
              tabIndex={editing ? -1 : 0}
              aria-hidden={editing || undefined}
              aria-label={t("macros.toolbar.metaName")}
              onClick={startEditing}
            >
              <Pencil size={13} aria-hidden strokeWidth={2} />
            </button>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}
