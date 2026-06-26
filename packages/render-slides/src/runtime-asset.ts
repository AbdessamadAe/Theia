import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { buildSync } from "esbuild";

const require = createRequire(import.meta.url);

let cachedRuntime: string | null = null;

/**
 * Bundle @chalk/runtime's browser entry into a single minified IIFE string,
 * ready to inline into the deck. We bundle the package's TypeScript *source*
 * directly with esbuild (no separate build step needed), so `chalk build` and
 * the renderer's own tests produce the live runtime without a prior `tsc`.
 * Computed once and cached for the process.
 */
export function inlinedRuntimeJs(): string {
  if (cachedRuntime !== null) return cachedRuntime;

  const pkgJson = require.resolve("@chalk/runtime/package.json");
  const entry = join(dirname(pkgJson), "src", "browser.ts");

  const result = buildSync({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2018",
    minify: true,
    legalComments: "none",
    write: false,
  });

  const out = result.outputFiles[0];
  if (!out) throw new Error("Failed to bundle @chalk/runtime browser entry");
  cachedRuntime = out.text;
  return cachedRuntime;
}
