/**
 * Build the reactive graph from the rendered DOM and wire it up.
 *
 * render-slides emits the facts this needs as data attributes:
 *   - a slider control:   .chalk-slider[data-slider] > input[type=range]
 *   - reactive math:      [data-chalk-math] (template tex) + [data-chalk-vars]
 *   - a plot:             .chalk-plot[data-expr][data-vars][data-xmin][data-xmax]
 *                         containing a <canvas>
 *   - a geometry block:   .chalk-geo[data-geo-src]
 *
 * This module never imports the parser; it reads only what the renderer wrote.
 */
import { compileExpr } from "./expr.js";
import { initGeo, type GeoSpec } from "./geo.js";
import { ReactiveGraph } from "./graph.js";
import { drawPlot, type PlotColors } from "./plot.js";
import { formatValue, substituteLatex } from "./substitution.js";

interface KatexLike {
  render(tex: string, el: HTMLElement, opts: Record<string, unknown>): void;
}

function katex(): KatexLike | undefined {
  return (globalThis as unknown as { katex?: KatexLike }).katex;
}

function readColors(): PlotColors {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string): string =>
    s.getPropertyValue(name).trim() || fallback;
  return {
    curve: v("--accent", "#2563eb"),
    grid: v("--border", "#e2e5ea"),
    axis: v("--muted", "#6b7280"),
    text: v("--muted", "#6b7280"),
  };
}

function parseVars(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function initReactive(): void {
  const graph = new ReactiveGraph();
  const plots: Array<() => void> = [];

  // --- Sliders → sources ----------------------------------------------------
  const sliders = document.querySelectorAll<HTMLElement>(".chalk-slider[data-slider]");
  sliders.forEach((box) => {
    const name = box.getAttribute("data-slider");
    const input = box.querySelector<HTMLInputElement>("input[type=range]");
    const valueEl = box.querySelector<HTMLElement>(".chalk-slider__value");
    if (!name || !input) return;
    graph.setValue(name, parseFloat(input.value));
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      if (valueEl) valueEl.textContent = `= ${formatValue(v)}`;
      graph.update(name, v);
    });
  });

  // --- Reactive math → dependents ------------------------------------------
  const k = katex();
  const maths = document.querySelectorAll<HTMLElement>("[data-chalk-math]");
  maths.forEach((el) => {
    const template = el.getAttribute("data-chalk-math");
    if (template === null) return;
    const vars = parseVars(el.getAttribute("data-chalk-vars"));
    const display = el.getAttribute("data-chalk-display") === "1";
    const renderMath = (): void => {
      if (!k) return;
      const tex = substituteLatex(template, graph.scope());
      try {
        k.render(tex, el, { displayMode: display, throwOnError: false });
      } catch {
        el.textContent = tex;
      }
    };
    graph.addDependent(vars, renderMath);
  });

  // --- Plots → dependents ---------------------------------------------------
  const plotEls = document.querySelectorAll<HTMLElement>(".chalk-plot[data-expr]");
  plotEls.forEach((box) => {
    const exprSrc = box.getAttribute("data-expr");
    const canvas = box.querySelector<HTMLCanvasElement>("canvas");
    if (!exprSrc || !canvas) return;
    let compiled;
    try {
      compiled = compileExpr(exprSrc);
    } catch {
      return; // leave the static label in place if the expression is invalid
    }
    const vars = parseVars(box.getAttribute("data-vars"));
    const xMin = parseFloat(box.getAttribute("data-xmin") || "-5");
    const xMax = parseFloat(box.getAttribute("data-xmax") || "5");
    const xVar = box.getAttribute("data-xvar") || "x";
    const redraw = (): void => {
      drawPlot(canvas, compiled, graph.scope(), {
        xMin,
        xMax,
        xVar,
        colors: readColors(),
      });
    };
    plots.push(redraw);
    graph.addDependent(vars, redraw);
  });

  // --- Geometry blocks ------------------------------------------------------
  const geoSpecs: GeoSpec[] = [];
  document.querySelectorAll<HTMLElement>(".chalk-geo[data-geo-src]").forEach((box) => {
    const src = box.getAttribute("data-geo-src") || "";
    const target = box.querySelector<HTMLElement>(".chalk-geo__applet") || box;
    geoSpecs.push({ container: target, commands: src.split("\n") });
  });
  initGeo(geoSpecs);

  // Initial paint, then keep plots in sync with theme + viewport changes.
  graph.runAll();
  document.addEventListener("chalk:themechange", () => plots.forEach((p) => p()));
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => plots.forEach((p) => p()), 80);
  });
}
