import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  Block,
  CodeCell,
  DocumentNode,
  GeoBlock,
  Inline,
  InlineMath,
  Paragraph,
  Plot,
  Slide,
  Slider,
  TheoremBlock,
} from "@chalk/ast";
import { walk } from "@chalk/ast";
import { describe, expect, it } from "vitest";
import { parse } from "../src/index.js";

const source = readFileSync(
  fileURLToPath(new URL("../../../examples/limits.chalk", import.meta.url)),
  "utf8",
);

const doc: DocumentNode = parse(source);

/** Find the slide whose heading begins with `prefix` (plain text). */
function slideByHeading(prefix: string): Slide {
  const found = doc.children.find((s) =>
    headingText(s).startsWith(prefix),
  );
  if (!found) throw new Error(`no slide heading starts with "${prefix}"`);
  return found;
}

function headingText(slide: Slide): string {
  return slide.heading
    .map((n) => (n.type === "text" ? n.value : n.type === "inlineMath" ? n.tex : ""))
    .join("");
}

describe("parse(limits.chalk) — the north-star lecture", () => {
  it("produces a document with the right title", () => {
    expect(doc.type).toBe("document");
    expect(doc.title).toBe("Limits and Continuity");
  });

  it("splits into the expected slides (one title, five content)", () => {
    const titleSlides = doc.children.filter((s) => s.kind === "title");
    const contentSlides = doc.children.filter((s) => s.kind === "content");
    expect(titleSlides).toHaveLength(1);
    expect(contentSlides).toHaveLength(5);
    expect(headingText(titleSlides[0]!)).toBe("Limits and Continuity");
    expect(contentSlides.map(headingText)).toEqual([
      "The intuition behind a limit",
      "Watching a parabola change",
      "A first epsilon–delta proof",
      "Continuity, geometrically",
      "Checking continuity numerically",
    ]);
  });

  it("parses inline math and emphasis inside prose", () => {
    const slide = slideByHeading("The intuition");
    const para = slide.children[0] as Paragraph;
    expect(para.type).toBe("paragraph");
    const maths = para.children.filter(
      (c): c is InlineMath => c.type === "inlineMath",
    );
    expect(maths[0]!.tex).toBe("f(x) \\to L");
    // **no breaks** strong and *arbitrarily close* emphasis exist on title slide.
    const titleBody = doc.children[0]!.children[0] as Paragraph;
    expect(titleBody.children.some((c) => c.type === "strong")).toBe(true);
    expect(para.children.some((c) => c.type === "emphasis")).toBe(true);
  });

  it("parses a :::definition with a title, prose, and display math", () => {
    const slide = slideByHeading("The intuition");
    const thm = slide.children.find(
      (b): b is TheoremBlock => b.type === "theorem",
    )!;
    expect(thm.kind).toBe("definition");
    expect(thm.title).toBe("Limit of a function");
    expect(thm.steps).toHaveLength(0);
    const display = thm.children.find((b) => b.type === "math");
    expect(display).toBeDefined();
    expect((display as { tex: string }).tex).toContain("\\implies");
  });

  it("parses a @slider with full range into the AST", () => {
    const slide = slideByHeading("Watching a parabola");
    const slider = slide.children.find(
      (b): b is Slider => b.type === "slider",
    )!;
    expect(slider).toMatchObject({
      type: "slider",
      name: "a",
      min: 0,
      max: 3,
      default: 1,
    });
  });

  it("parses a @plot and records the slider variables it references", () => {
    const slide = slideByHeading("Watching a parabola");
    const plot = slide.children.find((b): b is Plot => b.type === "plot")!;
    expect(plot.lhs).toBe("f(x)");
    expect(plot.expr).toBe("a*x^2");
    // `a` is a declared slider; `x` is the free plot variable, not a slider.
    expect(plot.vars).toEqual(["a"]);
  });

  it("parses a :::proof with three structured steps ending in QED", () => {
    const slide = slideByHeading("A first epsilon");
    const proof = slide.children.find(
      (b): b is TheoremBlock => b.type === "theorem",
    )!;
    expect(proof.kind).toBe("proof");
    expect(proof.steps).toHaveLength(3);
    expect(proof.steps.map((s) => s.index)).toEqual([0, 1, 2]);
    // Pre-step prose ("We show …") lives in children, not in steps.
    expect(proof.children).toHaveLength(1);
    // The final step ends in the QED square.
    const lastPara = proof.steps[2]!.children[0] as Paragraph;
    const lastMath = lastPara.children
      .filter((c): c is InlineMath => c.type === "inlineMath")
      .pop()!;
    expect(lastMath.tex).toBe("\\blacksquare");
  });

  it("parses a :::geo block, keeping its body verbatim", () => {
    const slide = slideByHeading("Continuity, geometrically");
    const geo = slide.children.find((b): b is GeoBlock => b.type === "geo")!;
    expect(geo.source).toContain("A = Point(1, 0)");
    expect(geo.source).toContain("f = Function(x^2 - 1, -3, 3)");
  });

  it("parses a fenced code cell with language and verbatim source", () => {
    const slide = slideByHeading("Checking continuity");
    const code = slide.children.find((b): b is CodeCell => b.type === "code")!;
    expect(code.lang).toBe("js");
    expect(code.source).toContain("const f = (x) => 3 * x + 1;");
    expect(code.source).toContain("continuous:");
    // The fence markers themselves are not part of the source.
    expect(code.source).not.toContain("```");
  });

  it("parses a trailing :::remark block", () => {
    const slide = slideByHeading("Checking continuity");
    const remark = slide.children.find(
      (b): b is TheoremBlock => b.type === "theorem" && b.kind === "remark",
    )!;
    expect(remark).toBeDefined();
    expect((remark.children[0] as Paragraph).type).toBe("paragraph");
  });

  it("gives every node a source location with a 1-based line", () => {
    let count = 0;
    walk(doc, (node) => {
      count++;
      expect(node.loc).toBeDefined();
      expect(node.loc.start.line).toBeGreaterThanOrEqual(1);
      expect(node.loc.end.offset).toBeGreaterThanOrEqual(node.loc.start.offset);
    });
    expect(count).toBeGreaterThan(20);
  });
});

describe("parse — focused unit cases", () => {
  it("does not parse $ or ::: inside a fenced code cell", () => {
    const d = parse("## S\n\n```js\nconst s = '$x$';\n// :::definition\n```\n");
    const code = (d.children[0] as Slide).children[0] as CodeCell;
    expect(code.type).toBe("code");
    expect(code.source).toBe("const s = '$x$';\n// :::definition");
  });

  it("keeps math bodies verbatim, including backslashes and pipes", () => {
    const d = parse("## S\n\nThe set $\\{x : |x-a| < \\delta\\}$ is open.\n");
    const para = (d.children[0] as Slide).children[0] as Paragraph;
    const math = para.children.find(
      (c): c is InlineMath => c.type === "inlineMath",
    )!;
    expect(math.tex).toBe("\\{x : |x-a| < \\delta\\}");
  });

  it("treats an escaped \\$ as a literal dollar sign, not math", () => {
    const d = parse("## S\n\nIt costs \\$5 and \\$10.\n");
    const para = (d.children[0] as Slide).children[0] as Paragraph;
    const inlineMaths = para.children.filter((c) => c.type === "inlineMath");
    expect(inlineMaths).toHaveLength(0);
    const text = (para.children as Inline[])
      .map((c) => (c.type === "text" ? c.value : ""))
      .join("");
    expect(text).toContain("$5 and $10");
  });

  it("parses a py code cell and a step-less theorem", () => {
    const d = parse(
      "## S\n\n:::lemma Squeeze\nIf $g \\le f \\le h$ then …\n:::\n\n```py\nimport numpy as np\n```\n",
    );
    const blocks = (d.children[0] as Slide).children;
    const lemma = blocks.find(
      (b): b is TheoremBlock => b.type === "theorem",
    )!;
    expect(lemma.kind).toBe("lemma");
    expect(lemma.title).toBe("Squeeze");
    const code = blocks.find((b): b is CodeCell => b.type === "code")!;
    expect(code.lang).toBe("py");
  });
});
