import { useEffect, useRef } from "react";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  placeholder as cmPlaceholder,
} from "@codemirror/view";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import type { ScriptLanguage } from "./types";

export type ScriptEditorDiagnostic = {
  from: number;
  to: number;
  message: string;
  severity?: "error" | "warning" | "info";
};

type Props = {
  value: string;
  language: ScriptLanguage;
  onChange: (source: string) => void;
  onBlur?: () => void;
  ariaLabel: string;
  placeholder?: string;
  diagnostics?: ScriptEditorDiagnostic[];
};

/** Map engine / transpile errors that mention a line to a CM span. */
export function diagnosticsFromError(
  source: string,
  raw: string,
): ScriptEditorDiagnostic[] {
  const msg = String(raw).trim();
  if (!msg) return [];
  const lineMatch =
    msg.match(/\bline\s+(\d+)\b/i) ||
    msg.match(/\bL(\d+)\b/) ||
    msg.match(/:(\d+):(\d+)/);
  if (!lineMatch) {
    return [{ from: 0, to: Math.min(1, source.length), message: msg }];
  }
  const line = Math.max(1, Number(lineMatch[1]));
  const lines = source.split(/\r?\n/);
  let from = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    from += lines[i]!.length + 1;
  }
  const lineText = lines[line - 1] ?? "";
  const to = from + Math.max(lineText.length, 1);
  return [{ from, to: Math.min(to, source.length || 1), message: msg }];
}

function themeExtension(): Extension {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: "13px",
        backgroundColor: "transparent",
      },
      ".cm-scroller": {
        fontFamily:
          "var(--caster-font-mono, ui-monospace, Consolas, monospace)",
        lineHeight: "1.5",
        overflow: "auto",
      },
      ".cm-content": {
        padding: "14px 0",
        caretColor: "var(--caster-text-primary)",
        color: "var(--caster-text-primary)",
      },
      ".cm-gutters": {
        backgroundColor:
          "color-mix(in srgb, var(--caster-bg-elevated) 70%, transparent)",
        color: "var(--caster-text-muted)",
        border: "none",
        borderRight: "1px solid var(--caster-border-subtle)",
      },
      ".cm-activeLineGutter": {
        backgroundColor:
          "color-mix(in srgb, var(--caster-accent) 12%, transparent)",
      },
      ".cm-activeLine": {
        backgroundColor:
          "color-mix(in srgb, var(--caster-accent) 8%, transparent)",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        backgroundColor:
          "color-mix(in srgb, var(--caster-accent) 28%, transparent) !important",
      },
      ".cm-cursor": {
        borderLeftColor: "var(--caster-accent)",
      },
      ".cm-placeholder": {
        color: "var(--caster-text-muted)",
        opacity: "0.7",
      },
    },
    { dark: true },
  );
}

export function ScriptSourceEditor({
  value,
  language,
  onChange,
  onBlur,
  ariaLabel,
  placeholder,
  diagnostics = [],
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langComp = useRef(new Compartment());
  const lintComp = useRef(new Compartment());
  const placeholderComp = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateDiag = (diags: ScriptEditorDiagnostic[]): Extension =>
      linter(() =>
        diags.map(
          (d): Diagnostic => ({
            from: d.from,
            to: Math.max(d.to, d.from + (d.from === d.to ? 1 : 0)),
            severity: d.severity ?? "error",
            message: d.message,
          }),
        ),
      );

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        foldGutter(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        history(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        langComp.current.of(
          javascript({ typescript: language === "typescript" }),
        ),
        lintGutter(),
        lintComp.current.of(updateDiag(diagnostics)),
        placeholderComp.current.of(
          placeholder ? cmPlaceholder(placeholder) : [],
        ),
        themeExtension(),
        EditorView.editorAttributes.of({
          "aria-label": ariaLabel,
          role: "textbox",
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            onChangeRef.current(u.state.doc.toString());
          }
        }),
        EditorView.domEventHandlers({
          blur: () => {
            onBlurRef.current?.();
            return false;
          },
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount once; sync via effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur === value) return;
    view.dispatch({
      changes: { from: 0, to: cur.length, insert: value },
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: langComp.current.reconfigure(
        javascript({ typescript: language === "typescript" }),
      ),
    });
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: lintComp.current.reconfigure(
        linter(() =>
          diagnostics.map(
            (d): Diagnostic => ({
              from: d.from,
              to: Math.max(d.to, d.from + (d.from === d.to ? 1 : 0)),
              severity: d.severity ?? "error",
              message: d.message,
            }),
          ),
        ),
      ),
    });
  }, [diagnostics]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: placeholderComp.current.reconfigure(
        placeholder ? cmPlaceholder(placeholder) : [],
      ),
    });
  }, [placeholder]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dom.setAttribute("aria-label", ariaLabel);
  }, [ariaLabel]);

  return (
    <div
      ref={hostRef}
      className="caster-script-cm"
      data-language={language}
    />
  );
}
