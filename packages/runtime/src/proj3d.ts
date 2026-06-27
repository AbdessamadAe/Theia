/**
 * 3D math for the WebGL scene layer — pure, no three.js, so the coordinate
 * mapping and the world→screen projection (the "label stuck to a 3D point"
 * core) are unit-testable without a GPU.
 *
 * Convention: data (x, y, z) maps into a centered world cube with three.js's
 * Y-up convention, putting the function *height* z along world-Y so a surface
 * z = f(x,y) stands up correctly.
 */

export interface CoordSystem3D {
  readonly xRange: [number, number];
  readonly yRange: [number, number];
  readonly zRange: [number, number];
  /** Data (x,y,z) → world (X,Y,Z), Y up = data z (height). */
  toWorld(x: number, y: number, z: number): [number, number, number];
}

/** Build a 3D coordinate system mapping data ranges into a cube of half-size
 * `half` centered at the origin. */
export function makeCoordSystem3D(
  xRange: [number, number],
  yRange: [number, number],
  zRange: [number, number],
  half = 2.5,
): CoordSystem3D {
  const span = (r: [number, number]): number => r[1] - r[0] || 1;
  const norm = (v: number, r: [number, number]): number =>
    ((v - r[0]) / span(r)) * 2 * half - half;
  return {
    xRange,
    yRange,
    zRange,
    toWorld: (x, y, z) => [norm(x, xRange), norm(z, zRange), norm(y, yRange)],
  };
}

/** Multiply a column-major 4×4 matrix (three.js `matrix.elements`) by a vec4. */
export function applyMat4(
  m: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
  w = 1,
): [number, number, number, number] {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]! * w,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]! * w,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]! * w,
    m[3]! * x + m[7]! * y + m[11]! * z + m[15]! * w,
  ];
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** False when the point is behind the camera or outside the clip volume. */
  visible: boolean;
}

/**
 * Project a world point to pixel coordinates given a combined view-projection
 * matrix (column-major) and the canvas size. Mirrors what three.js does inside
 * `Vector3.project` plus the NDC→pixel step, so a DOM label can be pinned to a
 * moving 3D point each frame.
 */
export function projectToScreen(
  world: readonly [number, number, number],
  viewProjection: ArrayLike<number>,
  width: number,
  height: number,
): ScreenPoint {
  const [cx, cy, cz, cw] = applyMat4(
    viewProjection,
    world[0],
    world[1],
    world[2],
  );
  if (cw === 0) return { x: 0, y: 0, visible: false };
  const ndcX = cx / cw;
  const ndcY = cy / cw;
  const ndcZ = cz / cw;
  const visible = cw > 0 && ndcZ >= -1 && ndcZ <= 1;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (-ndcY * 0.5 + 0.5) * height,
    visible,
  };
}
