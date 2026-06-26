import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "@chalk/parser";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderDeck } from "../src/index.js";

const source = readFileSync(
  fileURLToPath(new URL("../../../examples/limits.chalk", import.meta.url)),
  "utf8",
);
const html = renderDeck(parse(source));

/**
 * Load the deck, run its inline scripts (KaTeX bundle + reactive runtime), and
 * resolve once the runtime has booted. The runtime boots on DOMContentLoaded,
 * which jsdom fires on the next macrotask, so we wait for the first slide to go
 * active (set by the navigation boot) before returning.
 */
async function loadDeck(): Promise<Window & typeof globalThis> {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://example.test/deck.html",
  });
  const w = dom.window as unknown as Window & typeof globalThis;
  for (let i = 0; i < 50; i++) {
    if (w.document.querySelector(".slide.is-active")) return w;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error("runtime did not boot");
}

describe("Phase 3 reactivity (executed in jsdom)", () => {
  it("wires the slider as a live, enabled control with its default value", async () => {
    const w = await loadDeck();
    const box = w.document.querySelector('.chalk-slider[data-slider="a"]')!;
    const input = box.querySelector<HTMLInputElement>("input[type=range]")!;
    expect(input.disabled).toBe(false);
    expect(input.value).toBe("1");
    expect(box.querySelector(".chalk-slider__value")!.textContent).toBe("= 1");
  });

  it("re-renders slider-dependent math when the slider is dragged", async () => {
    const w = await loadDeck();
    const doc = w.document;
    const reactive = doc.querySelector<HTMLElement>(
      '[data-chalk-math][data-chalk-vars="a"]',
    )!;
    expect(reactive).toBeTruthy();
    // KaTeX has run on load with the default a = 1.
    const before = reactive.textContent ?? "";
    expect(before).toContain("1");

    // Drag the slider to 3.
    const input = doc.querySelector<HTMLInputElement>(
      '.chalk-slider[data-slider="a"] input[type=range]',
    )!;
    input.value = "3";
    input.dispatchEvent(new w.Event("input", { bubbles: true }));

    const after = reactive.textContent ?? "";
    expect(after).toContain("3");
    expect(after).not.toBe(before);
    // The slider's own value label tracks too.
    expect(
      doc.querySelector(".chalk-slider__value")!.textContent,
    ).toBe("= 3");
  });

  it("keeps the template tex so substitution is repeatable, not destructive", async () => {
    const w = await loadDeck();
    const reactive = w.document.querySelector<HTMLElement>(
      '[data-chalk-math][data-chalk-vars="a"]',
    )!;
    // The data-attribute template is never overwritten by a render.
    expect(reactive.getAttribute("data-chalk-math")).toBe("f(x) = a x^2");
  });

  it("does not throw when a plot canvas cannot be drawn (no 2d ctx in jsdom)", async () => {
    // Loading + dragging must not raise even though canvas is unavailable here;
    // the plotter degrades gracefully. (Reaching this assertion means no throw.)
    const w = await loadDeck();
    const input = w.document.querySelector<HTMLInputElement>(
      '.chalk-slider[data-slider="a"] input[type=range]',
    )!;
    input.value = "2";
    input.dispatchEvent(new w.Event("input", { bubbles: true }));
    expect(w.document.querySelector(".chalk-plot canvas")).toBeTruthy();
  });
});
