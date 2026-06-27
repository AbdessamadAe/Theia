import { parse } from "@chalk/parser";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderDeck } from "../src/index.js";

/** A small scene whose objects appear in a known order as you advance. */
const deck = renderDeck(
  parse(
    [
      "## Scene",
      "",
      "@slider k [0, 3] = 1",
      "",
      ":::scene",
      '@axes ax x:[-2, 2] y:[-2, 2] xlabel:"x" ylabel:"y"',
      '@label L1 on ax at (1, 1) "A"',
      "@plot f on ax : k*x^2",
      '@label L2 on ax at (-1, 1) "B"',
      "+animate create ax",
      "+animate write f",
      "+animate fade-in L2",
      ":::",
      "",
    ].join("\n"),
  ),
);

/** A no-op 2D context so the canvas draw path runs under jsdom. */
function stubCtx(): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get: () => () => undefined,
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

async function boot(): Promise<Window & typeof globalThis> {
  const dom = new JSDOM(deck, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://example.test/",
  });
  const w = dom.window as unknown as Window & typeof globalThis;
  // Force reduced-motion (deterministic, instant) and give canvas a context.
  (w as unknown as { matchMedia: unknown }).matchMedia = () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  w.HTMLCanvasElement.prototype.getContext = (() =>
    stubCtx()) as unknown as HTMLCanvasElement["getContext"];
  for (let i = 0; i < 50; i++) {
    if (w.document.querySelector(".slide.is-active")) break;
    await new Promise((r) => setTimeout(r, 0));
  }
  return w;
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const press = (w: Window, key: string): void =>
  void w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true }));
const labelCount = (w: Window): number =>
  w.document.querySelectorAll(".chalk-scene__label").length;
const labelTexts = (w: Window): string[] =>
  Array.from(w.document.querySelectorAll(".chalk-scene__label")).map(
    (n) => n.textContent ?? "",
  );

describe("scene runtime: advance-driven object creation (Phase 8A)", () => {
  it("declares 3 advances (the three +animate verbs)", async () => {
    const w = await boot();
    await tick();
    expect(w.document.querySelector(".chalk-scene")!.getAttribute("data-transitions")).toBe(
      "3",
    );
  });

  it("reveals objects in advance order and reverses on ←", async () => {
    const w = await boot();
    await tick();
    // Only the static label L1 is shown initially (axes/curve await their verbs).
    expect(labelTexts(w)).toEqual(["A"]);

    press(w, "ArrowRight"); // create ax → axis labels x, y appear
    await tick();
    expect(labelCount(w)).toBe(3);
    expect(labelTexts(w)).toContain("x");
    expect(labelTexts(w)).toContain("y");

    press(w, "ArrowRight"); // write f → curve (no label) → count unchanged
    await tick();
    expect(labelCount(w)).toBe(3);

    press(w, "ArrowRight"); // fade-in L2 → its label appears
    await tick();
    expect(labelTexts(w)).toContain("B");
    expect(labelCount(w)).toBe(4);

    press(w, "ArrowLeft"); // un-reveal L2
    await tick();
    expect(labelTexts(w)).not.toContain("B");
    expect(labelCount(w)).toBe(3);
  });

  it("stays alive (no throw) when the bound slider is dragged", async () => {
    const w = await boot();
    await tick();
    const input = w.document.querySelector<HTMLInputElement>(
      '.chalk-slider[data-slider="k"] input[type=range]',
    )!;
    input.value = "2.5";
    input.dispatchEvent(new w.Event("input", { bubbles: true }));
    await tick();
    expect(w.document.querySelector(".chalk-scene__canvas")).toBeTruthy();
  });
});
