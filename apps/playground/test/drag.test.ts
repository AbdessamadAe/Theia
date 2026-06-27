import type { SceneBlock, SceneObject } from "@chalk/ast";
import { parse } from "@chalk/parser";
import { describe, expect, it } from "vitest";
import { coordEdits, fmt } from "../src/lib/drag.js";

/** Find a scene object's source span the way the renderer exposes it. */
function spanOf(source: string, name: string): [number, number] {
  const scene = parse(source)
    .children.flatMap((s) => s.children)
    .find((b): b is SceneBlock => b.type === "scene")!;
  const obj = scene.objects.find((o: SceneObject) => o.name === name)!;
  return [obj.loc.start.offset, obj.loc.end.offset];
}

function apply(source: string, edits: { from: number; to: number; insert: string }[]): string {
  // Apply right-to-left so earlier offsets stay valid.
  let out = source;
  for (const e of [...edits].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, e.from) + e.insert + out.slice(e.to);
  }
  return out;
}

const SRC = [
  "## Graphing",
  "",
  ":::scene",
  "@axes ax x:[-3,3] y:[-1,9] grid",
  "@plot f on ax : k*x^2",
  "@point P on ax at (s, k*s^2)",
  '@label lab on ax at (-1.7, 7.5) "f(x) = k x^2"',
  ":::",
].join("\n");

describe("fmt", () => {
  it("formats to <=2 decimals without trailing zeros", () => {
    expect(fmt(1)).toBe("1");
    expect(fmt(1.5)).toBe("1.5");
    expect(fmt(-1.234)).toBe("-1.23");
    expect(fmt(2.001)).toBe("2");
  });
});

describe("coordEdits — surgical, minimal text rewrite of `at (…)`", () => {
  it("rewrites ONLY the two coordinate numbers of the free @label", () => {
    const span = spanOf(SRC, "lab");
    const edits = coordEdits(SRC, span, 0.5, 6)!;
    expect(edits).toHaveLength(2);
    // The replaced ranges are exactly the "-1.7" and "7.5" tokens.
    expect(SRC.slice(edits[0]!.from, edits[0]!.to)).toBe("-1.7");
    expect(SRC.slice(edits[1]!.from, edits[1]!.to)).toBe("7.5");
    expect(edits[0]!.insert).toBe("0.5");
    expect(edits[1]!.insert).toBe("6");
  });

  it("the edit is minimal: nothing outside the numbers changes", () => {
    const span = spanOf(SRC, "lab");
    const out = apply(SRC, coordEdits(SRC, span, 0.5, 6)!);
    expect(out).toContain('@label lab on ax at (0.5, 6) "f(x) = k x^2"');
    // The whole rest of the document is byte-identical.
    expect(out.replace('at (0.5, 6)', 'at (-1.7, 7.5)')).toBe(SRC);
  });

  it("re-parses to place the object at the dropped location", () => {
    const span = spanOf(SRC, "lab");
    const out = apply(SRC, coordEdits(SRC, span, 0.5, 6)!);
    const scene = parse(out)
      .children.flatMap((s) => s.children)
      .find((b): b is SceneBlock => b.type === "scene")!;
    const lab = scene.objects.find((o) => o.name === "lab")!;
    expect(lab.args.x).toBe("0.5");
    expect(lab.args.y).toBe("6");
  });

  it("round-trips: re-rewriting back to the original numbers restores the source", () => {
    const span = spanOf(SRC, "lab");
    const moved = apply(SRC, coordEdits(SRC, span, 0.5, 6)!);
    const span2 = spanOf(moved, "lab");
    const back = apply(moved, coordEdits(moved, span2, -1.7, 7.5)!);
    expect(back).toBe(SRC);
  });
});
