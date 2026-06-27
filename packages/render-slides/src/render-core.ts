/**
 * The pure, isomorphic compile core (no Node/fs imports), shared by the CLI and
 * the browser playground. The three heavy inlined assets — KaTeX CSS (with
 * embedded fonts), the KaTeX browser bundle, and the @chalk/runtime IIFE — are
 * *injected* as strings rather than read from disk, so this runs unchanged in
 * Node (CLI supplies them via fs/esbuild) and in the browser (playground
 * supplies the same strings, baked at its build time).
 */
import type { DocumentNode } from "@chalk/ast";
import { parse } from "@chalk/parser";
import { escapeHtml } from "./escape.js";
import { renderSlide } from "./render-nodes.js";
import { DECK_CSS } from "./styles.js";

/** The inlined runtime assets a deck needs to be self-contained. */
export interface DeckAssets {
  katexCss: string;
  katexJs: string;
  runtimeJs: string;
}

export interface RenderOptions {
  /** Document <title>; defaults to the lecture title or "Chalk deck". */
  title?: string;
  assets: DeckAssets;
}

/** Render a parsed Document into a self-contained HTML deck string. */
export function renderDeckHTML(doc: DocumentNode, options: RenderOptions): string {
  const title = options.title ?? doc.title ?? "Chalk deck";
  const { katexCss, katexJs, runtimeJs } = options.assets;

  const slidesHtml = doc.children
    .map((slide, i) => renderSlide(slide, i).html)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="Chalk" />
<title>${escapeHtml(title)}</title>
<style>${katexCss}</style>
<style>${DECK_CSS}</style>
</head>
<body>
<main class="stage">
  <div class="deck" id="deck">
${slidesHtml}
  </div>
</main>
<footer class="chalk-bar">
  <div class="chalk-bar__progress" id="chalk-progress"></div>
  <span class="chalk-bar__title" id="chalk-bar-title"></span>
  <span class="chalk-bar__counter" id="chalk-counter"></span>
  <button class="chalk-bar__btn" id="chalk-theme" type="button">Dark</button>
</footer>
<script>${katexJs}</script>
<script>${runtimeJs}</script>
</body>
</html>
`;
}

export interface CompileResult {
  /** The compiled deck HTML (empty string if compilation threw). */
  html: string;
  /** Number of slides, or 0 on error. */
  slides: number;
  /** A human-readable compile error, if one occurred (deck still degrades). */
  error?: string;
}

/**
 * The one shared compile path: `.chalk` source → self-contained HTML deck.
 * Used by both the CLI (Node assets) and the playground (bundled assets). The
 * parser is lenient by design, so most malformed input still renders (bad math
 * shows as KaTeX errors in place); a thrown error is reported rather than
 * producing a blank result.
 */
export function compileChalk(source: string, options: RenderOptions): CompileResult {
  try {
    const doc = parse(source);
    const html = renderDeckHTML(doc, options);
    return { html, slides: doc.children.length };
  } catch (err) {
    return {
      html: "",
      slides: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export { renderSlide } from "./render-nodes.js";
