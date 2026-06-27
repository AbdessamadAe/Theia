import { describe, expect, it } from "vitest";
import { makeCoordSystem3D, projectToScreen } from "../src/proj3d.js";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe("makeCoordSystem3D — data→world mapping (z is up)", () => {
  const cs = makeCoordSystem3D([-3, 3], [-3, 3], [0, 9], 2.5);

  it("centers the x/y origin and puts data-z (height) on world Y", () => {
    // data (0,0,0): x,y centered → 0; z=0 is the min → world Y = -half.
    expect(cs.toWorld(0, 0, 0)).toEqual([0, -2.5, 0]);
    // data max corner maps to the +half cube corner.
    expect(cs.toWorld(3, 3, 9)).toEqual([2.5, 2.5, 2.5]);
    // data min corner maps to the -half corner.
    expect(cs.toWorld(-3, -3, 0)).toEqual([-2.5, -2.5, -2.5]);
  });

  it("maps data x→world X and data y→world Z", () => {
    const [wx, , wz] = cs.toWorld(3, -3, 0);
    expect(wx).toBeCloseTo(2.5);
    expect(wz).toBeCloseTo(-2.5);
  });
});

describe("projectToScreen — world→pixel (label pinning)", () => {
  it("maps the origin to the canvas center under an identity view", () => {
    const p = projectToScreen([0, 0, 0], IDENTITY, 800, 600);
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(300);
    expect(p.visible).toBe(true);
  });

  it("places +x to the right and +y upward (screen y inverted)", () => {
    const right = projectToScreen([0.5, 0, 0], IDENTITY, 800, 600);
    expect(right.x).toBeCloseTo(600); // (0.5*0.5+0.5)*800
    const up = projectToScreen([0, 0.5, 0], IDENTITY, 800, 600);
    expect(up.y).toBeCloseTo(150); // (-0.5*0.5+0.5)*600
  });

  it("reports points behind the camera as not visible", () => {
    // A matrix whose w-row negates w → clip-w < 0 → behind camera.
    const behind = [...IDENTITY];
    behind[15] = -1;
    const p = projectToScreen([0, 0, 0], behind, 800, 600);
    expect(p.visible).toBe(false);
  });
});
