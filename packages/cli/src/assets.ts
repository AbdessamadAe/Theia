import { loadNodeAssets } from "@chalk/render-slides";
import type { DeckAssets } from "@chalk/render-slides/core";

/**
 * The in-repo asset source: compute the three heavy inlined deck assets (KaTeX
 * CSS with embedded fonts, KaTeX JS, and the @chalk/runtime IIFE) live, via
 * esbuild + fs. This is what the CLI uses inside the monorepo and under test.
 *
 * The published `chalkdeck` bundle replaces this module with `assets.baked.ts`
 * (see `scripts/bundle.mjs`), which reads the same bytes from disk instead — so
 * the installed package carries no esbuild/katex/runtime-source dependency.
 */
export function getAssets(): DeckAssets {
  return loadNodeAssets();
}
