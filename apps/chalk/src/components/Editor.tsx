import type { Extension } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import * as React from "react";
import { chalkEditorTheme } from "@/chalk-cm-theme";
import { chalk } from "@/chalk-lang";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Extra editor extensions (e.g. the slash insert palette). */
  extensions?: Extension[];
  /** Receives the live EditorView (for palette/outline edits). */
  onReady?: (view: EditorView) => void;
}

/** A CodeMirror 6 editor with Theia highlighting, wrapped for React. External
 * `value` changes (e.g. loading an example) are synced in without clobbering
 * live typing; the view is exposed via `onReady` for programmatic edits. */
export function Editor({ value, onChange, extensions, onReady }: EditorProps): React.ReactElement {
  const host = React.useRef<HTMLDivElement>(null);
  const view = React.useRef<EditorView | null>(null);
  const onChangeRef = React.useRef(onChange);
  const onReadyRef = React.useRef(onReady);
  onChangeRef.current = onChange;
  onReadyRef.current = onReady;

  React.useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          chalk(),
          chalkEditorTheme(),
          EditorView.lineWrapping,
          ...(extensions ?? []),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    onReadyRef.current?.(v);
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes into the editor (guard against echo loops).
  React.useEffect(() => {
    const v = view.current;
    if (v && value !== v.state.doc.toString()) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={host} className="h-full overflow-auto" />;
}
