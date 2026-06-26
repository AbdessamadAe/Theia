/**
 * A compact <canvas> function plotter. No dependencies: it samples a compiled
 * expression across the x-range and draws axes, a light grid, and the curve in
 * the supplied theme colors. Cheap enough to redraw on every slider tick.
 */
import type { CompiledExpr } from "./expr.js";

export interface PlotColors {
  axis: string;
  grid: string;
  curve: string;
  text: string;
}

export interface PlotOptions {
  xMin: number;
  xMax: number;
  yMin?: number;
  yMax?: number;
  /** The independent variable name (default "x"). */
  xVar?: string;
  samples?: number;
  colors: PlotColors;
}

/** Choose a "nice" grid step (1, 2, 5 × 10^k) near the requested span/divisions. */
function niceStep(span: number, targetDivisions: number): number {
  if (span <= 0 || !Number.isFinite(span)) return 1;
  const raw = span / targetDivisions;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}

export function drawPlot(
  canvas: HTMLCanvasElement,
  expr: CompiledExpr,
  scope: Record<string, number>,
  options: PlotOptions,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = (globalThis.devicePixelRatio as number) || 1;
  const cssW = canvas.clientWidth || 600;
  const cssH = canvas.clientHeight || 260;
  // Size the backing store for the device pixel ratio (crisp lines).
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const xVar = options.xVar ?? "x";
  const samples = options.samples ?? Math.max(120, Math.floor(cssW));
  const xMin = options.xMin;
  const xMax = options.xMax;

  // Sample the curve.
  const xs: number[] = [];
  const ys: number[] = [];
  const local: Record<string, number> = { ...scope };
  for (let i = 0; i <= samples; i++) {
    const x = xMin + ((xMax - xMin) * i) / samples;
    local[xVar] = x;
    xs.push(x);
    ys.push(expr.eval(local));
  }

  // Determine the y-range: explicit, else auto from finite samples (clamped).
  let yMin = options.yMin;
  let yMax = options.yMax;
  if (yMin === undefined || yMax === undefined) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const y of ys) {
      if (Number.isFinite(y)) {
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = -1;
      hi = 1;
    } else if (lo === hi) {
      lo -= 1;
      hi += 1;
    } else {
      const pad = (hi - lo) * 0.08;
      lo -= pad;
      hi += pad;
    }
    if (yMin === undefined) yMin = lo;
    if (yMax === undefined) yMax = hi;
  }

  const sx = (x: number): number => ((x - xMin) / (xMax - xMin)) * cssW;
  const sy = (y: number): number => cssH - ((y - yMin!) / (yMax! - yMin!)) * cssH;

  // --- Grid ---
  ctx.lineWidth = 1;
  ctx.font = "11px ui-monospace, Menlo, monospace";
  ctx.textBaseline = "top";
  const xStep = niceStep(xMax - xMin, 8);
  const yStep = niceStep(yMax - yMin, 5);
  ctx.strokeStyle = options.colors.grid;
  ctx.fillStyle = options.colors.text;
  ctx.beginPath();
  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
    const px = sx(x);
    ctx.moveTo(px, 0);
    ctx.lineTo(px, cssH);
  }
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
    const py = sy(y);
    ctx.moveTo(0, py);
    ctx.lineTo(cssW, py);
  }
  ctx.stroke();

  // --- Axes (drawn through the origin when visible) ---
  ctx.strokeStyle = options.colors.axis;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (0 >= yMin && 0 <= yMax) {
    const py = sy(0);
    ctx.moveTo(0, py);
    ctx.lineTo(cssW, py);
  }
  if (0 >= xMin && 0 <= xMax) {
    const px = sx(0);
    ctx.moveTo(px, 0);
    ctx.lineTo(px, cssH);
  }
  ctx.stroke();

  // --- Curve (break the path across non-finite or off-scale jumps) ---
  ctx.strokeStyle = options.colors.curve;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  let penDown = false;
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i]!;
    if (!Number.isFinite(y)) {
      penDown = false;
      continue;
    }
    const px = sx(xs[i]!);
    const py = sy(y);
    // Avoid drawing vertical streaks for asymptotes shooting off-canvas.
    if (py < -cssH * 4 || py > cssH * 5) {
      penDown = false;
      continue;
    }
    if (penDown) ctx.lineTo(px, py);
    else {
      ctx.moveTo(px, py);
      penDown = true;
    }
  }
  ctx.stroke();
}
