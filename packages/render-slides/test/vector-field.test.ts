import { parse } from "@chalk/parser";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderDeck } from "../src/index.js";

// `a` reshapes the field (scales only the v-component), so changing it changes
// the drawn arrow directions — i.e. a genuine re-compute, not a uniform rescale.
const deck = renderDeck(
  parse(
    [
      "## Field",
      "",
      "@slider a [1, 4] = 1",
      "",
      ":::scene",
      "@axes ax x:[-3, 3] y:[-3, 3]",
      "@vectorfield vf on ax : (-y, a*x)",
      ":::",
    ].join("\n"),
  ),
);

async function boot(): Promise<{ w: Window & typeof globalThis; lines: string[] }> {
  const dom = new JSDOM(deck, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://t/" });
  const w = dom.window as unknown as Window & typeof globalThis;
  (w as unknown as { matchMedia: unknown }).matchMedia = () => ({
    matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  const lines: string[] = [];
  w.HTMLCanvasElement.prototype.getContext = (() =>
    new Proxy(
      {},
      {
        get: (_t, p) => (...args: number[]) => {
          if (p === "lineTo") lines.push(args.map((n) => Math.round(n)).join(","));
        },
        set: () => true,
      },
    )) as unknown as HTMLCanvasElement["getContext"];
  for (let i = 0; i < 50; i++) {
    if (w.document.querySelector(".slide.is-active")) break;
    await new Promise((r) => setTimeout(r, 0));
  }
  await new Promise((r) => setTimeout(r, 160));
  return { w, lines };
}

describe("vector field", () => {
  it("draws arrows and re-computes when a slider reshapes the field", async () => {
    const { w, lines } = await boot();
    await new Promise((r) => setTimeout(r, 0));
    expect(lines.length).toBeGreaterThan(20); // a grid of arrows was drawn

    const before = lines.join("|");
    lines.length = 0;
    const input = w.document.querySelector<HTMLInputElement>('.chalk-slider[data-slider="a"] input')!;
    input.value = "4";
    input.dispatchEvent(new w.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 160));
    const after = lines.join("|");

    expect(after.length).toBeGreaterThan(0); // it redrew
    expect(after).not.toBe(before); // arrow geometry changed → recomputed live
  });
});
