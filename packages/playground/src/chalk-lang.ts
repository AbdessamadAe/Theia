/**
 * A small CodeMirror 6 StreamLanguage for Chalk — line-oriented highlighting of
 * headings, ::: blocks, + directives, @ object/control directives, code fences,
 * and inline/display math. (Deliberately lightweight: Chalk is markdown-ish, so
 * a token-per-construct stream language is plenty.)
 */
import { LanguageSupport, StreamLanguage } from "@codemirror/language";

interface ChalkState {
  inFence: boolean;
}

const language = StreamLanguage.define<ChalkState>({
  startState: () => ({ inFence: false }),
  token(stream, state) {
    // Code fences (```js / ```py …): everything inside is a string.
    if (stream.sol() && stream.match(/^```/)) {
      state.inFence = !state.inFence;
      stream.skipToEnd();
      return "string";
    }
    if (state.inFence) {
      stream.skipToEnd();
      return "string";
    }

    if (stream.sol()) {
      if (stream.match(/^#{1,2}\s.*/)) return "heading";
      if (stream.match(/^:::[A-Za-z0-9]*/)) return "keyword"; // block delimiter
      if (stream.match(/^\+[A-Za-z][\w-]*/)) return "keyword"; // +step/+to/+animate/+emphasize
      if (stream.match(/^@[A-Za-z][\w]*/)) return "atom"; // @slider/@plot/@axes/…
      if (stream.match(/^\s+/)) return null;
    }

    // Inline / display math.
    if (stream.match(/\$\$[^$]*\$\$/) || stream.match(/\$[^$]*\$/)) return "string";
    // Emphasis / strong markers.
    if (stream.match(/\*\*[^*]+\*\*/) || stream.match(/\*[^*]+\*/)) return "emphasis";
    // Inline code.
    if (stream.match(/`[^`]+`/)) return "string";

    stream.next();
    return null;
  },
});

export function chalk(): LanguageSupport {
  return new LanguageSupport(language);
}
