/**
 * The JavaScript code-cell engine (browser side).
 *
 * Execution model:
 *  - Each cell is compiled once with `new Function("chalk", source)` — never
 *    `eval` — giving it its own function scope. Cells are isolated: they share
 *    no globals and communicate only through the injected `chalk` object.
 *  - `chalk` exposes the current slider values, a cross-cell value channel
 *    (`expose`/`imports`), and output sinks (`tex`, `text`, `canvas`).
 *  - Cells + sliders form ONE dependency graph (the runtime's ReactiveGraph,
 *    passed in). A cell that reads a slider becomes a dependent of it; a cell
 *    that imports another cell's exposed value is ordered after it. Evaluation
 *    runs in topological order; cells on a cycle render an inline error.
 *  - Every run is wrapped in try/catch: a throwing cell shows a readable error
 *    box on its slide and never disturbs the other cells or the deck.
 *
 * This module imports no parser internals and no runtime internals — it takes a
 * structurally-typed graph handle, so the package boundary stays clean.
 */
import { planCells } from "./order.js";

/** The slice of the runtime's reactive graph the compute layer needs. */
export interface ReactiveLike {
  get(name: string): number | undefined;
  addDependent(deps: string[], run: () => void): unknown;
}

/** The API surface available inside a `js` cell as the `chalk` object. */
export interface ChalkApi {
  /** Current value of a slider by name (NaN if it does not exist). */
  slider(name: string): number;
  /** All slider values; reading a key registers a dependency on that slider. */
  readonly sliders: Record<string, number>;
  /** Values exposed by other cells; reading a key creates a cell dependency. */
  readonly imports: Record<string, unknown>;
  /** Publish a value for other cells to import by name. */
  expose(name: string, value: unknown): void;
  /** Emit a LaTeX string, rendered by KaTeX into the cell's output. */
  tex(latex: string): void;
  /** Emit a plain text / numeric value into the cell's output. */
  text(value: unknown): void;
  /** Get a canvas (mounted in the cell's output) to draw a figure into. */
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
  fn: ((chalk: ChalkApi) => unknown) | null;
  compileError: string | null;
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

/** Find a child by selector, creating it if the renderer did not emit one. */
function ensureChild(parent: HTMLElement, className: string): HTMLElement {
  let el = parent.querySelector<HTMLElement>(`.${className}`);
  if (!el) {
    el = document.createElement("div");
    el.className = className;
    parent.appendChild(el);
  }
  return el;
}

/**
 * Initialize every `js` code cell on the page and join them to the reactive
 * graph. Safe to call once after the DOM and sliders are set up.
 */
export function initCells(graph: ReactiveLike): void {
  const boxes = Array.from(
    document.querySelectorAll<HTMLElement>('.chalk-cell[data-chalk-cell="js"]'),
  );
  if (boxes.length === 0) return;

  const registry: Record<string, unknown> = {};

  const cells: Cell[] = boxes.map((el, i) => {
    const srcEl = el.querySelector(".chalk-code__source");
    const source = srcEl?.textContent ?? "";
    let fn: ((chalk: ChalkApi) => unknown) | null = null;
    let compileError: string | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      fn = new Function("chalk", source) as (chalk: ChalkApi) => unknown;
    } catch (e) {
      compileError = errMsg(e);
    }
    return {
      id: `cell${i}`,
      fn,
      compileError,
      outputEl: ensureChild(el, "chalk-cell__output"),
      errorEl: ensureChild(el, "chalk-cell__error"),
      readsSliders: new Set<string>(),
      imports: new Set<string>(),
      exposes: new Set<string>(),
      emitted: false,
    };
  });

  function showError(cell: Cell, message: string): void {
    cell.outputEl.innerHTML = "";
    cell.errorEl.hidden = false;
    cell.errorEl.textContent = `Error: ${message}`;
  }

  function emitTex(cell: Cell, tex: string): void {
    const span = document.createElement("div");
    span.className = "chalk-cell__tex";
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
    div.className = "chalk-cell__value";
    div.textContent = typeof value === "object" ? safeJson(value) : String(value);
    cell.outputEl.appendChild(div);
  }

  function getCanvas(
    cell: Cell,
    width?: number,
    height?: number,
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
    let canvas = cell.outputEl.querySelector("canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "chalk-cell__canvas";
      cell.outputEl.appendChild(canvas);
    }
    if (width) canvas.width = width;
    if (height) canvas.height = height;
    return { canvas, ctx: canvas.getContext("2d") };
  }

  function makeApi(cell: Cell): ChalkApi {
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

  function evalCell(cell: Cell): void {
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

  // Discovery pass (document order): learn each cell's reads/imports/exposes.
  for (const cell of cells) evalCell(cell);

  // Plan a dependency order from the discovered import/expose names.
  const plan = planCells(
    cells.map((c) => ({
      id: c.id,
      imports: [...c.imports],
      exposes: [...c.exposes],
    })),
  );
  const byId = new Map(cells.map((c) => [c.id, c]));

  function runAll(): void {
    for (const key of Object.keys(registry)) delete registry[key];
    for (const id of plan.order) evalCell(byId.get(id)!);
    for (const id of plan.cyclic) {
      showError(
        byId.get(id)!,
        "circular dependency between code cells (a cell imports a value that, directly or indirectly, depends on its own output)",
      );
    }
  }

  // First real evaluation, in dependency order.
  runAll();

  // Join the reactive graph: any slider a cell reads re-runs the cells (in
  // order) when it moves. Coalesced to one run per animation frame so dragging
  // stays smooth.
  const sliderDeps = new Set<string>();
  for (const c of cells) for (const s of c.readsSliders) sliderDeps.add(s);
  if (sliderDeps.size > 0) {
    let scheduled = false;
    graph.addDependent([...sliderDeps], () => {
      if (scheduled) return;
      scheduled = true;
      raf(() => {
        scheduled = false;
        runAll();
      });
    });
  }
}
