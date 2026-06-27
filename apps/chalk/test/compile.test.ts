import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "@chalk/parser";
// The pure core the playground uses (assets injected):
import { compileChalk as compileCore } from "@chalk/render-slides/core";
// The Node entry the CLI uses (assets loaded from disk):
import { compileChalk as compileNode, loadNodeAssets, renderDeck } from "@chalk/render-slides";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  fileURLToPath(new URL("../../../examples/morphing.chalk", import.meta.url)),
  "utf8",
);
const assets = loadNodeAssets();

describe("shared compile path (CLI core ≡ playground core)", () => {
  it("produces a self-contained deck from source via the injected-assets core", () => {
    const { html, slides, error } = compileCore(src, { assets });
    expect(error).toBeUndefined();
    expect(slides).toBeGreaterThan(0);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('class="katex"'); // KaTeX SSR
    expect(html).toContain("data:font/woff2;base64,"); // inlined fonts asset
    expect(html).toContain("ArrowRight"); // runtime asset inlined
  });

  it("is byte-identical to the CLI's Node compile and renderDeck", () => {
    const viaCore = compileCore(src, { assets }).html;
    const viaNode = compileNode(src).html;
    const viaRenderDeck = renderDeck(parse(src));
    expect(viaCore).toBe(viaNode);
    expect(viaCore).toBe(viaRenderDeck);
  });

  it("reports a thrown error instead of throwing or blanking", () => {
    // A wildly malformed asset bundle forces a render throw; the core catches it.
    const bad = compileCore(src, {
      assets: undefined as unknown as typeof assets,
    });
    expect(bad.error).toBeTruthy();
    expect(bad.html).toBe("");
  });
});
