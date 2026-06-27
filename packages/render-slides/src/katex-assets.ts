import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import katex from "katex";

const require = createRequire(import.meta.url);

let cachedCss: string | null = null;
let cachedJs: string | null = null;

/**
 * Return KaTeX's stylesheet with every `woff2` font reference rewritten to an
 * inline `data:` URI. This makes the emitted deck a single self-contained file
 * that renders math correctly offline — no font requests, no CDN. Non-woff2
 * `@font-face` sources (woff/ttf) are stripped so browsers use the woff2 data
 * URI directly. Computed once and cached.
 */
export function inlinedKatexCss(): string {
  if (cachedCss !== null) return cachedCss;

  const cssPath = require.resolve("katex/dist/katex.min.css");
  const fontsDir = join(dirname(cssPath), "fonts");
  let css = readFileSync(cssPath, "utf8");

  // Drop woff/ttf src entries (and any leading comma) — woff2 covers all
  // browsers we target and keeps the embedded payload small.
  css = css.replace(
    /,?\s*url\(fonts\/[\w-]+\.(?:woff|ttf)\)\s*format\((?:"[^"]*"|'[^']*')\)/g,
    "",
  );

  // Inline each woff2 font as a base64 data URI.
  css = css.replace(/url\(fonts\/([\w-]+\.woff2)\)/g, (_match: string, file: string) => {
    const data = readFileSync(join(fontsDir, file)).toString("base64");
    return `url(data:font/woff2;base64,${data})`;
  });

  cachedCss = css;
  return css;
}

/**
 * Return KaTeX's browser bundle (the UMD `katex.min.js`, which defines the
 * global `katex`). Inlined into the deck so the reactive runtime can re-render
 * math client-side, offline, when a slider changes. Computed once and cached.
 */
export function inlinedKatexJs(): string {
  if (cachedJs !== null) return cachedJs;
  const jsPath = require.resolve("katex/dist/katex.min.js");
  cachedJs = readFileSync(jsPath, "utf8");
  return cachedJs;
}

/** Render a LaTeX string to HTML using KaTeX. Errors render in place (as red
 * text) rather than aborting the whole build, so one bad formula is visible
 * and fixable without losing the rest of the deck. `trust` enables author
 * markup like `\htmlClass{ck-…}{…}` (used for derive match hints). */
export function renderMath(tex: string, display: boolean, trust = false): string {
  return katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    output: "html",
    trust,
    strict: false,
  });
}
