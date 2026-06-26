import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "@chalk/parser";
import { renderDeck } from "@chalk/render-slides";

/** Derive the output `.html` path for a given `.chalk` source path. */
export function outputPathFor(input: string): string {
  const abs = resolve(input);
  const base = abs.endsWith(".chalk") ? abs.slice(0, -".chalk".length) : abs;
  return `${base}.html`;
}

export interface BuildResult {
  input: string;
  output: string;
  slides: number;
  bytes: number;
}

/**
 * Compile one `.chalk` file to a self-contained slide-deck HTML file. Pure
 * pipeline glue: read → parse → render → write. Returns where it wrote and a
 * few stats for the CLI to report.
 */
export function buildFile(input: string, outPath?: string): BuildResult {
  const inputAbs = resolve(input);
  const source = readFileSync(inputAbs, "utf8");
  const doc = parse(source);
  const html = renderDeck(doc);
  const output = outPath ? resolve(outPath) : outputPathFor(inputAbs);
  writeFileSync(output, html, "utf8");
  return {
    input: inputAbs,
    output,
    slides: doc.children.length,
    bytes: Buffer.byteLength(html, "utf8"),
  };
}
