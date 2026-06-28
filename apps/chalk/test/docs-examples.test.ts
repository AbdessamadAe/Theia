import { type AnyNode, walk } from "@theia/ast";
import { parse } from "@theia/parser";
import { compileChalk } from "@theia/render-slides";
import { describe, expect, it } from "vitest";
import { DOC_EXAMPLES } from "../src/docs/examples.js";

/** Collect node types / scene-object kinds present in a source. */
function shapes(source: string): { types: Set<string>; kinds: Set<string>; codeLangs: Set<string> } {
  const types = new Set<string>();
  const kinds = new Set<string>();
  const codeLangs = new Set<string>();
  walk(parse(source), (n: AnyNode) => {
    types.add(n.type);
    if (n.type === "sceneObject") kinds.add(n.kind);
    if (n.type === "code") codeLangs.add(n.lang);
  });
  return { types, kinds, codeLangs };
}

/**
 * Every .theia snippet shown in the docs must compile with the real engine, so
 * documentation can't drift from what ships. (Uses the Node compile path, which
 * loads the real KaTeX + runtime assets.)
 */
describe("documentation examples compile", () => {
  for (const [id, source] of Object.entries(DOC_EXAMPLES)) {
    it(`"${id}" compiles to a non-empty deck`, () => {
      const { html, slides, error } = compileChalk(source);
      expect(error, error).toBeUndefined();
      expect(html.length).toBeGreaterThan(0);
      expect(slides).toBeGreaterThanOrEqual(1);
    });
  }
});

describe("documentation examples parse to the constructs they claim", () => {
  it("the tangent scene has axes/plot/point/tangent/label objects", () => {
    const { kinds } = shapes(DOC_EXAMPLES["scene-tangent"]);
    for (const k of ["axes", "plot", "point", "tangent", "label"]) expect(kinds.has(k), k).toBe(true);
  });
  it("the area scene has an area object", () => {
    expect(shapes(DOC_EXAMPLES["scene-area"]).kinds.has("area")).toBe(true);
  });
  it("the derive block has two states", () => {
    const d = parse(DOC_EXAMPLES.derive).children[0]!.children.find((b) => b.type === "derive");
    expect(d && d.type === "derive" && d.states.length).toBe(2);
  });
  it("the proof has revealable steps", () => {
    const t = parse(DOC_EXAMPLES["proof-steps"]).children[0]!.children.find((b) => b.type === "theorem");
    expect(t && t.type === "theorem" && t.steps.length).toBe(2);
  });
  it("the py cell is a python code cell", () => {
    expect(shapes(DOC_EXAMPLES["code-py"]).codeLangs.has("py")).toBe(true);
  });
  it("the js cell is a javascript code cell", () => {
    expect(shapes(DOC_EXAMPLES["code-js"]).codeLangs.has("js")).toBe(true);
  });
  it("the 3D scene is a scene with a surface object", () => {
    const s = parse(DOC_EXAMPLES["scene3d-surface"]).children[0]!.children.find((b) => b.type === "scene");
    expect(s && s.type === "scene" && s.dimension).toBe("3d");
    expect(shapes(DOC_EXAMPLES["scene3d-surface"]).kinds.has("surface")).toBe(true);
  });
  it("the slider example declares a slider", () => {
    expect(shapes(DOC_EXAMPLES.slider).types.has("slider")).toBe(true);
  });
  it("the image example is a media block", () => {
    expect(shapes(DOC_EXAMPLES["media-image"]).types.has("media")).toBe(true);
  });
  it("the geo example is a geo block", () => {
    expect(shapes(DOC_EXAMPLES.geo).types.has("geo")).toBe(true);
  });

  it("the data-object examples parse to matrix / table / barchart kinds", () => {
    expect(shapes(DOC_EXAMPLES["scene-matrix"]).kinds.has("matrix")).toBe(true);
    expect(shapes(DOC_EXAMPLES["scene-table"]).kinds.has("table")).toBe(true);
    expect(shapes(DOC_EXAMPLES["scene-barchart"]).kinds.has("barchart")).toBe(true);
  });
  it("the network examples parse to graph / digraph kinds", () => {
    expect(shapes(DOC_EXAMPLES["scene-graph"]).kinds.has("graph")).toBe(true);
    expect(shapes(DOC_EXAMPLES["scene-digraph"]).kinds.has("digraph")).toBe(true);
  });
  it("the vector-field example parses to a vectorfield kind", () => {
    expect(shapes(DOC_EXAMPLES["scene-vectorfield"]).kinds.has("vectorfield")).toBe(true);
  });
  it("the placement example uses next_to and shift", () => {
    const src = DOC_EXAMPLES["scene-placement"];
    expect(src).toContain("next_to");
    expect(src).toContain("shift:");
  });
});
