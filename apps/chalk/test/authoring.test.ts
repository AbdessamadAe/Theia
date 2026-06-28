import type { SceneBlock } from "@theia/ast";
import { parse } from "@theia/parser";
import { describe, expect, it } from "vitest";
import { buildOutline, enclosingContainer, moveBlock } from "../src/lib/outline.js";
import { CATEGORY_LABELS, expandTemplate, SNIPPETS } from "../src/lib/snippets.js";

/** Wrap a bare (container) snippet in its minimal container so it parses. */
function wrapInside(container: string, inside: string): string {
  if (container === "scene") return `:::scene\n@axes ax x:[-3,3] y:[-1,9]\n${inside}\n:::`;
  if (container === "scene3d") return `:::scene3d\n@axes3d ax x:[-3,3] y:[-3,3] z:[0,9]\n${inside}\n:::`;
  if (container === "derive") return `:::derive\n$$ x $$\n${inside}\n:::`;
  if (container === "theorem") return `:::proof\n${inside}\n:::`;
  return inside;
}

describe("insert snippets", () => {
  it("every snippet has a known category and a non-empty template", () => {
    for (const s of SNIPPETS) {
      expect(CATEGORY_LABELS[s.category]).toBeTruthy();
      expect(s.template.length).toBeGreaterThan(0);
      if (s.container) expect(s.inside).toBeTruthy();
    }
  });

  it("every standalone snippet parses to a valid slide", () => {
    for (const s of SNIPPETS) {
      const doc = parse(`## Test\n\n${expandTemplate(s.template)}\n`);
      expect(doc.children.length, s.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("every bare (container) snippet parses inside its container", () => {
    for (const s of SNIPPETS) {
      if (!s.container || !s.inside) continue;
      const src = `## T\n\n${wrapInside(s.container, expandTemplate(s.inside))}\n`;
      const doc = parse(src);
      expect(doc.children.length, s.id).toBe(1);
    }
  });

  it("key snippets produce the expected constructs", () => {
    const scene = parse(`## T\n\n${expandTemplate(SNIPPETS.find((s) => s.id === "scene")!.template)}`)
      .children[0]!.children.find((b): b is SceneBlock => b.type === "scene")!;
    expect(scene.dimension).toBe("2d");
    expect(scene.objects.map((o) => o.kind)).toContain("plot");

    const derive = parse(`## T\n\n${expandTemplate(SNIPPETS.find((s) => s.id === "derive")!.template)}`)
      .children[0]!.children.find((b) => b.type === "derive");
    expect(derive && derive.type === "derive" && derive.states.length).toBe(2);

    const scene3d = parse(`## T\n\n${expandTemplate(SNIPPETS.find((s) => s.id === "scene3d")!.template)}`)
      .children[0]!.children.find((b): b is SceneBlock => b.type === "scene")!;
    expect(scene3d.dimension).toBe("3d");
  });
});

describe("enclosingContainer", () => {
  const src = [
    "## S",
    "",
    ":::scene", // line 3
    "@axes ax x:[-3,3] y:[-1,9]",
    ":::",
    "",
    ":::derive",
    "$$ x $$",
    "+to $$ 2x $$",
    ":::",
  ].join("\n");

  it("detects the block a caret sits in", () => {
    const sceneAt = src.indexOf("@axes");
    const deriveAt = src.indexOf("$$ x");
    const outside = src.indexOf("## S");
    expect(enclosingContainer(src, sceneAt)).toBe("scene");
    expect(enclosingContainer(src, deriveAt)).toBe("derive");
    expect(enclosingContainer(src, outside)).toBeNull();
  });
});

describe("outline block spans", () => {
  const src = [
    "# Deck",
    "",
    "## Graphing",
    "",
    ":::scene",
    "@axes ax x:[-3,3] y:[-1,9] grid",
    "@plot f on ax : a*x^2",
    "+animate write f",
    ":::",
  ].join("\n");

  it("a block's span covers the whole fenced block (fences + verbs)", () => {
    const outline = buildOutline(src);
    const graphing = outline.find((s) => s.label.includes("Graphing"))!;
    const scene = graphing.blocks.find((b) => b.kind === "scene")!;
    const span = src.slice(scene.start, scene.end);
    expect(span.startsWith(":::scene")).toBe(true);
    expect(span.trimEnd().endsWith(":::")).toBe(true);
    expect(span).toContain("+animate write f"); // inner verb is inside the span
  });
});

describe("moveBlock — pure reorder, re-parse matches intended order", () => {
  const headings = (src: string): string[] =>
    parse(src)
      .children.filter((s) => s.kind === "content")
      .map((s) => s.heading.map((n) => (n.type === "text" ? n.value : "")).join(""));

  const doc = ["## Alpha", "", "A.", "", "## Beta", "", "B.", "", "## Gamma", "", "C.", ""].join("\n");

  it("reorders slides by moving a slide span", () => {
    const out = buildOutline(doc);
    const beta = out.find((s) => s.label === "Beta")!;
    const alpha = out.find((s) => s.label === "Alpha")!;
    // Move Beta before Alpha.
    const moved = moveBlock(doc, beta.start, beta.end, alpha.start);
    expect(headings(moved)).toEqual(["Beta", "Alpha", "Gamma"]);
    // No content lost.
    expect(moved).toContain("A.");
    expect(moved).toContain("B.");
    expect(moved).toContain("C.");
  });

  it("is a no-op-safe pure function (idempotent target = self)", () => {
    const out = buildOutline(doc);
    const alpha = out.find((s) => s.label === "Alpha")!;
    const moved = moveBlock(doc, alpha.start, alpha.end, alpha.start);
    expect(headings(moved)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("moves a block between slides", () => {
    const src = ["## One", "", "$$ a $$", "", "## Two", "", "text"].join("\n");
    const out = buildOutline(src);
    const math = out[0]!.blocks.find((b) => b.kind === "math")!;
    const two = out[1]!;
    // Move the math block into slide Two (append at its region end = doc end).
    const moved = moveBlock(src, math.start, math.end, src.length);
    const reparsed = parse(moved);
    // Slide One no longer has the math; slide Two (last) does.
    const last = reparsed.children[reparsed.children.length - 1]!;
    expect(last.children.some((b) => b.type === "math")).toBe(true);
    expect(reparsed.children[0]!.children.some((b) => b.type === "math")).toBe(false);
    void two;
  });
});
