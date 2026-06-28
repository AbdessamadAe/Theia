// Build the publishable `theialang` artifact: one self-contained `dist/cli.js`
// plus the three baked deck assets. Run after the engine workspace packages are
// built (their dist is the input here). Produces a standalone CLI with zero
// runtime dependencies — `npm i -g theialang` needs nothing else on disk.
//
//   1. Bake assets: compute the KaTeX CSS/JS + runtime IIFE with the SAME
//      loadNodeAssets() the in-repo CLI uses, and write them beside dist/. The
//      bytes are identical to a normal `theia build`; we just compute them now
//      (publish time) instead of at install time, so esbuild/katex/runtime-src
//      are not needed by the installed package.
//   2. Bundle the CLI's pure import graph (cli → build/serve → render-core +
//      parser + ast + katex) into one file. Node built-ins stay external.
import { build } from "esbuild";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadNodeAssets } from "@theia/render-slides";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const dist = join(pkgRoot, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "assets"), { recursive: true });

// 1) Bake the heavy assets.
const assets = loadNodeAssets();
writeFileSync(join(dist, "assets", "katex.css"), assets.katexCss);
writeFileSync(join(dist, "assets", "katex.js"), assets.katexJs);
writeFileSync(join(dist, "assets", "runtime.js"), assets.runtimeJs);

// Swap the live asset source (`assets.ts`, which pulls in esbuild + katex via
// @theia/render-slides) for the prebaked reader (`assets.baked.ts`). This is the
// one reason the published bundle carries zero runtime dependencies.
const swapAssets = {
  name: "swap-baked-assets",
  setup(b) {
    b.onResolve({ filter: /(^|\/)assets\.js$/ }, () => ({
      path: join(pkgRoot, "src", "assets.baked.ts"),
    }));
  },
};

// 2) Bundle the CLI into a single ESM file. cli.ts already starts with
//    `#!/usr/bin/env node`; esbuild preserves it as the first output line, so no
//    banner is needed (a banner would duplicate the shebang and break ESM).
await build({
  entryPoints: [join(pkgRoot, "src", "cli.ts")],
  outfile: join(dist, "cli.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  legalComments: "none",
  plugins: [swapAssets],
});

const fmt = (n) => `${(n / 1024).toFixed(1)} KB`;
const total =
  assets.katexCss.length + assets.katexJs.length + assets.runtimeJs.length;
console.log(
  `theialang bundled → dist/cli.js  (+ baked assets: katex.css ${fmt(
    assets.katexCss.length,
  )}, katex.js ${fmt(assets.katexJs.length)}, runtime.js ${fmt(
    assets.runtimeJs.length,
  )}; ${fmt(total)} total)`,
);
