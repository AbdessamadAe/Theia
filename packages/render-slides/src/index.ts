import type { DocumentNode } from "@chalk/ast";
import { escapeHtml } from "./escape.js";
import { inlinedKatexCss, inlinedKatexJs } from "./katex-assets.js";
import { renderSlide } from "./render-nodes.js";
import { inlinedRuntimeJs } from "./runtime-asset.js";
import { DECK_CSS } from "./styles.js";

export interface RenderOptions {
  /** Document <title>; defaults to the lecture title or "Chalk deck". */
  title?: string;
}

/**
 * Render a Chalk AST into a single self-contained HTML string: a presentable,
 * navigable slide deck with KaTeX math, styled theorem blocks, step reveal,
 * light/dark themes, and — from Phase 3 — live interactive sliders, reactive
 * math, and canvas plots driven by the inlined @chalk/runtime.
 *
 * No external requests: KaTeX (CSS, fonts, and JS), the runtime, and all styles
 * are inlined, so the deck works offline. The sole exception is a `:::geo`
 * block, whose GeoGebra embed loads `deployggb.js` from geogebra.org on demand.
 */
export function renderDeck(doc: DocumentNode, options: RenderOptions = {}): string {
  const title = options.title ?? doc.title ?? "Chalk deck";

  const slidesHtml = doc.children
    .map((slide, i) => renderSlide(slide, i).html)
    .join("\n");

  const katexCss = inlinedKatexCss();
  const katexJs = inlinedKatexJs();
  const runtimeJs = inlinedRuntimeJs();

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

export { renderSlide } from "./render-nodes.js";
