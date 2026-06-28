import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DeckAssets } from "@theia/render-slides/core";

/**
 * The three heavy inlined deck assets — the KaTeX stylesheet (with embedded
 * woff2 fonts), the KaTeX browser bundle, and the @theia/runtime IIFE — baked
 * to disk beside this module at publish time by `scripts/bundle.mjs` (which
 * computes them with the *same* `loadNodeAssets()` the in-repo CLI uses).
 *
 * Baking them lets the published `theialang` package run standalone: no
 * esbuild, no `katex` install, and no @theia/runtime source needed at install
 * time. The bytes are identical to what the in-repo build produces, and they
 * still flow through the one shared, isomorphic compile core
 * (`compileChalk` from `@theia/render-slides/core`).
 */
const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(here, "assets");

let cached: DeckAssets | null = null;

/** Drop-in replacement for `assets.ts`'s `getAssets`, reading the baked files. */
export function getAssets(): DeckAssets {
  if (cached) return cached;
  cached = {
    katexCss: readFileSync(join(assetsDir, "katex.css"), "utf8"),
    katexJs: readFileSync(join(assetsDir, "katex.js"), "utf8"),
    runtimeJs: readFileSync(join(assetsDir, "runtime.js"), "utf8"),
  };
  return cached;
}
