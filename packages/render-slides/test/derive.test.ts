import { parse } from "@chalk/parser";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderDeck } from "../src/index.js";

/** A two-slide deck: a derive on the second slide so we can advance into it. */
const deck = renderDeck(
  parse(
    [
      "## Intro",
      "",
      "Some text.",
      "",
      "## Derivation",
      "",
      ":::derive",
      "$$ a + b $$",
      "+to $$ b + a + c $$",
      ":::",
      "",
    ].join("\n"),
  ),
);

async function boot(): Promise<Window & typeof globalThis> {
  const dom = new JSDOM(deck, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://example.test/",
  });
  const w = dom.window as unknown as Window & typeof globalThis;
  for (let i = 0; i < 50; i++) {
    if (w.document.querySelector(".slide.is-active")) return w;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error("runtime did not boot");
}

function press(w: Window, key: string): void {
  w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true }));
}

function stageText(w: Window): string {
  // The derive stage's rendered KaTeX includes the source tex in its MathML
  // annotation, so textContent reveals which state is shown.
  return (
    w.document.querySelector(".chalk-derive__stage")?.textContent ?? ""
  );
}

describe("derive ↔ navigation integration (jsdom)", () => {
  it("emits advance metadata so the slide counts the +to as an advance", async () => {
    const w = await boot();
    const slide = w.document.querySelectorAll(".slide")[1]!;
    expect(slide.getAttribute("data-steps")).toBe("1"); // one +to transition
    const derive = slide.querySelector(".chalk-derive")!;
    expect(derive.getAttribute("data-advance-base")).toBe("0");
    expect(derive.getAttribute("data-transitions")).toBe("1");
  });

  it("shows the initial state, then morphs to the next state on advance", async () => {
    const w = await boot();
    // Jump to the derivation slide (#2) and confirm initial state.
    w.location.hash = "#2";
    w.dispatchEvent(new w.Event("hashchange"));
    expect(stageText(w)).toContain("a + b");
    expect(stageText(w)).not.toContain("+ c");

    // Advance: the derive should now display the second state. (In jsdom there
    // is no Web Animations API, so morph takes its instant-swap fallback —
    // exactly the path used for prefers-reduced-motion.)
    press(w, "ArrowRight");
    await new Promise((r) => setTimeout(r, 0));
    expect(stageText(w)).toContain("b + a + c");

    // Going back restores the prior state without breakage.
    press(w, "ArrowLeft");
    await new Promise((r) => setTimeout(r, 0));
    expect(stageText(w)).toContain("a + b");
    expect(stageText(w)).not.toContain("+ c");
  });
});

/** A slide combining +step (reveal), +to (morph) and +emphasize on one flow. */
const combined = renderDeck(
  parse(
    [
      "## Combined",
      "",
      ":::example Why",
      "+step one",
      "+step two",
      ":::",
      "",
      ":::derive",
      "$$ a + b $$",
      "+to $$ \\mark{b} + a + c $$",
      "+emphasize highlight b",
      ":::",
      "",
    ].join("\n"),
  ),
);

describe("combined +step / +to / +emphasize advance ordering (jsdom)", () => {
  async function bootCombined(): Promise<Window & typeof globalThis> {
    const dom = new JSDOM(combined, {
      runScripts: "dangerously",
      pretendToBeVisual: true,
      url: "https://example.test/",
    });
    const w = dom.window as unknown as Window & typeof globalThis;
    for (let i = 0; i < 50; i++) {
      if (w.document.querySelector(".slide.is-active")) return w;
      await new Promise((r) => setTimeout(r, 0));
    }
    throw new Error("runtime did not boot");
  }

  const revealedSteps = (w: Window): number =>
    w.document.querySelectorAll(".chalk-step.is-revealed").length;

  it("counts 3 advances: two steps then one morph", async () => {
    const w = await bootCombined();
    expect(w.document.querySelector(".slide")!.getAttribute("data-steps")).toBe(
      "3",
    );
  });

  it("sequences forward (steps, then morph + emphasis) and reverses on ←", async () => {
    const w = await bootCombined();
    const stage = () =>
      w.document.querySelector(".chalk-derive__stage")?.textContent ?? "";
    const hasHighlight = () =>
      !!w.document.querySelector(".chalk-derive__stage .chalk-emph-highlight");

    // Forward: step 1, step 2, then the derive morphs and emphasizes.
    press(w, "ArrowRight");
    await tick();
    expect(revealedSteps(w)).toBe(1);
    expect(stage()).toContain("a + b"); // derive not yet advanced

    press(w, "ArrowRight");
    await tick();
    expect(revealedSteps(w)).toBe(2);
    expect(stage()).toContain("a + b");

    press(w, "ArrowRight");
    await tick();
    expect(stage()).toContain("+ a + c"); // morphed to the second state
    expect(hasHighlight()).toBe(true); // emphasis fired on the marked term

    // Reverse: the derive (last advance) un-does first, steps remain.
    press(w, "ArrowLeft");
    await tick();
    expect(stage()).toContain("a + b");
    expect(hasHighlight()).toBe(false); // emphasis cleared on reverse
    expect(revealedSteps(w)).toBe(2);

    press(w, "ArrowLeft");
    await tick();
    expect(revealedSteps(w)).toBe(1);
  });
});

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
