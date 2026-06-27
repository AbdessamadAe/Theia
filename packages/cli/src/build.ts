import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { walk } from "@chalk/ast";
import { parse } from "@chalk/parser";
import { compileChalk } from "@chalk/render-slides";

/** Derive the output `.html` path for a given `.chalk` source path. */
export function outputPathFor(input: string): string {
  const abs = resolve(input);
  const base = abs.endsWith(".chalk") ? abs.slice(0, -".chalk".length) : abs;
  return `${base}.html`;
}

/**
 * Local assets at or below this size are inlined as `data:` URIs (the deck
 * stays a single self-contained file). Larger assets — and any video — are
 * copied alongside into `<out>.assets/` and referenced by a relative path, so
 * the bundle is still offline-capable as a folder.
 */
export const MEDIA_INLINE_THRESHOLD = 256 * 1024;

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime",
  ".vtt": "text/vtt",
};

/** A reference that needs no resolution: remote URL or already-inlined data. */
export function isExternalRef(ref: string): boolean {
  return /^(https?:|data:|blob:)/i.test(ref);
}

/**
 * Build a media resolver for one compile: it embeds LOCAL references (resolved
 * relative to the source directory) and leaves remote/data refs untouched.
 */
export function makeMediaResolver(opts: {
  srcDir: string;
  outDir: string;
  outBase: string;
  warnings: string[];
}): (ref: string) => string {
  const copied = new Set<string>();
  return (ref: string): string => {
    if (!ref || isExternalRef(ref)) return ref;
    const abs = resolve(opts.srcDir, ref);
    if (!existsSync(abs)) {
      opts.warnings.push(`media not found, left as-is: ${ref}`);
      return ref;
    }
    const ext = extname(abs).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";
    const buf = readFileSync(abs);
    if (buf.length <= MEDIA_INLINE_THRESHOLD) {
      return `data:${mime};base64,${buf.toString("base64")}`;
    }
    // Too big to inline → copy alongside and reference relatively.
    const assetsRel = `${opts.outBase}.assets`;
    const assetsDir = join(opts.outDir, assetsRel);
    mkdirSync(assetsDir, { recursive: true });
    const name = basename(abs);
    const dest = join(assetsDir, name);
    if (!copied.has(dest)) {
      copyFileSync(abs, dest);
      copied.add(dest);
    }
    return `${assetsRel}/${name}`;
  };
}

/** Accessibility + sourcing warnings gathered from the parsed document. */
function collectWarnings(source: string): string[] {
  const warnings: string[] = [];
  try {
    walk(parse(source), (node) => {
      if (node.type === "media" && node.mediaKind === "image" && !node.alt?.trim()) {
        warnings.push(`image "${node.name ?? node.src}" has no alt text (accessibility)`);
      }
      if (node.type === "sceneObject" && node.kind === "image" && !node.args.alt?.trim()) {
        warnings.push(`image "${node.name}" has no alt text (accessibility)`);
      }
    });
  } catch {
    /* parse errors surface during compile */
  }
  return warnings;
}

export interface BuildResult {
  input: string;
  output: string;
  slides: number;
  bytes: number;
  /** Non-fatal warnings (missing alt text, unresolved local media). */
  warnings: string[];
}

/**
 * Compile one `.chalk` file to a self-contained slide-deck HTML file. Local
 * media is embedded (data URI ≤ threshold, else copied alongside) so the deck
 * stays offline-capable. Pure pipeline glue: read → resolve media → render →
 * write. Returns where it wrote, a few stats, and any non-fatal warnings.
 */
export function buildFile(input: string, outPath?: string): BuildResult {
  const inputAbs = resolve(input);
  const source = readFileSync(inputAbs, "utf8");
  const output = outPath ? resolve(outPath) : outputPathFor(inputAbs);
  const outDir = dirname(output);
  const outBase = basename(output).replace(/\.html$/i, "");

  const warnings = collectWarnings(source);
  const resolveMedia = makeMediaResolver({
    srcDir: dirname(inputAbs),
    outDir,
    outBase,
    warnings,
  });

  const { html, slides, error } = compileChalk(source, { resolveMedia });
  if (error) throw new Error(error);
  writeFileSync(output, html, "utf8");
  return {
    input: inputAbs,
    output,
    slides,
    bytes: Buffer.byteLength(html, "utf8"),
    warnings,
  };
}
