import { parse } from "@chalk/parser";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderDeck } from "../src/index.js";

function makeDeck(scene: string[]): string {
  return renderDeck(parse(["## Anim", "", ":::scene", "@axes ax x:[-5, 5] y:[-5, 5]", ...scene, ":::"].join("\n")));
}

interface Boot {
  w: Window & typeof globalThis;
  lastArc: () => [number, number] | null;
}
async function boot(deck: string): Promise<Boot> {
  const dom = new JSDOM(deck, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://t/" });
  const w = dom.window as unknown as Window & typeof globalThis;
  (w as unknown as { matchMedia: unknown }).matchMedia = () => ({
    matches: true, // reduced motion → instant placement (deterministic)
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  let arc: [number, number] | null = null;
  w.HTMLCanvasElement.prototype.getContext = (() =>
    new Proxy(
      {},
      {
        get: (_t, p) => (...args: number[]) => {
          if (p === "arc") arc = [args[0]!, args[1]!];
        },
        set: () => true,
      },
    )) as unknown as HTMLCanvasElement["getContext"];
  for (let i = 0; i < 50; i++) {
    if (w.document.querySelector(".slide.is-active")) break;
    await new Promise((r) => setTimeout(r, 0));
  }
  await new Promise((r) => setTimeout(r, 40));
  return { w, lastArc: () => arc };
}

const press = (w: Window, key: string): void =>
  void w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true }));
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 30));

describe("move verb", () => {
  it("moves a point to its target on advance and back on reverse (reduced = instant)", async () => {
    const { w, lastArc } = await boot(makeDeck(["@point P on ax at (0, 0)", "+animate move P to (3, 2)"]));
    await tick();
    const start = lastArc()!;
    expect(start).toBeTruthy();

    press(w, "ArrowRight"); // reveal the move verb
    await tick();
    const moved = lastArc()!;
    expect(moved[0]).toBeGreaterThan(start[0] + 10); // moved right (+x)
    expect(moved[1]).toBeLessThan(start[1] - 10); // moved up (−pixel y)

    press(w, "ArrowLeft"); // reverse → back to base
    await tick();
    const back = lastArc()!;
    expect(Math.abs(back[0] - start[0])).toBeLessThan(2);
    expect(Math.abs(back[1] - start[1])).toBeLessThan(2);
  });
});

describe("rotate verb", () => {
  it("orbits a point about a pivot by the given angle on advance", async () => {
    // P at (3,0), rotate 90° about origin → expect ≈ (0,3).
    const { w, lastArc } = await boot(makeDeck(["@point P on ax at (3, 0)", "+animate rotate P by 90deg about (0, 0)"]));
    await tick();
    const start = lastArc()!; // at (3,0): right of centre, on the mid line

    press(w, "ArrowRight");
    await tick();
    const rotated = lastArc()!; // at (0,3): centred horizontally, above
    expect(Math.abs(rotated[0] - start[0])).toBeGreaterThan(20); // x changed (3 → 0)
    expect(rotated[1]).toBeLessThan(start[1] - 20); // moved up
  });
});
