import { describe, expect, it } from "vitest";
import {
  formatValue,
  referencedVars,
  substituteLatex,
  tokenizeLatex,
} from "../src/substitution.js";

describe("tokenizeLatex", () => {
  it("treats a backslash command as one protected token", () => {
    const toks = tokenizeLatex("\\alpha");
    expect(toks).toEqual([{ kind: "command", value: "\\alpha" }]);
  });

  it("separates a command from an adjacent bare variable", () => {
    const toks = tokenizeLatex("\\alpha a");
    expect(toks.map((t) => `${t.kind}:${t.value}`)).toEqual([
      "command:\\alpha",
      "other: ",
      "identifier:a",
    ]);
  });

  it("keeps a multi-letter run as a single identifier token", () => {
    const toks = tokenizeLatex("abc");
    expect(toks).toEqual([{ kind: "identifier", value: "abc" }]);
  });
});

describe("substituteLatex — token boundaries (the fiddly cases)", () => {
  it("substitutes a standalone slider `a` but never touches \\alpha", () => {
    expect(substituteLatex("\\alpha + a", { a: 2 })).toBe("\\alpha + {2}");
    // even with no space between them
    expect(substituteLatex("\\alpha a", { a: 5 })).toBe("\\alpha {5}");
  });

  it("does not corrupt the letters inside \\sin when the slider is `n`", () => {
    expect(substituteLatex("\\sin n", { n: 3 })).toBe("\\sin {3}");
    expect(substituteLatex("\\sin(n x)", { n: 3 })).toBe("\\sin({3} x)");
  });

  it("protects multi-letter identifiers from a single-letter slider", () => {
    // slider `a` must not rewrite the `a` inside `abc`
    expect(substituteLatex("abc + a", { a: 7 })).toBe("abc + {7}");
  });

  it("handles two sliders in one expression", () => {
    expect(substituteLatex("a x^2 + b", { a: 2, b: -3 })).toBe(
      "{2} x^2 + {-3}",
    );
  });

  it("substitutes the parabola slide's expression f(x) = a x^2", () => {
    expect(substituteLatex("f(x) = a x^2", { a: 2.5 })).toBe(
      "f(x) = {2.5} x^2",
    );
  });

  it("wraps values in braces so a negative value cannot corrupt a superscript", () => {
    expect(substituteLatex("x^a", { a: -2 })).toBe("x^{-2}");
  });

  it("leaves variables with no provided value untouched", () => {
    expect(substituteLatex("a + c", { a: 1 })).toBe("{1} + c");
  });

  it("does not touch function names like \\frac or \\sqrt", () => {
    expect(substituteLatex("\\sqrt{a} + \\frac{a}{2}", { a: 4 })).toBe(
      "\\sqrt{{4}} + \\frac{{4}}{2}",
    );
  });
});

describe("referencedVars", () => {
  it("reports which sliders a tex template reads (single-letter, token-aware)", () => {
    expect(referencedVars("f(x) = a x^2", ["a", "b"]).sort()).toEqual(["a"]);
    expect(referencedVars("\\alpha + a + b", ["a", "b"]).sort()).toEqual([
      "a",
      "b",
    ]);
    // `n` inside \sin is not a free reference
    expect(referencedVars("\\sin x", ["n"])).toEqual([]);
    // a multi-letter identifier is not a single-letter slider reference
    expect(referencedVars("abc", ["a"])).toEqual([]);
  });
});

describe("formatValue", () => {
  it("keeps numbers compact", () => {
    expect(formatValue(2)).toBe("2");
    expect(formatValue(2.5)).toBe("2.5");
    expect(formatValue(1 / 3)).toBe("0.3333");
    expect(formatValue(-0)).toBe("0");
  });
});
