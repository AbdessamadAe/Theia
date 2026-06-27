/**
 * Insert-palette mechanics: resolve a snippet to bare-vs-wrapped by the caret's
 * enclosing block, then apply it as a CodeMirror snippet (one transaction, with
 * tab-stops). Also a slash-command completion source. Pure text only — the
 * deck recompiles from the edited document.
 */
import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  autocompletion,
  snippet,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { SNIPPETS, type SnippetDef } from "./snippets";
import { enclosingContainer } from "./outline";

/** Apply `def` at the caret. `replace` (the slash token range) is removed if
 * given; otherwise inline snippets land at the caret and block snippets on a
 * fresh line. Exactly one transaction → one undo step. */
export function applySnippet(
  view: EditorView,
  def: SnippetDef,
  replace?: { from: number; to: number },
): void {
  const { state } = view;
  const head = state.selection.main.head;
  const container = def.container ? enclosingContainer(state.doc.toString(), head) : null;
  const useInside = !!def.container && container === def.container;
  let tmpl = useInside ? (def.inside ?? def.template) : def.template;

  let from: number;
  let to: number;
  if (replace) {
    from = replace.from;
    to = replace.to;
    // A block construct typed mid-line gets a blank line before it.
    if (!def.inline) {
      const line = state.doc.lineAt(from);
      if (state.sliceDoc(line.from, from).trim().length > 0) tmpl = "\n\n" + tmpl;
    }
  } else if (def.inline) {
    from = head;
    to = head;
  } else {
    const line = state.doc.lineAt(head);
    from = line.to;
    to = line.to;
    tmpl = (line.length > 0 ? "\n\n" : "") + tmpl;
  }

  snippet(tmpl)(view, null, from, to);
  view.focus();
}

/** Slash-command completions: typing "/" lists snippets; selecting applies one. */
function chalkSlashCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\/[\w-]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  const query = word.text.slice(1).toLowerCase();
  const options: Completion[] = SNIPPETS.filter(
    (s) => !query || s.id.includes(query) || s.label.toLowerCase().includes(query),
  ).map((s) => ({
    label: `/${s.id}`,
    detail: s.category,
    info: s.label,
    type: "keyword",
    apply: (v: EditorView, _c: Completion, from: number, to: number) =>
      applySnippet(v, s, { from, to }),
  }));
  if (options.length === 0) return null;
  return { from: word.from, options, filter: false };
}

/** Editor extension enabling the "/" insert palette. */
export function chalkSlashPalette(): Extension {
  return autocompletion({ override: [chalkSlashCompletions], defaultKeymap: true });
}
