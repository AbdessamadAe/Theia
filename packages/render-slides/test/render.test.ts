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
    // No external resources referenced from HTML: everything is inlined.
    expect(html).not.toContain("<link");
    expect(html).not.toContain("<script src=");
    expect(html).not.toContain('href="http');
    expect(html).toContain("data:font/woff2;base64,");
  });

  it("renders one section per slide", () => {
    const count = (html.match(/<section class="slide/g) ?? []).length;
    expect(count).toBe(12);
  });

  it("renders a :::scene with a canvas, overlay, and object/anim JSON (Phase 8A)", () => {
    expect(html).toContain("chalk-scene__canvas");
    expect(html).toContain("chalk-scene__overlay");
    expect(html).toContain('class="chalk-scene__data"');
    expect(html).toContain('"kind":"axes"');
    expect(html).toContain('"verb":"write"');
    expect(html).toContain('data-transitions="6"'); // six +animate verbs
  });

  it("emits follower attributes on a plot with @point/@follow (Part B)", () => {
    expect(html).toContain('data-point-x="t"');
    expect(html).toContain('data-follow="tangent,dropline,label"');
  });

  it("renders :::derive blocks with state JSON and advance metadata", () => {
    expect(html).toContain("chalk-derive");
    expect(html).toContain("chalk-derive__stage");
    expect(html).toContain('class="chalk-derive__states"');
    expect(html).toContain("data-advance-base");
    expect(html).toContain('data-transitions="1"');
    // Initial state is server-rendered (KaTeX), with hint trust enabled.
    expect(html).toContain('class="katex"');
  });

  it("renders math with KaTeX and inlines KaTeX's JS for client re-render", () => {
    expect(html).toContain('class="katex"');
    expect(html).toContain("katex-display");
    // Two inline scripts are shipped: the KaTeX browser bundle and the runtime.
    const scripts = (html.match(/<script>/g) ?? []).length;
    expect(scripts).toBe(2);
    // A token unique to the KaTeX bundle confirms its JS (not just CSS) is inlined.
    expect(html).toContain("ParseError");
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
    expect(html).toContain('data-steps="3"');
  });

  it("renders a live (enabled) slider carrying its name", () => {
    expect(html).toContain('data-slider="a"');
    expect(html).toContain("chalk-slider chalk-interactive");
    // The slider input is interactive now, not disabled.
    const sliderBlock = html.slice(html.indexOf('data-slider="a"'));
    const input = sliderBlock.slice(0, sliderBlock.indexOf("</div>"));
    expect(input).toContain('type="range"');
    expect(input).not.toContain("disabled");
  });

  it("renders a live plot with a canvas and recorded slider dependency", () => {
    expect(html).toContain("chalk-plot chalk-interactive");
    expect(html).toContain('data-expr="a*x^2"');
    expect(html).toContain('data-vars="a"');
    expect(html).toContain('data-xvar="x"');
    expect(html).toContain("<canvas");
    expect(html).toContain("reacts to");
  });

  it("marks math that references a slider as reactive, with its template + vars", () => {
    // $f(x) = a x^2$ on the parabola slide reads slider `a`.
    expect(html).toContain("data-chalk-math=");
    expect(html).toContain('data-chalk-vars="a"');
    // The template keeps the symbolic variable; the initial render substitutes 1.
    expect(html).toMatch(/data-chalk-math="f\(x\) = a x\^2"/);
  });

  it("renders a real geo embed target with its source in a data attribute", () => {
    expect(html).toContain("chalk-geo chalk-interactive");
    expect(html).toContain("data-geo-src=");
    expect(html).toContain("chalk-geo__applet");
    expect(html).toContain("A = Point(1, 0)");
  });

  it("renders js code cells as live compute cells with output/error targets", () => {
    expect(html).toContain('data-chalk-cell="js"');
    expect(html).toContain("chalk-cell__output");
    expect(html).toContain("chalk-cell__error");
    // Source is preserved (escaped) so the runtime can compile it.
    expect(html).toContain("const f = (x) =&gt; 3 * x + 1;");
    // Cell source is HTML-escaped in the <pre>; the runtime decodes it.
    expect(html).toContain("chalk.slider(&quot;a&quot;)");
  });

  it("renders py code cells as live compute cells (Pyodide)", () => {
    expect(html).toContain('data-chalk-cell="py"');
    expect(html).toContain("import sympy as sp");
    expect(html).toContain("import matplotlib.pyplot as plt");
  });

  it("marks the two-parameter plot as depending on both sliders", () => {
    expect(html).toContain('data-slider="m"');
    expect(html).toContain('data-slider="c"');
    expect(html).toContain('data-expr="m*x + c"');
    expect(html).toMatch(/data-vars="m,c"|data-vars="c,m"/);
  });

  it("includes the reactive runtime, both themes, and reduced-motion handling", () => {
    expect(html).toContain("ArrowRight"); // navigation runtime present
    expect(html).toContain('[data-theme="dark"]');
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("prefers-reduced-motion: reduce");
  });
});
