import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
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
} from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import {
  autocompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { ScriptLanguage } from "./types";
import type { ColorScheme } from "../theme";
import { highlightExtension } from "./scriptCmHighlight";

export type ScriptEditorDiagnostic = {
  from: number;
  to: number;
  message: string;
  severity?: "error" | "warning" | "info";
};

export type ScriptSourceEditorHandle = {
  /** Insert text at the current selection (replaces selection). */
  insertText: (text: string) => void;
  focus: () => void;
};

type Props = {
  value: string;
  language: ScriptLanguage;
  colorScheme: ColorScheme;
  onChange: (source: string) => void;
  onBlur?: () => void;
  ariaLabel: string;
  placeholder?: string;
  diagnostics?: ScriptEditorDiagnostic[];
};

const CASTER_COMPLETIONS = [
  { label: "caster.get", type: "function", detail: "(name)", apply: 'caster.get("")' },
  { label: "caster.set", type: "function", detail: "(name, value)", apply: 'caster.set("", )' },
  { label: "caster.log", type: "function", detail: "(message)", apply: 'caster.log("")' },
  { label: "caster.return", type: "function", detail: "(value) JS", apply: "caster.return()" },
  { label: "caster.ret", type: "function", detail: "(value) Python", apply: "caster.ret()" },
  { label: "caster.fetch", type: "function", detail: "({ method, url })", apply: 'caster.fetch({ method: "GET", url: "" })' },
  { label: "caster.sleep", type: "function", detail: "(ms)", apply: "caster.sleep(200)" },
  { label: "caster.click", type: "function", detail: "({ button, x, y })", apply: 'caster.click({ button: "left" })' },
  { label: "caster.moveTo", type: "function", detail: "(x, y)", apply: "caster.moveTo(0, 0)" },
  { label: "caster.keyTap", type: "function", detail: "(key, mods)", apply: 'caster.keyTap("A")' },
  { label: "caster.include", type: "function", detail: "(idOrName)", apply: 'caster.include("")' },
  { label: "caster.runScript", type: "function", detail: "(id, params?)", apply: 'caster.runScript("")' },
  { label: "caster.runProcess", type: "function", detail: "({ command, args })", apply: 'caster.runProcess({ command: "", args: [], wait: true })' },
  { label: "caster.runMacro", type: "function", detail: "(name)", apply: 'caster.runMacro("")' },
  { label: "caster.clipboardRead", type: "function", detail: "()", apply: "caster.clipboardRead()" },
  { label: "caster.clipboardWrite", type: "function", detail: "(text)", apply: 'caster.clipboardWrite("")' },
  { label: "caster.readFile", type: "function", detail: "(path)", apply: 'caster.readFile("")' },
  { label: "caster.writeFile", type: "function", detail: "(path, text)", apply: 'caster.writeFile("", "")' },
  { label: "caster.parseJson", type: "function", detail: "(text)", apply: "caster.parseJson()" },
  { label: "caster.stringify", type: "function", detail: "(value)", apply: "caster.stringify()" },
];

function languageExtension(language: ScriptLanguage) {
  if (language === "python") return python();
  return javascript({ typescript: language === "typescript" });
}

function casterCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/caster(?:\.\w*)?|\w+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  const typed = word.text.toLowerCase();
  if (!typed.startsWith("cas") && !typed.startsWith("caster") && !context.explicit) {
    return null;
  }
  return {
    from: word.from,
    options: CASTER_COMPLETIONS.filter(
      (c) =>
        typed.length === 0 ||
        c.label.toLowerCase().startsWith(typed) ||
        typed.startsWith("caster"),
    ),
    validFor: /^caster(?:\.\w*)?$/,
  };
}

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

function themeExtension(scheme: ColorScheme): Extension {
  const baseColor = scheme === "dark" ? "#D4D4D4" : "#000000";
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: "13px",
        backgroundColor: "transparent",
        color: baseColor,
      },
      ".cm-scroller": {
        fontFamily:
          "var(--caster-font-mono, ui-monospace, Consolas, monospace)",
        lineHeight: "1.5",
        overflow: "auto",
      },
      ".cm-content": {
        padding: "14px 0",
        caretColor: "var(--caster-accent)",
        color: baseColor,
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
    { dark: scheme === "dark" },
  );
}

export const ScriptSourceEditor = forwardRef<
  ScriptSourceEditorHandle,
  Props
>(function ScriptSourceEditor(
  {
    value,
    language,
    colorScheme,
    onChange,
    onBlur,
    ariaLabel,
    placeholder,
    diagnostics = [],
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langComp = useRef(new Compartment());
  const lintComp = useRef(new Compartment());
  const placeholderComp = useRef(new Compartment());
  const themeComp = useRef(new Compartment());
  const highlightComp = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;

  useImperativeHandle(ref, () => ({
    insertText(text: string) {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      const insert = text.endsWith("\n") ? text : `${text}\n`;
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
        scrollIntoView: true,
      });
      view.focus();
    },
    focus() {
      viewRef.current?.focus();
    },
  }));

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
        highlightComp.current.of(highlightExtension(colorScheme)),
        autocompletion({ override: [casterCompletions] }),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        langComp.current.of(languageExtension(language)),
        lintGutter(),
        lintComp.current.of(updateDiag(diagnostics)),
        placeholderComp.current.of(
          placeholder ? cmPlaceholder(placeholder) : [],
        ),
        themeComp.current.of(themeExtension(colorScheme)),
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
      effects: langComp.current.reconfigure(languageExtension(language)),
    });
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        themeComp.current.reconfigure(themeExtension(colorScheme)),
        highlightComp.current.reconfigure(highlightExtension(colorScheme)),
      ],
    });
  }, [colorScheme]);

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
      data-scheme={colorScheme}
    />
  );
});
