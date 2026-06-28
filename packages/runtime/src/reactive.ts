/**
 * Build the reactive graph from the rendered DOM and wire it up.
 *
 * render-slides emits the facts this needs as data attributes:
 *   - a slider control:   .chalk-slider[data-slider] > input[type=range]
 *   - reactive math:      [data-chalk-math] (template tex) + [data-chalk-vars]
 *                         display math morphs on change; inline re-renders.
 *   - a plot:             .chalk-plot[data-expr][data-vars][data-xmin][data-xmax]
 *                         optionally [data-point-x] + [data-follow] followers
 *   - a geometry block:   .chalk-geo[data-geo-src]
 *
 * Reactive morphs (Part A) and followers (Part B) both attach to THIS graph as
 * dependents and share one interrupt/retarget policy (RetargetController), so
 * there is no second reactivity system.
 *
 * This module never imports the parser; it reads only what the renderer wrote.
 */
import { initCells } from "@theia/compute/browser";
import { compileExpr } from "./expr.js";
import { initGeo, type GeoSpec } from "./geo.js";
import { ReactiveGraph } from "./graph.js";
import { MorphController } from "./morph.js";
import { drawPlot, type PlotColors, type PlotMap } from "./plot.js";
import { type AnimHandle, RetargetController } from "./retarget.js";
import { initScenes } from "./scene.js";
import { formatValue, substituteLatex } from "./substitution.js";

interface KatexLike {
  render(tex: string, el: HTMLElement, opts: Record<string, unknown>): void;
}
function katex(): KatexLike | undefined {
  return (globalThis as unknown as { katex?: KatexLike }).katex;
}

function prefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
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

/** A rAF number tween used by followers; returns a cancel handle. */
function tweenNumber(
  from: number,
  to: number,
  duration: number,
  onFrame: (value: number) => void,
): AnimHandle {
  if (from === to || typeof requestAnimationFrame !== "function") {
    onFrame(to);
    return { cancel() {} };
  }
  const start = performance.now();
  let raf = requestAnimationFrame(function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    onFrame(from + (to - from) * eased);
    if (p < 1) raf = requestAnimationFrame(tick);
  });
  return {
    cancel() {
      if (raf) cancelAnimationFrame(raf);
    },
  };
}

export function initReactive(): void {
  const graph = new ReactiveGraph();
  const repaints: Array<() => void> = [];
  const k = katex();

  // --- Sliders → sources ----------------------------------------------------
  document
    .querySelectorAll<HTMLElement>(".chalk-slider[data-slider]")
    .forEach((box) => {
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
  document.querySelectorAll<HTMLElement>("[data-chalk-math]").forEach((el) => {
    const template = el.getAttribute("data-chalk-math");
    if (template === null) return;
    const vars = parseVars(el.getAttribute("data-chalk-vars"));
    const display = el.getAttribute("data-chalk-display") === "1";
    const texFor = (): string => substituteLatex(template, graph.scope());

    if (!display) {
      // Inline: a small value mid-sentence — re-render instantly (no morph).
      graph.addDependent(vars, () => {
        if (!k) return;
        try {
          k.render(texFor(), el, { displayMode: false, throwOnError: false });
        } catch {
          el.textContent = texFor();
        }
      });
      return;
    }

    // Display equation (Part A): morph from current → new on change.
    const initial = document.createElement("span");
    initial.className = "chalk-morph__state";
    while (el.firstChild) initial.appendChild(el.firstChild);
    el.replaceChildren(initial);
    el.classList.add("chalk-morph");
    const morpher = new MorphController(el);

    const renderState = (): HTMLElement => {
      const span = document.createElement("span");
      span.className = "chalk-morph__state";
      if (k) {
        try {
          k.render(texFor(), span, { displayMode: true, throwOnError: false });
        } catch {
          span.textContent = texFor();
        }
      } else {
        span.textContent = texFor();
      }
      return span;
    };

    const retarget = new RetargetController<void>({
      reducedMotion: prefersReduced,
      instant: () => morpher.setInstant(renderState()),
      animate: () => {
        morpher.morphTo(renderState());
        return { cancel() {} }; // MorphController self-interrupts on re-entry
      },
    });
    graph.addDependent(vars, () => retarget.set(undefined));
  });

  // --- Plots (+ optional followers) → dependents ---------------------------
  document
    .querySelectorAll<HTMLElement>(".chalk-plot[data-expr]")
    .forEach((box) => {
      const exprSrc = box.getAttribute("data-expr");
      const canvas = box.querySelector<HTMLCanvasElement>("canvas");
      if (!exprSrc || !canvas) return;
      let compiled;
      try {
        compiled = compileExpr(exprSrc);
      } catch {
        return;
      }
      const vars = parseVars(box.getAttribute("data-vars"));
      const xMin = parseFloat(box.getAttribute("data-xmin") || "-5");
      const xMax = parseFloat(box.getAttribute("data-xmax") || "5");
      const xVar = box.getAttribute("data-xvar") || "x";
      const pointXSrc = box.getAttribute("data-point-x");
      const follows = parseVars(box.getAttribute("data-follow"));

      // Plain plot: redraw on its slider vars (Phase 3 behavior).
      if (!pointXSrc) {
        const redraw = (): void => {
          drawPlot(canvas, compiled, graph.scope(), {
            xMin,
            xMax,
            xVar,
            colors: readColors(),
          });
        };
        repaints.push(redraw);
        graph.addDependent(vars, redraw);
        return;
      }

      // Plot with followers (Part B): a tracking point + tangent/dropline/label.
      let pointExpr;
      try {
        pointExpr = compileExpr(pointXSrc);
      } catch {
        return;
      }
      const labelEl = ensureLabel(box);
      let displayedT = pointExpr.eval(graph.scope());

      const render = (t: number): void => {
        displayedT = t;
        const scope = graph.scope();
        const colors = readColors();
        const map = drawPlot(canvas, compiled, scope, {
          xMin,
          xMax,
          xVar,
          colors,
          overlay: (ctx, m) =>
            drawFollowers(ctx, m, scope, compiled!, xVar, t, follows, colors),
        });
        if (map) {
          positionLabel(labelEl, canvas, map, scope, compiled!, xVar, t, follows);
        }
      };

      const retarget = new RetargetController<void>({
        reducedMotion: prefersReduced,
        instant: () => render(pointExpr!.eval(graph.scope())),
        animate: () =>
          tweenNumber(displayedT, pointExpr!.eval(graph.scope()), 420, render),
      });

      const allVars = Array.from(new Set([...vars, ...pointExpr.vars]));
      repaints.push(() => render(pointExpr!.eval(graph.scope())));
      graph.addDependent(allVars, () => retarget.set(undefined));
    });

  // --- Geometry blocks ------------------------------------------------------
  const geoSpecs: GeoSpec[] = [];
  document
    .querySelectorAll<HTMLElement>(".chalk-geo[data-geo-src]")
    .forEach((box) => {
      const src = box.getAttribute("data-geo-src") || "";
      const target = box.querySelector<HTMLElement>(".chalk-geo__applet") || box;
      geoSpecs.push({ container: target, commands: src.split("\n") });
    });
  initGeo(geoSpecs);

  // --- Scenes (Phase 8 graphing) -------------------------------------------
  // Scenes join this same graph: object expressions re-evaluate on slider
  // change and their +animate verbs ride the shared advance flow.
  initScenes(graph);

  // --- JS / Python code cells (compute layer) ------------------------------
  initCells(graph);

  // Initial paint, then keep plots in sync with theme + viewport changes.
  graph.runAll();
  document.addEventListener("chalk:themechange", () =>
    repaints.forEach((p) => p()),
  );
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => repaints.forEach((p) => p()), 80);
  });
}

// --- Follower drawing helpers ----------------------------------------------

function ensureLabel(box: HTMLElement): HTMLElement {
  if (getComputedStyle(box).position === "static") box.style.position = "relative";
  let el = box.querySelector<HTMLElement>(".chalk-plot__label");
  if (!el) {
    el = document.createElement("div");
    el.className = "chalk-plot__label";
    box.appendChild(el);
  }
  return el;
}

function slopeAt(
  scope: Record<string, number>,
  expr: { eval(s: Record<string, number>): number },
  xVar: string,
  t: number,
  span: number,
): number {
  const h = span * 1e-3 || 1e-3;
  const yAt = (x: number): number => expr.eval({ ...scope, [xVar]: x });
  return (yAt(t + h) - yAt(t - h)) / (2 * h);
}

function drawFollowers(
  ctx: CanvasRenderingContext2D,
  map: PlotMap,
  scope: Record<string, number>,
  expr: { eval(s: Record<string, number>): number },
  xVar: string,
  t: number,
  follows: string[],
  colors: PlotColors,
): void {
  const y = expr.eval({ ...scope, [xVar]: t });
  if (!Number.isFinite(y)) return;
  const px = map.sx(t);
  const py = map.sy(y);

  if (follows.includes("tangent")) {
    const m = slopeAt(scope, expr, xVar, t, map.xMax - map.xMin);
    const dx = (map.xMax - map.xMin) * 0.28;
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(map.sx(t - dx), map.sy(y + m * -dx));
    ctx.lineTo(map.sx(t + dx), map.sy(y + m * dx));
    ctx.stroke();
  }

  if (follows.includes("dropline")) {
    const y0 = 0 >= map.yMin && 0 <= map.yMax ? 0 : map.yMin;
    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, map.sy(y0));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // The tracking point on top.
  ctx.fillStyle = colors.curve;
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function positionLabel(
  labelEl: HTMLElement,
  canvas: HTMLCanvasElement,
  map: PlotMap,
  scope: Record<string, number>,
  expr: { eval(s: Record<string, number>): number },
  xVar: string,
  t: number,
  follows: string[],
): void {
  if (!follows.includes("label")) {
    labelEl.style.display = "none";
    return;
  }
  const y = expr.eval({ ...scope, [xVar]: t });
  const m = slopeAt(scope, expr, xVar, t, map.xMax - map.xMin);
  labelEl.style.display = "";
  labelEl.textContent = `t = ${formatValue(t)},  f(t) = ${formatValue(
    y,
  )},  slope = ${formatValue(m)}`;
  labelEl.style.left = `${canvas.offsetLeft + map.sx(t) + 10}px`;
  labelEl.style.top = `${canvas.offsetTop + map.sy(y) - 30}px`;
}
