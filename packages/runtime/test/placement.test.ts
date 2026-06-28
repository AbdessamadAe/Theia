import { describe, expect, it } from "vitest";
import { directionVector, placementOrder } from "../src/placement.js";

describe("placement order (next_to dependency resolution)", () => {
  it("resolves a target before its follower", () => {
    const { order, cycles } = placementOrder([
      { name: "cap", nextTo: "P" }, // follower declared first
      { name: "P" },
    ]);
    expect(cycles).toEqual([]);
    expect(order.indexOf("P")).toBeLessThan(order.indexOf("cap"));
  });

  it("handles a chain A→B→C in order", () => {
    const { order } = placementOrder([
      { name: "A", nextTo: "B" },
      { name: "B", nextTo: "C" },
      { name: "C" },
    ]);
    expect(order.indexOf("C")).toBeLessThan(order.indexOf("B"));
    expect(order.indexOf("B")).toBeLessThan(order.indexOf("A"));
  });

  it("detects a cycle A↔B and reports it (without hanging)", () => {
    const { cycles, order } = placementOrder([
      { name: "A", nextTo: "B" },
      { name: "B", nextTo: "A" },
    ]);
    expect(cycles.sort()).toEqual(["A", "B"]);
    expect(order).toHaveLength(2); // both still present (placement disabled)
  });

  it("tolerates an unknown target", () => {
    const { order, cycles } = placementOrder([{ name: "cap", nextTo: "ghost" }]);
    expect(cycles).toEqual([]);
    expect(order).toContain("cap");
  });
});

describe("direction vectors (data space, y up)", () => {
  it("maps cardinal directions", () => {
    expect(directionVector("up")).toEqual([0, 1]);
    expect(directionVector("down")).toEqual([0, -1]);
    expect(directionVector("left")).toEqual([-1, 0]);
    expect(directionVector("right")).toEqual([1, 0]);
  });
  it("defaults to right and normalizes diagonals", () => {
    expect(directionVector(undefined)).toEqual([1, 0]);
    const [dx, dy] = directionVector("up-right");
    expect(Math.hypot(dx, dy)).toBeCloseTo(1, 6);
  });
});
