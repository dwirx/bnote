import { useEffect, useRef } from "react";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
  type LanguageSupport,
} from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { EditorSettings, FileDocument } from "@/types";

type CodeEditorProps = {
  document: FileDocument;
  value: string;
  settings: EditorSettings;
  readOnly?: boolean;
  onChange: (content: string) => void;
};

function languageFor(document: FileDocument): LanguageSupport | Extension {
  const extension = document.extension?.toLowerCase() ?? "";

  if (extension === "md" || extension === "mdx") return markdown();
  if (extension === "json") return json();
  if (extension === "html" || extension === "htm") return html();
  if (extension === "css") return css();
  if (extension === "js" || extension === "mjs" || extension === "cjs") return javascript();
  if (extension === "jsx") return javascript({ jsx: true });
  if (extension === "ts") return javascript({ typescript: true });
  if (extension === "tsx") return javascript({ jsx: true, typescript: true });
  if (extension === "rs") return rust();
  if (extension === "py") return python();
  if (extension === "sql") return sql();
  if (extension === "xml") return xml();
  if (extension === "yaml" || extension === "yml") return yaml();

  return [];
}

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#8ab4f8", fontWeight: "600" },
  { tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: "#f4f4f5" },
  { tag: [tags.function(tags.variableName), tags.labelName], color: "#93c5fd" },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: "#c084fc" },
  { tag: [tags.definition(tags.name), tags.separator], color: "#f8fafc" },
  { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier], color: "#fbbf24" },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link], color: "#67e8f9" },
  { tag: [tags.meta, tags.comment], color: "#71717a", fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "#60a5fa", textDecoration: "underline" },
  { tag: tags.heading, color: "#f8fafc", fontWeight: "700" },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: "#c084fc" },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: "#86efac" },
  { tag: tags.invalid, color: "#f87171" },
]);

function editorTheme(fontSize: number) {
  return EditorView.theme({
    "&": {
      height: "100%",
      color: "var(--editor-foreground)",
      backgroundColor: "var(--editor)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
    },
    ".cm-scroller": {
      fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
      fontSize: `${fontSize}px`,
      lineHeight: "1.55",
    },
    ".cm-content": {
      minHeight: "100%",
      padding: "18px 20px",
      caretColor: "var(--primary)",
    },
    ".cm-line": {
      padding: "0 4px",
    },
    ".cm-gutters": {
      backgroundColor: "var(--editor)",
      color: "var(--muted-foreground)",
      borderRight: "1px solid var(--border)",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      minWidth: "38px",
      padding: "0 10px 0 8px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--accent)",
      color: "var(--foreground)",
    },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in srgb, var(--accent) 55%, transparent)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--primary) 32%, transparent)",
    },
    ".cm-cursor": {
      borderLeftColor: "var(--primary)",
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: "var(--accent)",
      outline: "1px solid var(--ring)",
    },
    "&.cm-focused": {
      outline: "1px solid var(--ring)",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--popover)",
      borderColor: "var(--border)",
      color: "var(--popover-foreground)",
    },
  });
}

export function CodeEditor({ document, value, settings, readOnly = false, onChange }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const lineNumbersCompartment = useRef(new Compartment()).current;
  const wrapCompartment = useRef(new Compartment()).current;
  const languageCompartment = useRef(new Compartment()).current;
  const tabSizeCompartment = useRef(new Compartment()).current;
  const themeCompartment = useRef(new Compartment()).current;
  const readOnlyCompartment = useRef(new Compartment()).current;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        foldGutter(),
        syntaxHighlighting(highlightStyle),
        lineNumbersCompartment.of(
          settings.showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
        ),
        wrapCompartment.of(settings.wordWrap ? EditorView.lineWrapping : []),
        languageCompartment.of(languageFor(document)),
        tabSizeCompartment.of(EditorState.tabSize.of(settings.tabSize)),
        themeCompartment.of(editorTheme(settings.fontSize)),
        readOnlyCompartment.of([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
        keymap.of([
          indentWithTab,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [
    document.path,
    languageCompartment,
    lineNumbersCompartment,
    readOnly,
    readOnlyCompartment,
    tabSizeCompartment,
    themeCompartment,
    wrapCompartment,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue !== value) {
      view.dispatch({
        changes: { from: 0, to: currentValue.length, insert: value },
      });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: [
        lineNumbersCompartment.reconfigure(
          settings.showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
        ),
        wrapCompartment.reconfigure(settings.wordWrap ? EditorView.lineWrapping : []),
        tabSizeCompartment.reconfigure(EditorState.tabSize.of(settings.tabSize)),
        themeCompartment.reconfigure(editorTheme(settings.fontSize)),
        languageCompartment.reconfigure(languageFor(document)),
        readOnlyCompartment.reconfigure([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
      ],
    });
  }, [
    document,
    languageCompartment,
    lineNumbersCompartment,
    readOnly,
    readOnlyCompartment,
    settings.fontSize,
    settings.showLineNumbers,
    settings.tabSize,
    settings.wordWrap,
    tabSizeCompartment,
    themeCompartment,
    wrapCompartment,
  ]);

  return <div className="code-editor h-full min-h-0 w-full rounded-lg border border-border" ref={containerRef} />;
}
