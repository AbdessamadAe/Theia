import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "@theia/parser";
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it } from "vitest";
import { renderDeck } from "../src/index.js";

const source = readFileSync(
  fileURLToPath(new URL("../../../examples/limits.theia", import.meta.url)),
  "utf8",
);
const html = renderDeck(parse(source));

/** Load the generated deck and actually run its inline runtime script. */
function loadDeck(): { window: Window & typeof globalThis; doc: Document } {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://example.test/deck.html",
  });
  return {
    window: dom.window as unknown as Window & typeof globalThis,
    doc: dom.window.document,
  };
}

function press(window: Window, key: string): void {
  const ev = new window.KeyboardEvent("keydown", { key, bubbles: true });
  window.document.dispatchEvent(ev);
}

function activeIndex(doc: Document): number {
  const active = doc.querySelector(".slide.is-active");
  return active ? Number(active.getAttribute("data-index")) : -1;
}

describe("deck runtime (executed in jsdom)", () => {
  let window: Window & typeof globalThis;
  let doc: Document;

  beforeEach(() => {
    ({ window, doc } = loadDeck());
  });

  it("shows the first slide on load", () => {
    expect(activeIndex(doc)).toBe(0);
    expect(doc.querySelectorAll(".slide.is-active")).toHaveLength(1);
  });

  it("advances through slides with ArrowRight", () => {
    press(window, "ArrowRight"); // slide 0 has no steps → go to slide 1
    expect(activeIndex(doc)).toBe(1);
    press(window, "ArrowRight");
    expect(activeIndex(doc)).toBe(2);
    press(window, "ArrowLeft");
    expect(activeIndex(doc)).toBe(1);
  });

  it("reveals proof steps one at a time before advancing", () => {
    // Navigate to the proof slide (index 3); slides 0–2 have no steps.
    press(window, "ArrowRight");
    press(window, "ArrowRight");
    press(window, "ArrowRight");
    expect(activeIndex(doc)).toBe(3);

    const proof = doc.querySelector('.slide[data-index="3"]')!;
    const steps = proof.querySelectorAll(".chalk-step");
    expect(steps).toHaveLength(3);
    // None revealed yet.
    expect(proof.querySelectorAll(".chalk-step.is-revealed")).toHaveLength(0);

    press(window, "ArrowRight"); // reveal step 0
    expect(proof.querySelectorAll(".chalk-step.is-revealed")).toHaveLength(1);
    press(window, "ArrowRight"); // reveal step 1
    press(window, "ArrowRight"); // reveal step 2
    expect(proof.querySelectorAll(".chalk-step.is-revealed")).toHaveLength(3);
    // Still on the proof slide until all steps are shown.
    expect(activeIndex(doc)).toBe(3);

    press(window, "ArrowRight"); // now advance to the next slide
    expect(activeIndex(doc)).toBe(4);
  });

  it("un-reveals steps with ArrowLeft before leaving the slide", () => {
    for (let i = 0; i < 3; i++) press(window, "ArrowRight"); // to slide 3
    press(window, "ArrowRight"); // reveal step 0
    press(window, "ArrowRight"); // reveal step 1
    const proof = doc.querySelector('.slide[data-index="3"]')!;
    expect(proof.querySelectorAll(".chalk-step.is-revealed")).toHaveLength(2);
    press(window, "ArrowLeft"); // hide step 1
    expect(proof.querySelectorAll(".chalk-step.is-revealed")).toHaveLength(1);
  });

  it("jumps to the last slide with End and the first with Home", () => {
    const lastIndex = doc.querySelectorAll(".slide").length - 1;
    press(window, "End");
    expect(activeIndex(doc)).toBe(lastIndex);
    press(window, "Home");
    expect(activeIndex(doc)).toBe(0);
  });

  it("toggles the theme via the bottom-bar button", () => {
    const btn = doc.getElementById("chalk-theme")!;
    const before = doc.documentElement.getAttribute("data-theme");
    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const after = doc.documentElement.getAttribute("data-theme");
    expect(after).not.toBe(before);
    expect(["light", "dark"]).toContain(after);
  });
});
