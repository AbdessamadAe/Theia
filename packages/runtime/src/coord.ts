/**
 * Coordinate systems for scenes (sub-phase A) — pure, no DOM, so the data↔pixel
 * mapping is unit-testable. A `CoordSystem` maps data coordinates to a pixel
 * rectangle on the canvas and back, so any object declared "on" an axes can be
 * positioned consistently. Axes / NumberPlane / NumberLine all reduce to this
 * mapping (a NumberPlane is axes + grid; a NumberLine is a 1-D axes).
 */

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CoordSystem {
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly rect: PixelRect;
  /** Data → canvas pixel. */
  toPixel(x: number, y: number): [number, number];
  /** Canvas pixel → data. */
  fromPixel(px: number, py: number): [number, number];
  /** Pixels per one data unit, on each axis. */
  scale(): [number, number];
}

/** Build a 2-D coordinate system over a pixel rectangle. The y-axis is flipped
 * (data increases upward), matching mathematical convention. */
export function makeCoordSystem(
  xRange: [number, number],
  yRange: [number, number],
  rect: PixelRect,
): CoordSystem {
  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  const toPixel = (x: number, y: number): [number, number] => [
    rect.x + ((x - xMin) / xSpan) * rect.width,
    rect.y + rect.height - ((y - yMin) / ySpan) * rect.height,
  ];
  const fromPixel = (px: number, py: number): [number, number] => [
    xMin + ((px - rect.x) / rect.width) * xSpan,
    yMin + ((rect.y + rect.height - py) / rect.height) * ySpan,
  ];

  return {
    xMin,
    xMax,
    yMin,
    yMax,
    rect,
    toPixel,
    fromPixel,
    scale: () => [rect.width / xSpan, rect.height / ySpan],
  };
}

/** Parse a `[a,b]` range string into a tuple; returns `fallback` if malformed. */
export function parseRange(
  raw: string | undefined,
  fallback: [number, number],
): [number, number] {
  if (!raw) return fallback;
  const m = /\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/.exec(raw);
  if (!m) return fallback;
  return [parseFloat(m[1]!), parseFloat(m[2]!)];
}

/** A "nice" tick step (1,2,5 × 10^k) near span/divisions. */
export function niceStep(span: number, divisions: number): number {
  if (span <= 0 || !Number.isFinite(span)) return 1;
  const raw = span / divisions;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}
