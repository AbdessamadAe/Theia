import katex from "katex";

/**
 * Browser-safe KaTeX rendering (no Node/fs imports), so it can run both at
 * build time (CLI) and in the playground's in-browser compile. The fs-based
 * asset inliners live in `katex-assets.ts` (Node only).
 *
 * Errors render in place (as red text) rather than aborting the whole build, so
 * one bad formula is visible and fixable without losing the rest of the deck.
 * `trust` enables author markup like `\htmlClass{ck-…}{…}` (derive match hints).
 */
export function renderMath(
  tex: string,
  display: boolean,
  trust = false,
  macros?: Record<string, string>,
): string {
  return katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    output: "html",
    trust,
    strict: false,
    macros,
  });
}

/** KaTeX macro making `\mark{…}` a targetable span for emphasis effects. */
export const MARK_MACRO: Record<string, string> = {
  "\\mark": "\\htmlClass{ck-mark}{#1}",
};
