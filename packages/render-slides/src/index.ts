/**
 * @chalk/render-slides — AST → self-contained interactive slide bundle.
 *
 * This Node entry loads the heavy inlined assets from disk (KaTeX CSS + fonts,
 * KaTeX JS) and bundles the runtime (esbuild), then delegates to the pure,
 * isomorphic core in `render-core.ts`. The browser playground imports the core
 * directly (via `@chalk/render-slides/core`) and supplies the same assets baked
 * at its own build time — so there is one compile path, not two.
 */
import type { DocumentNode } from "@chalk/ast";
import { inlinedKatexCss, inlinedKatexJs } from "./katex-assets.js";
import {
  compileChalk as compileChalkCore,
  type CompileResult,
  type DeckAssets,
  renderDeckHTML,
} from "./render-core.js";
import { inlinedRuntimeJs } from "./runtime-asset.js";

export type { DeckAssets, RenderOptions, CompileResult } from "./render-core.js";
export { renderDeckHTML, compileChalk as compileChalkWithAssets } from "./render-core.js";
export { renderSlide } from "./render-nodes.js";

let cachedAssets: DeckAssets | null = null;

/** Load the inlined deck assets from disk / esbuild (Node only). Cached. */
export function loadNodeAssets(): DeckAssets {
  if (cachedAssets) return cachedAssets;
  cachedAssets = {
    katexCss: inlinedKatexCss(),
    katexJs: inlinedKatexJs(),
    runtimeJs: inlinedRuntimeJs(),
  };
  return cachedAssets;
}

export interface RenderDeckOptions {
  title?: string;
}

/** Render a parsed Document to a self-contained HTML deck (Node convenience). */
export function renderDeck(doc: DocumentNode, options: RenderDeckOptions = {}): string {
  return renderDeckHTML(doc, { ...options, assets: loadNodeAssets() });
}

/** Compile `.chalk` source → HTML deck using the shared core with Node assets. */
export function compileChalk(
  source: string,
  options: RenderDeckOptions = {},
): CompileResult {
  return compileChalkCore(source, { ...options, assets: loadNodeAssets() });
}
