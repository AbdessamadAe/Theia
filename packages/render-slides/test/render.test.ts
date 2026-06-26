import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "@chalk/parser";
import { describe, expect, it } from "vitest";
import { renderDeck } from "../src/index.js";

const source = readFileSync(
  fileURLToPath(new URL("../../../examples/limits.chalk", import.meta.url)),
  "utf8",
);

const html = renderDeck(parse(source));

describe("renderDeck(limits.chalk)", () => {
  it("emits a complete, self-contained HTML document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Limits and Continuity</title>");
    // No external network requests: fonts inlined, no stylesheet/script links.
    expect(html).not.toContain("<link");
    expect(html).not.toContain("src=\"http");
    expect(html).toContain("data:font/woff2;base64,");
  });

  it("renders one section per slide", () => {
    const count = (html.match(/<section class="slide/g) ?? []).length;
    expect(count).toBe(6);
  });

  it("renders math with KaTeX (server-side, no client KaTeX needed)", () => {
    expect(html).toContain('class="katex"');
    // Display math from the :::definition is present.
    expect(html).toContain("katex-display");
  });

  it("styles theorem-family blocks distinctly", () => {
    expect(html).toContain("chalk-theorem--definition");
    expect(html).toContain("chalk-theorem--proof");
    expect(html).toContain("chalk-theorem--remark");
  });

  it("emits step elements with sequential indices for the proof", () => {
    expect(html).toContain('data-step="0"');
    expect(html).toContain('data-step="1"');
    expect(html).toContain('data-step="2"');
    // The proof slide advertises three steps to the runtime.
    expect(html).toContain('data-steps="3"');
  });

  it("renders sliders, plots, geo, and code as labeled placeholders", () => {
    expect(html).toContain("chalk-slider");
    expect(html).toContain('data-slider="a"');
    expect(html).toContain("chalk-plot");
    expect(html).toContain("reacts to"); // plot records its slider dependency
    expect(html).toContain("chalk-geo");
    expect(html).toContain("chalk-code");
    expect(html).toContain("const f = (x) =&gt; 3 * x + 1;"); // code escaped
  });

  it("includes navigation runtime and both themes", () => {
    expect(html).toContain("ArrowRight");
    expect(html).toContain('[data-theme="dark"]');
    expect(html).toContain("prefers-color-scheme: dark");
  });
});
