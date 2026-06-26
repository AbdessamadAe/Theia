import { describe, expect, it } from "vitest";
import { discoverPython, pythonPackages } from "../src/discover-python.js";
import { planCells } from "../src/order.js";

describe("discoverPython — static dependency extraction", () => {
  it("finds slider reads, imports, and exposes", () => {
    const d = discoverPython(
      [
        'a = chalk.slider("a")',
        'k = chalk.imported("slope")',
        'chalk.expose("deriv", "2*a*x")',
        'chalk.tex("f' + "'" + '(x)")',
      ].join("\n"),
    );
    expect(d.sliders).toEqual(["a"]);
    expect(d.imports).toEqual(["slope"]);
    expect(d.exposes).toEqual(["deriv"]);
  });

  it("maps Python imports to Pyodide packages, ignoring stdlib", () => {
    const d = discoverPython(
      [
        "import numpy as np",
        "from sympy import Symbol, diff",
        "import matplotlib.pyplot as plt",
        "import io, base64, math", // stdlib → no packages
      ].join("\n"),
    );
    expect(d.packages.sort()).toEqual(["matplotlib", "numpy", "sympy"]);
  });

  it("unions packages across several cell sources", () => {
    const pkgs = pythonPackages([
      "import numpy",
      "import sympy",
      "import numpy\nimport pandas",
    ]);
    expect(pkgs.sort()).toEqual(["numpy", "pandas", "sympy"]);
  });

  it("returns no packages for a pure-Python cell", () => {
    expect(discoverPython('chalk.text("hi")').packages).toEqual([]);
  });
});

describe("cross-language dependency ordering", () => {
  it("orders a py producer before a js consumer (and vice versa)", () => {
    // py cell exposes "deriv"; js cell imports it → py must run first.
    const py = discoverPython('chalk.expose("deriv", "2*a*x")');
    const plan = planCells([
      { id: "js-consumer", imports: ["deriv"], exposes: [] },
      { id: "py-producer", imports: py.imports, exposes: py.exposes },
    ]);
    expect(plan.cyclic).toEqual([]);
    expect(plan.order).toEqual(["py-producer", "js-consumer"]);
  });

  it("detects a cross-language cycle (js↔py)", () => {
    const plan = planCells([
      { id: "js", imports: ["fromPy"], exposes: ["fromJs"] },
      { id: "py", imports: ["fromJs"], exposes: ["fromPy"] },
    ]);
    expect(plan.order).toEqual([]);
    expect(plan.cyclic.sort()).toEqual(["js", "py"]);
  });
});
