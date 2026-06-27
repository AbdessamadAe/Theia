import { describe, expect, it } from "vitest";
import {
  type Atom,
  CROSSFADE_CONFIDENCE,
  matchAtoms,
  shouldCrossfade,
} from "../src/match.js";

/** Build atoms from a string of single-char contents, e.g. "ax2" → 3 atoms. */
function atoms(s: string): Atom[] {
  return [...s].map((c) => ({ content: c }));
}

describe("matchAtoms — content matching (no hints)", () => {
  it("matches identical expressions one-to-one with full confidence", () => {
    const r = matchAtoms(atoms("ax2"), atoms("ax2"));
    expect(r.pairs.map((p) => [p.from, p.to])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    expect(r.unmatchedFrom).toEqual([]);
    expect(r.unmatchedTo).toEqual([]);
    expect(r.confidence).toBe(1);
  });

  it("glides surviving symbols and reports added/removed ones", () => {
    // "a+b"  →  "a+b+c": a,+,b survive; the trailing "+","c" are new.
    const r = matchAtoms(atoms("a+b"), atoms("a+b+c"));
    expect(r.pairs).toHaveLength(3);
    expect(r.unmatchedFrom).toEqual([]);
    expect(r.unmatchedTo.length).toBe(2); // the new "+ c"
    expect(r.confidence).toBeCloseTo((2 * 3) / (3 + 5), 5);
  });

  it("keeps surviving terms when a coefficient changes (completing the square)", () => {
    const from = atoms("ax2+bx+c");
    const to = atoms("a(x+b)2+c"); // schematic: a, x, b, c all survive
    const r = matchAtoms(from, to);
    const survivors = r.pairs
      .map((p) => from[p.from]!.content)
      .filter((ch) => "axbc".includes(ch));
    expect(survivors.length).toBeGreaterThanOrEqual(4);
    expect(r.confidence).toBeGreaterThan(CROSSFADE_CONFIDENCE);
  });
});

describe("matchAtoms — author key hints", () => {
  it("crosses ambiguous like-terms when keys say so", () => {
    // Two identical "x" atoms swap places; keys force the cross.
    const from: Atom[] = [
      { content: "x", key: "ck-a" },
      { content: "+", key: null },
      { content: "x", key: "ck-b" },
    ];
    const to: Atom[] = [
      { content: "x", key: "ck-b" },
      { content: "+", key: null },
      { content: "x", key: "ck-a" },
    ];
    const r = matchAtoms(from, to);
    const map = new Map(r.pairs.map((p) => [p.from, p.to]));
    expect(map.get(0)).toBe(2); // ck-a: from[0] → to[2]
    expect(map.get(2)).toBe(0); // ck-b: from[2] → to[0]
  });

  it("without keys, identical atoms match by nearest position (no cross)", () => {
    const from = atoms("x+x");
    const to = atoms("x+x");
    const r = matchAtoms(from, to);
    const map = new Map(r.pairs.map((p) => [p.from, p.to]));
    expect(map.get(0)).toBe(0);
    expect(map.get(2)).toBe(2);
  });

  it("keys take priority over content/position", () => {
    const from: Atom[] = [
      { content: "a", key: "ck-1" },
      { content: "a" },
    ];
    const to: Atom[] = [
      { content: "a" },
      { content: "a", key: "ck-1" },
    ];
    const r = matchAtoms(from, to);
    const map = new Map(r.pairs.map((p) => [p.from, p.to]));
    expect(map.get(0)).toBe(1); // keyed pair wins
  });
});

describe("confidence-threshold fallback", () => {
  it("flags a cross-fade when little content is shared", () => {
    // ∫x² dx → 1/3 share only "1": low confidence.
    const r = matchAtoms(atoms("∫01x2dx"), atoms("13"));
    expect(r.confidence).toBeLessThan(CROSSFADE_CONFIDENCE);
    expect(shouldCrossfade(r)).toBe(true);
  });

  it("does not cross-fade when most content survives", () => {
    const r = matchAtoms(atoms("ax2+bx+c"), atoms("ax2+bx+d"));
    expect(shouldCrossfade(r)).toBe(false);
  });

  it("treats two empty expressions as fully confident", () => {
    const r = matchAtoms([], []);
    expect(r.confidence).toBe(1);
    expect(shouldCrossfade(r)).toBe(false);
  });
});
