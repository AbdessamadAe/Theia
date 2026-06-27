import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { initScenes } from "../src/scene.js";

class StubGraph {
  private v = new Map<string, number>();
  set(n: string, x: number): void {
    this.v.set(n, x);
  }
  get(n: string): number | undefined {
    return this.v.get(n);
  }
  scope(): Record<string, number> {
    return Object.fromEntries(this.v);
  }
  addDependent(): unknown {
    return null;
  }
}

function mount(html: string): Document {
  const dom = new JSDOM(`<body>${html}</body>`, { pretendToBeVisual: true });
  (globalThis as unknown as { document: Document }).document = dom.window.document;
  return dom.window.document;
}

afterEach(() => {
  delete (globalThis as unknown as { document?: Document }).document;
});

const sceneData = (objects: unknown[], anims: unknown[] = []): string =>
  JSON.stringify({ objects, anims });

describe("3D lazy-load gating", () => {
  it("never loads three.js for a 2D-only deck", () => {
    mount(
      `<div class="chalk-scene" data-advance-base="0" data-transitions="0">
        <canvas class="chalk-scene__canvas"></canvas>
        <div class="chalk-scene__overlay"></div>
        <script type="application/json" class="chalk-scene__data">${sceneData([
          { kind: "axes", name: "ax", args: { x: "[-2,2]", y: "[-2,2]" } },
        ])}</script>
      </div>`,
    );
    let called = false;
    initScenes(new StubGraph(), {
      three: () => {
        called = true;
        return new Promise(() => {});
      },
    });
    expect(called).toBe(false);
  });

  it("loads three.js (once) only when a 3D scene is present", () => {
    mount(
      `<div class="chalk-scene chalk-scene--3d" data-3d="true" data-advance-base="0" data-transitions="0">
        <canvas class="chalk-scene__canvas"></canvas>
        <div class="chalk-scene__overlay"></div>
        <div class="chalk-scene__loading"></div>
        <script type="application/json" class="chalk-scene__data">${sceneData([
          { kind: "axes3d", name: "ax", args: { x: "[-3,3]", y: "[-3,3]", z: "[0,9]" } },
        ])}</script>
      </div>`,
    );
    let calls = 0;
    // jsdom has no IntersectionObserver, so the runtime loads eagerly here.
    initScenes(new StubGraph(), {
      three: () => {
        calls += 1;
        return new Promise(() => {}); // stay pending: we only assert it was called
      },
    });
    expect(calls).toBe(1);
  });
});
