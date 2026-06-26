import { describe, expect, it } from "vitest";
import { compileExpr } from "../src/expr.js";

describe("compileExpr — parsing & evaluation", () => {
  it("evaluates the parabola plot expression a*x^2", () => {
    const e = compileExpr("a*x^2");
    expect(e.vars.sort()).toEqual(["a", "x"]);
    expect(e.eval({ a: 2, x: 3 })).toBe(18);
    expect(e.eval({ a: 0.5, x: 4 })).toBe(8);
  });

  it("respects operator precedence and right-associative powers", () => {
    expect(compileExpr("1 + 2 * 3").eval({})).toBe(7);
    expect(compileExpr("2 ^ 3 ^ 2").eval({})).toBe(512); // 2^(3^2)
    expect(compileExpr("-3^2").eval({})).toBe(-9); // unary binds looser than ^
    expect(compileExpr("(1 + 2) * 3").eval({})).toBe(9);
  });

  it("supports functions and constants without confusing them for variables", () => {
    const e = compileExpr("sin(x) + pi");
    // `sin` and `pi` are not free variables.
    expect(e.vars).toEqual(["x"]);
    expect(e.eval({ x: 0 })).toBeCloseTo(Math.PI, 10);
  });

  it("does not let a slider name bleed into a function/identifier name", () => {
    // slider `a` provided in scope; `abs` and `atan` must stay intact.
    const e = compileExpr("abs(a) + atan(a)");
    expect(e.vars).toEqual(["a"]);
    expect(e.eval({ a: -1 })).toBeCloseTo(1 + Math.atan(-1), 10);
  });

  it("returns NaN for unknown variables (gaps in the curve)", () => {
    expect(Number.isNaN(compileExpr("y + 1").eval({ x: 0 }))).toBe(true);
  });

  it("handles a variable shared between math and a plot (same name, same value)", () => {
    // The integration contract: a slider `a` used in both the LaTeX and the
    // plot resolves to the identical numeric value in each.
    const a = 2.5;
    const plot = compileExpr("a*x^2");
    expect(plot.eval({ a, x: 2 })).toBe(a * 4);
  });
});
