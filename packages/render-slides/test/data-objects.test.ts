import { parse } from "@theia/parser";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderDeck } from "../src/index.js";

const deck = renderDeck(
  parse(
    [
      "## Data",
      "",
      "@slider a [0, 4] = 2",
      "",
      ":::scene",
      "@matrix M = [[a, 0],[0, a]] at (-3, 1)",
      "@barchart bc values:[a, 3, 1] labels:[\"x\",\"y\",\"z\"] at (0, -2)",
      "@table T type:text at (3, 1) :",
      "| Name | Score |",
      "| Ana  | 92    |",
      ":::",
    ].join("\n"),
  ),
);

function stubCtx(rec: { fills: number }): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get: (_t, prop) => () => {
        if (prop === "fillRect") rec.fills++;
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

interface KRec {
  texByEl: Map<HTMLElement, string>;
}

async function boot(): Promise<{ w: Window & typeof globalThis; ctxRec: { fills: number }; k: KRec }> {
  const dom = new JSDOM(deck, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://t/" });
  const w = dom.window as unknown as Window & typeof globalThis;
  (w as unknown as { matchMedia: unknown }).matchMedia = () => ({
    matches: true, // reduced motion → deterministic, no rAF tween needed
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  const ctxRec = { fills: 0 };
  w.HTMLCanvasElement.prototype.getContext = (() => stubCtx(ctxRec)) as unknown as HTMLCanvasElement["getContext"];
  const k: KRec = { texByEl: new Map() };
  (w as unknown as { katex: unknown }).katex = {
    render(tex: string, el: HTMLElement) {
      k.texByEl.set(el, tex);
      el.textContent = tex;
    },
  };
  for (let i = 0; i < 50; i++) {
    if (w.document.querySelector(".slide.is-active")) break;
    await new Promise((r) => setTimeout(r, 0));
  }
  // Let the scene's rAF-scheduled first draw run (matrix/table/barchart paint).
  await new Promise((r) => setTimeout(r, 160));
  return { w, ctxRec, k };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 120));

describe("data objects", () => {
  it("renders a matrix that re-renders live when a bound entry's slider changes", async () => {
    const { w, k } = await boot();
    await tick();
    const matrix = w.document.querySelector<HTMLElement>(".chalk-scene__matrix")!;
    expect(matrix).toBeTruthy();
    const before = k.texByEl.get(matrix) ?? matrix.textContent ?? "";
    expect(before).toContain("\\begin{bmatrix}");
    expect(before).toContain("2"); // a's default

    // Drag the slider → reactive re-render.
    const input = w.document.querySelector<HTMLInputElement>('.chalk-slider[data-slider="a"] input')!;
    input.value = "4";
    input.dispatchEvent(new w.Event("input", { bubbles: true }));
    await tick();
    const after = k.texByEl.get(matrix) ?? matrix.textContent ?? "";
    expect(after).toContain("4");
    expect(after).not.toBe(before);
  });

  it("renders a table with header + data rows", async () => {
    const { w } = await boot();
    await tick();
    const rows = w.document.querySelectorAll(".chalk-scene__table tr");
    expect(rows.length).toBe(2);
    expect(w.document.querySelector(".chalk-scene__table th")?.textContent).toContain("Name");
    expect(w.document.body.textContent).toContain("Ana");
  });

  it("draws the barchart on the canvas (bars filled)", async () => {
    const { ctxRec } = await boot();
    await tick();
    expect(ctxRec.fills).toBeGreaterThan(0); // fillRect called per bar
  });
});
