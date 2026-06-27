import { describe, expect, it } from "vitest";
import { boundVars, isDraggablePosition, isFreeLiteral } from "../src/drag.js";
import { makeCoordSystem } from "../src/coord.js";

describe("free-vs-derived classification", () => {
  it("accepts plain numeric literals as free coordinates", () => {
    for (const lit of ["0", "7.5", "-1.7", "+3", ".5", "-0.25", " 12 "]) {
      expect(isFreeLiteral(lit), lit).toBe(true);
    }
  });

  it("rejects any coordinate that references a binding or is computed", () => {
    for (const expr of ["s", "k*s^2", "f(t)", "a + 1", "2*pi", "t", undefined]) {
      expect(isFreeLiteral(expr), String(expr)).toBe(false);
    }
  });

  it("an `at (x, y)` is draggable IFF both coords are free literals", () => {
    expect(isDraggablePosition("-1.7", "7.5")).toBe(true); // free @label
    expect(isDraggablePosition("s", "k*s^2")).toBe(false); // derived @point
    expect(isDraggablePosition("-1.7", "k*s^2")).toBe(false); // mixed → derived
    expect(isDraggablePosition("0", undefined)).toBe(false);
  });

  it("surfaces the bound variables for the 'drag the slider' hint", () => {
    expect(boundVars("s", "k*s^2")).toEqual(["s", "k"]);
    expect(boundVars("f(t)", "0")).toEqual(["t"]); // literal coord contributes nothing
    expect(boundVars("-1.7", "7.5")).toEqual([]); // free → no bound vars
  });
});

describe("screen→axes coordinate mapping (reused renderer mapping)", () => {
  // A 400×300 pixel rect over x:[-3,3], y:[-1,9].
  const rect = { x: 0, y: 0, width: 400, height: 300 };
  const cs = makeCoordSystem([-3, 3], [-1, 9], rect);

  it("fromPixel is the exact inverse of toPixel the renderer draws with", () => {
    for (const [x, y] of [
      [-1.7, 7.5],
      [0, 0],
      [3, 9],
      [-3, -1],
    ] as Array<[number, number]>) {
      const [px, py] = cs.toPixel(x, y);
      const [bx, by] = cs.fromPixel(px, py);
      expect(bx).toBeCloseTo(x, 6);
      expect(by).toBeCloseTo(y, 6);
    }
  });

  it("maps a pixel drop to the expected data coordinate", () => {
    // Centre pixel → centre of the data range.
    expect(cs.fromPixel(200, 150)).toEqual([0, 4]);
    // y is flipped: top pixel is the max.
    const [, topY] = cs.fromPixel(0, 0);
    expect(topY).toBeCloseTo(9, 6);
  });
});
