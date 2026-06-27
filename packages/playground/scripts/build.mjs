// Bundle the playground with esbuild (the toolchain the repo already uses) and
// optionally serve it statically for local development.
import { build, context } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outdir = join(root, "dist");
const serve = process.argv.includes("--serve");

mkdirSync(outdir, { recursive: true });
cpSync(join(root, "public"), outdir, { recursive: true });

const opts = {
  entryPoints: [join(root, "src", "main.ts")],
  bundle: true,
  format: "esm",
  target: "es2020",
  sourcemap: true,
  outfile: join(outdir, "app.js"),
  loader: { ".ttf": "dataurl", ".woff": "dataurl", ".woff2": "dataurl" },
  logLevel: "info",
};

if (serve) {
  const ctx = await context(opts);
  await ctx.rebuild();
  const { host, port } = await ctx.serve({ servedir: outdir, port: 5173 });
  console.log(`\nChalk playground → http://localhost:${port}/  (Ctrl+C to stop)`);
  void host;
} else {
  await build(opts);
  console.log("playground built →", outdir);
}
