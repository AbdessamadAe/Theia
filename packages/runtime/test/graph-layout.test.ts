import { describe, expect, it } from "vitest";
import { circularLayout, parseEdges, pathEdges, springLayout } from "../src/graph-layout.js";

describe("edge parsing", () => {
  it("parses undirected edges", () => {
    expect(parseEdges("[A-B, B-C, C-A]")).toEqual([
      { from: "A", to: "B" },
      { from: "B", to: "C" },
      { from: "C", to: "A" },
    ]);
  });
  it("parses directed edges", () => {
    expect(parseEdges("[X->Y, Y->Z]")).toEqual([
      { from: "X", to: "Y" },
      { from: "Y", to: "Z" },
    ]);
  });
  it("turns a node path into consecutive edges", () => {
    expect(pathEdges("A-B-C")).toEqual([
      { from: "A", to: "B" },
      { from: "B", to: "C" },
    ]);
  });
});

describe("layouts", () => {
  it("circular places n distinct nodes on the unit circle", () => {
    const pos = circularLayout(["A", "B", "C", "D"]);
    expect(pos.size).toBe(4);
    for (const [, [x, y]] of pos) expect(Math.hypot(x, y)).toBeCloseTo(1, 6);
    // distinct
    const keys = new Set([...pos.values()].map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`));
    expect(keys.size).toBe(4);
  });

  it("spring is deterministic, normalized, and pulls a connected pair closer than a non-edge", () => {
    const names = ["A", "B", "C"];
    const edges = [{ from: "A", to: "B" }];
    const a1 = springLayout(names, edges);
    const a2 = springLayout(names, edges);
    // deterministic
    expect([...a1.get("A")!]).toEqual([...a2.get("A")!]);
    // normalized to ~[-1,1]
    for (const [, [x, y]] of a1) {
      expect(Math.abs(x)).toBeLessThanOrEqual(1.001);
      expect(Math.abs(y)).toBeLessThanOrEqual(1.001);
    }
    const dist = (p: [number, number], q: [number, number]): number => Math.hypot(p[0] - q[0], p[1] - q[1]);
    const ab = dist(a1.get("A")!, a1.get("B")!);
    const ac = dist(a1.get("A")!, a1.get("C")!);
    expect(ab).toBeLessThan(ac); // the edge keeps A,B closer than the non-adjacent C
  });
});
