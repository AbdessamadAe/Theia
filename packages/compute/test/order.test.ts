import { describe, expect, it } from "vitest";
import { planCells, topologicalOrder } from "../src/order.js";

describe("topologicalOrder", () => {
  it("orders a linear chain by prerequisite", () => {
    const { order, cyclic } = topologicalOrder(
      ["c", "b", "a"],
      new Map([
        ["c", ["b"]],
        ["b", ["a"]],
        ["a", []],
      ]),
    );
    expect(cyclic).toEqual([]);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("is deterministic: independent nodes keep input order", () => {
    const { order } = topologicalOrder(
      ["a", "b", "c"],
      new Map([
        ["a", []],
        ["b", []],
        ["c", []],
      ]),
    );
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("detects a two-node cycle and leaves both unordered", () => {
    const { order, cyclic } = topologicalOrder(
      ["a", "b"],
      new Map([
        ["a", ["b"]],
        ["b", ["a"]],
      ]),
    );
    expect(order).toEqual([]);
    expect(cyclic.sort()).toEqual(["a", "b"]);
  });

  it("detects a self-cycle", () => {
    const { cyclic } = topologicalOrder("a".split(), new Map([["a", ["a"]]]));
    expect(cyclic).toEqual(["a"]);
  });

  it("orders a diamond so the join comes last", () => {
    const { order, cyclic } = topologicalOrder(
      ["d", "b", "c", "a"],
      new Map([
        ["a", []],
        ["b", ["a"]],
        ["c", ["a"]],
        ["d", ["b", "c"]],
      ]),
    );
    expect(cyclic).toEqual([]);
    expect(order[0]).toBe("a");
    expect(order[order.length - 1]).toBe("d");
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("d"));
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("d"));
  });
});

describe("planCells (import/expose names → evaluation order)", () => {
  it("orders a producer before its consumer regardless of document order", () => {
    // Consumer appears first in document order; must still run second.
    const plan = planCells([
      { id: "consumer", imports: ["slope"], exposes: [] },
      { id: "producer", imports: [], exposes: ["slope"] },
    ]);
    expect(plan.cyclic).toEqual([]);
    expect(plan.order).toEqual(["producer", "consumer"]);
  });

  it("ignores imports that no cell exposes (e.g. a slider or undefined)", () => {
    const plan = planCells([
      { id: "a", imports: ["x"], exposes: [] }, // x is a slider, not a cell
    ]);
    expect(plan.order).toEqual(["a"]);
    expect(plan.cyclic).toEqual([]);
  });

  it("reports two cells that import each other as cyclic", () => {
    const plan = planCells([
      { id: "a", imports: ["y"], exposes: ["x"] },
      { id: "b", imports: ["x"], exposes: ["y"] },
    ]);
    expect(plan.order).toEqual([]);
    expect(plan.cyclic.sort()).toEqual(["a", "b"]);
  });

  it("reports a cell that imports its own expose as cyclic", () => {
    const plan = planCells([{ id: "a", imports: ["x"], exposes: ["x"] }]);
    expect(plan.cyclic).toEqual(["a"]);
  });

  it("orders a producer→middle→consumer pipeline", () => {
    const plan = planCells([
      { id: "consumer", imports: ["b"], exposes: [] },
      { id: "middle", imports: ["a"], exposes: ["b"] },
      { id: "producer", imports: [], exposes: ["a"] },
    ]);
    expect(plan.cyclic).toEqual([]);
    expect(plan.order).toEqual(["producer", "middle", "consumer"]);
  });
});
