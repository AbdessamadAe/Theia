import { describe, expect, it } from "vitest";
import { makeCoordSystem, niceStep, parseRange } from "../src/coord.js";

const RECT = { x: 40, y: 10, width: 600, height: 400 };

describe("makeCoordSystem — data↔pixel mapping", () => {
  const cs = makeCoordSystem([-3, 3], [-1, 9], RECT);

  it("maps the data origin and corners to the right pixels (y flipped)", () => {
    // x = -3 → left edge; x = 3 → right edge.
    expect(cs.toPixel(-3, 0)[0]).toBeCloseTo(40);
    expect(cs.toPixel(3, 0)[0]).toBeCloseTo(640);
    // y = -1 (min) → bottom; y = 9 (max) → top (flipped).
    expect(cs.toPixel(0, -1)[1]).toBeCloseTo(410);
    expect(cs.toPixel(0, 9)[1]).toBeCloseTo(10);
  });

  it("places an interior point proportionally", () => {
    // x = 0 is the midpoint of [-3,3] → middle of the rect.
    expect(cs.toPixel(0, 0)[0]).toBeCloseTo(340);
  });

  it("round-trips through fromPixel", () => {
    for (const [x, y] of [
      [-3, -1],
      [0, 4],
      [1.5, 8.2],
      [3, 9],
    ] as const) {
      const [px, py] = cs.toPixel(x, y);
      const [bx, by] = cs.fromPixel(px, py);
      expect(bx).toBeCloseTo(x, 6);
      expect(by).toBeCloseTo(y, 6);
    }
  });

  it("reports pixels-per-unit on each axis", () => {
    const [sx, sy] = cs.scale();
    expect(sx).toBeCloseTo(100); // 600px / 6 units
    expect(sy).toBeCloseTo(40); // 400px / 10 units
  });
});

describe("parseRange / niceStep", () => {
  it("parses bracketed ranges and falls back when malformed", () => {
    expect(parseRange("[-3, 3]", [0, 1])).toEqual([-3, 3]);
    expect(parseRange("[0,9]", [0, 1])).toEqual([0, 9]);
    expect(parseRange("nonsense", [0, 1])).toEqual([0, 1]);
    expect(parseRange(undefined, [-5, 5])).toEqual([-5, 5]);
  });

  it("chooses 1/2/5 × 10^k steps", () => {
    expect(niceStep(6, 8)).toBeCloseTo(1);
    expect(niceStep(10, 5)).toBeCloseTo(2);
    expect(niceStep(100, 5)).toBeCloseTo(20);
  });
});
