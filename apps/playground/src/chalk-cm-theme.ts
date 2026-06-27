/**
 * CodeMirror editor + syntax theme, derived entirely from the Chalk design
 * tokens. Because the editor lives in the playground DOM (not the deck iframe),
 * `hsl(var(--token))` resolves against :root / .dark and flips with the theme
 * automatically — one theme object serves both light and dark.
 */
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { type Extension, Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

const editorTheme = EditorView.theme({
  "&": {
    color: "hsl(var(--foreground))",
    backgroundColor: "transparent",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "hsl(var(--live))",
    padding: "12px 0",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "hsl(var(--live))" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "hsl(var(--live) / 0.18)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "hsl(var(--muted-foreground) / 0.6)",
    border: "none",
    paddingRight: "4px",
  },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "hsl(var(--foreground))" },
  ".cm-activeLine": { backgroundColor: "hsl(var(--muted) / 0.4)" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 6px 0 12px" },
  ".cm-foldPlaceholder": {
    backgroundColor: "hsl(var(--muted))",
    border: "none",
    color: "hsl(var(--muted-foreground))",
  },
  ".cm-tooltip": {
    border: "1px solid hsl(var(--border))",
    backgroundColor: "hsl(var(--popover))",
    color: "hsl(var(--popover-foreground))",
    borderRadius: "10px",
    boxShadow: "var(--shadow-3)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "hsl(var(--accent))",
    color: "hsl(var(--accent-foreground))",
  },
  ".cm-tooltip-autocomplete > ul > li": { padding: "3px 8px" },
});

const highlightStyle = HighlightStyle.define([
  { tag: t.heading, color: "hsl(var(--foreground))", fontWeight: "700" },
  { tag: t.keyword, color: "hsl(var(--cm-keyword))", fontWeight: "600" }, // ::: blocks, + directives
  { tag: t.atom, color: "hsl(var(--live))", fontWeight: "600" }, // @slider / @plot / @axes …
  { tag: t.string, color: "hsl(var(--cm-string))" }, // $math$, code fences
  { tag: t.emphasis, fontStyle: "italic", color: "hsl(var(--cm-emphasis))" },
  { tag: t.comment, color: "hsl(var(--muted-foreground))", fontStyle: "italic" },
]);

export function chalkEditorTheme(): Extension {
  // Raise the syntax highlighter above basicSetup's default style.
  return [editorTheme, Prec.high(syntaxHighlighting(highlightStyle))];
}
