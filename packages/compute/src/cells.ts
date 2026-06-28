/**
 * The code-cell engine (browser side) for both `js` and `py` cells.
 *
 * Execution model:
 *  - JS cells are compiled once with `new Function("theia", source)` (never
 *    `eval`), run synchronously, and discover their dependencies by running.
 *  - PY cells run in a single shared Pyodide interpreter (lazily loaded only if
 *    the deck has a py cell). Their dependencies are discovered *statically*
 *    from the source, so ordering and package selection happen before Pyodide
 *    is paid for.
 *  - Both languages feed ONE `planCells` call → one topological order with the
 *    existing cycle detection. A js cell and a py cell that read the same
 *    slider, or depend on each other's `expose`d values, order correctly.
 *  - Reactivity reuses the runtime's ReactiveGraph (passed in). JS cells re-run
 *    every animation frame; py cells re-run on a trailing debounce (so dragging
 *    a slider stays smooth and never blocks navigation).
 *  - Every run is isolated: a throwing cell (JS error or Python traceback)
 *    renders an inline error box and leaves the rest of the deck working.
 *
 * Imports no parser internals and no runtime internals — it takes a
 * structurally-typed graph handle.
 */
import { discoverPython, pythonPackages } from "./discover-python.js";
import { planCells } from "./order.js";
import {
  loadPyodideEngine,
  type PyodideFactory,
  type PyodideLike,
} from "./pyodide-host.js";

/** The slice of the runtime's reactive graph the compute layer needs. */
export interface ReactiveLike {
  get(name: string): number | undefined;
  addDependent(deps: string[], run: () => void): unknown;
}

export interface ComputeOptions {
  /** Override the Pyodide loader (used by tests to inject a fake). */
  pyodide?: PyodideFactory;
}

/** The API surface available inside a cell as the `theia` object (JS), and
 * mirrored for Python via a bridge of the same shape. */
export interface TheiaApi {
  slider(name: string): number;
  readonly sliders: Record<string, number>;
  readonly imports: Record<string, unknown>;
  expose(name: string, value: unknown): void;
  tex(latex: string): void;
  text(value: unknown): void;
  canvas(
    width?: number,
    height?: number,
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null };
}

interface KatexLike {
  render(tex: string, el: HTMLElement, opts: Record<string, unknown>): void;
}
function katex(): KatexLike | undefined {
  return (globalThis as unknown as { katex?: KatexLike }).katex;
}

interface Cell {
  id: string;
  lang: "js" | "py";
  source: string;
  fn: ((theia: TheiaApi) => unknown) | null; // js only
  compileError: string | null;
  packages: string[]; // py only
  outputEl: HTMLElement;
  errorEl: HTMLElement;
  readsSliders: Set<string>;
  imports: Set<string>;
  exposes: Set<string>;
  emitted: boolean;
}

const raf: (cb: () => void) => unknown =
  typeof requestAnimationFrame === "function"
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 16);

/** How long after the last slider change a py cell re-runs (ms). Python eval
 * is too heavy for every drag tick, so we update on the drag pause/release. */
const PY_DEBOUNCE_MS = 200;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function ensureChild(parent: HTMLElement, className: string): HTMLElement {
  let el = parent.querySelector<HTMLElement>(`.${className}`);
  if (!el) {
    el = document.createElement("div");
    el.className = className;
    parent.appendChild(el);
  }
  return el;
}

/** The Python preamble: defines a `theia` object mirroring the JS cell API,
 * bridged to JS via the injected `_theia_bridge`. Run once after load. */
const PY_PREAMBLE = `
import os as _os
_os.environ.setdefault("MPLBACKEND", "AGG")

class _Theia:
    def slider(self, name):
        return _theia_bridge.slider(name)
    def imported(self, name):
        return _theia_bridge.imported(name)
    def expose(self, name, value):
        _theia_bridge.expose(name, value)
    def tex(self, s):
        _theia_bridge.tex(str(s))
    def text(self, s):
        _theia_bridge.text(str(s))
    def figure(self, fig=None):
        import io, base64
        import matplotlib.pyplot as plt
        f = fig if fig is not None else plt.gcf()
        buf = io.BytesIO()
        f.savefig(buf, format="png", dpi=120, bbox_inches="tight")
        plt.close(f)
        data = base64.b64encode(buf.getvalue()).decode("ascii")
        _theia_bridge.image("data:image/png;base64," + data)

theia = _Theia()
`;

/**
 * Initialize every code cell on the page and join them to the reactive graph.
 * Safe to call once after the DOM and sliders are set up.
 */
export function initCells(graph: ReactiveLike, options: ComputeOptions = {}): void {
  const boxes = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.theia-cell[data-theia-cell="js"], .theia-cell[data-theia-cell="py"]',
    ),
  );
  if (boxes.length === 0) return;

  const registry: Record<string, unknown> = {};
  let currentPyCell: Cell | null = null;

  const cells: Cell[] = boxes.map((el, i) => {
    const lang = el.getAttribute("data-theia-cell") === "py" ? "py" : "js";
    const source = el.querySelector(".theia-code__source")?.textContent ?? "";
    const outputEl = ensureChild(el, "theia-cell__output");
    const errorEl = ensureChild(el, "theia-cell__error");

    let fn: ((theia: TheiaApi) => unknown) | null = null;
    let compileError: string | null = null;
    const readsSliders = new Set<string>();
    const imports = new Set<string>();
    const exposes = new Set<string>();
    let packages: string[] = [];

    if (lang === "js") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        fn = new Function("theia", source) as (theia: TheiaApi) => unknown;
      } catch (e) {
        compileError = errMsg(e);
      }
    } else {
      // Static discovery: learn deps + packages without running Python.
      const d = discoverPython(source);
      for (const s of d.sliders) readsSliders.add(s);
      for (const s of d.imports) imports.add(s);
      for (const s of d.exposes) exposes.add(s);
      packages = d.packages;
    }

    return {
      id: `cell${i}`,
      lang,
      source,
      fn,
      compileError,
      packages,
      outputEl,
      errorEl,
      readsSliders,
      imports,
      exposes,
      emitted: false,
    };
  });

  const pyCells = cells.filter((c) => c.lang === "py");

  // --- Output sinks --------------------------------------------------------

  function showError(cell: Cell, message: string): void {
    cell.outputEl.innerHTML = "";
    cell.errorEl.hidden = false;
    cell.errorEl.textContent = `Error: ${message}`;
  }

  function showCycle(cell: Cell): void {
    showError(
      cell,
      "circular dependency between code cells (a cell imports a value that, directly or indirectly, depends on its own output)",
    );
  }

  function showPyError(cell: Cell, e: unknown): void {
    // Pyodide throws with the full traceback in the message; keep the tail,
    // which holds the exception type and message.
    const lines = errMsg(e)
      .split("\n")
      .map((l) => l.replace(/\s+$/, ""))
      .filter((l) => l.length > 0);
    cell.outputEl.innerHTML = "";
    cell.errorEl.hidden = false;
    cell.errorEl.textContent = lines.slice(-8).join("\n") || "Python error";
  }

  function setLoading(cell: Cell, message: string): void {
    cell.errorEl.hidden = true;
    cell.outputEl.innerHTML = "";
    const div = document.createElement("div");
    div.className = "theia-cell__loading";
    div.textContent = message;
    cell.outputEl.appendChild(div);
  }

  function emitTex(cell: Cell, tex: string): void {
    const span = document.createElement("div");
    span.className = "theia-cell__tex";
    cell.outputEl.appendChild(span);
    const k = katex();
    if (k) {
      try {
        k.render(tex, span, { throwOnError: false, displayMode: true });
      } catch {
        span.textContent = tex;
      }
    } else {
      span.textContent = tex;
    }
  }

  function emitText(cell: Cell, value: unknown): void {
    const div = document.createElement("div");
    div.className = "theia-cell__value";
    div.textContent =
      typeof value === "object" ? safeJson(value) : String(value);
    cell.outputEl.appendChild(div);
  }

  function emitImage(cell: Cell, dataUrl: string): void {
    const img = document.createElement("img");
    img.className = "theia-cell__image";
    img.src = dataUrl;
    cell.outputEl.appendChild(img);
  }

  function getCanvas(
    cell: Cell,
    width?: number,
    height?: number,
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
    let canvas = cell.outputEl.querySelector("canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "theia-cell__canvas";
      cell.outputEl.appendChild(canvas);
    }
    if (width) canvas.width = width;
    if (height) canvas.height = height;
    return { canvas, ctx: canvas.getContext("2d") };
  }

  // --- JS cell API + evaluation -------------------------------------------

  function makeApi(cell: Cell): TheiaApi {
    return {
      slider(name: string): number {
        cell.readsSliders.add(name);
        const v = graph.get(name);
        return v === undefined ? NaN : v;
      },
      get sliders(): Record<string, number> {
        return new Proxy(
          {},
          {
            get: (_t, key): number | undefined => {
              if (typeof key !== "string") return undefined;
              cell.readsSliders.add(key);
              return graph.get(key);
            },
          },
        ) as Record<string, number>;
      },
      get imports(): Record<string, unknown> {
        return new Proxy(
          {},
          {
            get: (_t, key): unknown => {
              if (typeof key !== "string") return undefined;
              cell.imports.add(key);
              return registry[key];
            },
          },
        );
      },
      expose(name: string, value: unknown): void {
        cell.exposes.add(name);
        registry[name] = value;
      },
      tex(latex: string): void {
        cell.emitted = true;
        emitTex(cell, String(latex));
      },
      text(value: unknown): void {
        cell.emitted = true;
        emitText(cell, value);
      },
      canvas(width?: number, height?: number) {
        cell.emitted = true;
        return getCanvas(cell, width, height);
      },
    };
  }

  function evalJs(cell: Cell): void {
    cell.emitted = false;
    cell.errorEl.hidden = true;
    cell.errorEl.textContent = "";
    cell.outputEl.innerHTML = "";
    if (cell.compileError != null) {
      showError(cell, cell.compileError);
      return;
    }
    try {
      const ret = cell.fn!(makeApi(cell));
      if (!cell.emitted && ret !== undefined) emitText(cell, ret);
    } catch (e) {
      showError(cell, errMsg(e));
    }
  }

  // --- Python bridge (mirrors the JS API onto the current py cell) ---------

  const bridge = {
    slider(name: string): number {
      currentPyCell?.readsSliders.add(name);
      const v = graph.get(name);
      return v === undefined ? NaN : v;
    },
    imported(name: string): unknown {
      currentPyCell?.imports.add(name);
      return registry[name];
    },
    expose(name: string, value: unknown): void {
      if (currentPyCell) currentPyCell.exposes.add(name);
      registry[name] = value;
    },
    tex(s: string): void {
      if (currentPyCell) {
        currentPyCell.emitted = true;
        emitTex(currentPyCell, String(s));
      }
    },
    text(s: unknown): void {
      if (currentPyCell) {
        currentPyCell.emitted = true;
        emitText(currentPyCell, s);
      }
    },
    image(dataUrl: string): void {
      if (currentPyCell) {
        currentPyCell.emitted = true;
        emitImage(currentPyCell, String(dataUrl));
      }
    },
  };

  // --- Planning ------------------------------------------------------------

  // Discover JS deps by running each JS cell once (document order).
  for (const cell of cells) if (cell.lang === "js") evalJs(cell);

  const plan = planCells(
    cells.map((c) => ({
      id: c.id,
      imports: [...c.imports],
      exposes: [...c.exposes],
    })),
  );
  const byId = new Map(cells.map((c) => [c.id, c]));
  const ordered = new Set(plan.order);
  for (const id of plan.cyclic) showCycle(byId.get(id)!);

  const pyExposed = new Set<string>();
  for (const c of pyCells) for (const n of c.exposes) pyExposed.add(n);
  const jsDependsOnPy = cells.some(
    (c) => c.lang === "js" && [...c.imports].some((n) => pyExposed.has(n)),
  );

  function runJs(): void {
    for (const id of plan.order) {
      const cell = byId.get(id)!;
      if (cell.lang === "js") evalJs(cell);
    }
  }

  // --- Python evaluation (lazy, one-time interpreter) ----------------------

  const factory = options.pyodide ?? loadPyodideEngine;
  let pySetup: Promise<PyodideLike | null> | null = null;

  function pyStatus(message: string): void {
    for (const c of pyCells) if (ordered.has(c.id)) setLoading(c, message);
  }

  function ensurePy(): Promise<PyodideLike | null> {
    if (pySetup) return pySetup;
    pySetup = (async () => {
      try {
        const py = await factory(pyStatus);
        const pkgs = pythonPackages(pyCells.map((c) => c.source));
        if (pkgs.length > 0) {
          pyStatus(`Loading ${pkgs.join(", ")}…`);
          await py.loadPackage(pkgs);
        }
        py.globals.set("_theia_bridge", bridge);
        await py.runPythonAsync(PY_PREAMBLE);
        return py;
      } catch (e) {
        for (const c of pyCells) {
          if (ordered.has(c.id)) showError(c, `Python runtime failed: ${errMsg(e)}`);
        }
        return null;
      }
    })();
    return pySetup;
  }

  async function evalPy(py: PyodideLike, cell: Cell): Promise<void> {
    cell.emitted = false;
    cell.errorEl.hidden = true;
    cell.errorEl.textContent = "";
    cell.outputEl.innerHTML = "";
    currentPyCell = cell;
    try {
      const ret = await py.runPythonAsync(cell.source);
      if (
        !cell.emitted &&
        (typeof ret === "number" ||
          typeof ret === "string" ||
          typeof ret === "boolean")
      ) {
        emitText(cell, ret);
      }
    } catch (e) {
      showPyError(cell, e);
    } finally {
      currentPyCell = null;
    }
  }

  async function runPy(): Promise<void> {
    const py = await ensurePy();
    if (!py) return;
    for (const id of plan.order) {
      const cell = byId.get(id)!;
      if (cell.lang === "py") await evalPy(py, cell);
    }
    // Propagate py-exposed values into any JS cells that import them.
    if (jsDependsOnPy) runJs();
  }

  // Single-flight py runs: a slider move during a run queues exactly one rerun.
  let pyRunning = false;
  let pyPending = false;
  let pyTimer: ReturnType<typeof setTimeout> | undefined;
  async function runPySafe(): Promise<void> {
    if (pyRunning) {
      pyPending = true;
      return;
    }
    pyRunning = true;
    try {
      await runPy();
    } finally {
      pyRunning = false;
      if (pyPending) {
        pyPending = false;
        void runPySafe();
      }
    }
  }
  function schedulePy(): void {
    if (pyTimer) clearTimeout(pyTimer);
    pyTimer = setTimeout(() => void runPySafe(), PY_DEBOUNCE_MS);
  }

  // --- Initial evaluation --------------------------------------------------

  runJs(); // synchronous: JS-only decks are fully painted here.
  if (pyCells.some((c) => ordered.has(c.id))) {
    for (const c of pyCells) if (ordered.has(c.id)) setLoading(c, "Preparing Python…");
    void runPySafe();
  }

  // --- Reactivity: one dependent on the shared graph -----------------------

  const sliderDeps = new Set<string>();
  for (const c of cells) for (const s of c.readsSliders) sliderDeps.add(s);
  const anyPyReadsSlider = pyCells.some((c) => c.readsSliders.size > 0);

  if (sliderDeps.size > 0) {
    let jsScheduled = false;
    graph.addDependent([...sliderDeps], () => {
      if (!jsScheduled) {
        jsScheduled = true;
        raf(() => {
          jsScheduled = false;
          runJs();
        });
      }
      if (anyPyReadsSlider) schedulePy();
    });
  }
}
