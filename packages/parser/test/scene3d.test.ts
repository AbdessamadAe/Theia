import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SceneBlock, Slide } from "@theia/ast";
import { describe, expect, it } from "vitest";
import { parse } from "../src/index.js";

const doc = parse(
  readFileSync(
    fileURLToPath(new URL("../../../examples/surfaces.theia", import.meta.url)),
    "utf8",
  ),
);

function scene(headingPrefix: string): SceneBlock {
  const slide = doc.children.find(
    (s): s is Slide =>
      s.type === "slide" &&
      s.heading.some((n) => n.type === "text" && n.value.startsWith(headingPrefix)),
  )!;
  return slide.children.find((b): b is SceneBlock => b.type === "scene")!;
}

describe("parse(surfaces.theia) — :::scene3d", () => {
  it("marks the scene as 3-dimensional", () => {
    expect(scene("A reactive paraboloid").dimension).toBe("3d");
  });

  it("parses 3D objects with kinds, hosts, and reactive expressions", () => {
    const sc = scene("A reactive paraboloid");
    expect(sc.objects.map((o) => `${o.kind}:${o.name}`)).toEqual([
      "axes3d:ax",
      "surface:f",
      "dot3d:P",
      "label:L",
      "camera:cam",
    ]);
    const axes = sc.objects[0]!;
    expect(axes.args.z).toBe("[0, 9]");
    const surface = sc.objects[1]!;
    expect(surface.on).toBe("ax");
    expect(surface.args.expr).toBe("a*(x^2 + y^2)");
    expect(surface.args.colorscale).toBe("height");
    // Nested-paren coordinate survives balanced parsing.
    expect(sc.objects[2]!.args.z).toBe("a*(1.5^2 + 1.5^2)");
    const cam = sc.objects[4]!;
    expect(cam.args.phi).toBe("62");
    expect(cam.args.autorotate).toBe("true");
  });

  it("parses the 3D animation verbs as ordered advances", () => {
    const sc = scene("A reactive paraboloid");
    expect(sc.steps.map((s) => `${s.verb} ${s.target}`)).toEqual([
      "create ax",
      "grow f",
      "grow P",
    ]);
  });

  it("parses solids and polyhedra in the gallery scene", () => {
    const sc = scene("A gallery of solids");
    expect(sc.objects.map((o) => o.kind)).toEqual([
      "axes3d",
      "sphere",
      "torus",
      "icosahedron",
      "cube",
      "camera",
    ]);
    expect(sc.objects[1]!.args.r).toBe("0.55");
  });
});
