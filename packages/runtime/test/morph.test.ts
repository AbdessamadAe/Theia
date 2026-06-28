// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { MorphController } from "../src/morph.js";

type R = { left: number; top: number; width: number; height: number };
function setRect(el: Element, r: R): void {
  (el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
    ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} }) as DOMRect;
}

interface Captured {
  transform: string;
  origin: string;
}
let captured: Captured[];

beforeEach(() => {
  captured = [];
  (HTMLElement.prototype as unknown as { animate: unknown }).animate = function (
    this: HTMLElement,
    keyframes: Array<{ transform?: string }>,
  ) {
    const kf = Array.isArray(keyframes) ? keyframes[0] : keyframes;
    captured.push({ transform: kf?.transform ?? "", origin: this.style.transformOrigin });
    return { finished: Promise.resolve(), cancel() {} };
  };
});

describe("morph FLIP geometry", () => {
  it("compensates for the deck scale and pins transform-origin to the top-left", () => {
    const stage = document.createElement("div");
    document.body.appendChild(stage);
    // The deck is scaled to fit: stage screen width (100) = 0.5 × layout width (200).
    Object.defineProperty(stage, "offsetWidth", { value: 200, configurable: true });
    setRect(stage, { left: 0, top: 0, width: 100, height: 50 });

    const from = document.createElement("span");
    from.innerHTML = `<span class="mord">x</span>`;
    stage.appendChild(from);
    setRect(from.querySelector("span")!, { left: 30, top: 10, width: 10, height: 10 });

    const to = document.createElement("span");
    to.innerHTML = `<span class="mord">x</span>`;
    setRect(to.querySelector("span")!, { left: 10, top: 10, width: 10, height: 10 });

    new MorphController(stage).morphTo(to, { reducedMotion: false });

    const m = captured.find((c) => c.transform.includes("translate"));
    expect(m, "a matched-glyph transform was animated").toBeTruthy();
    // screen dx = 30 − 10 = 20; divided by the deck scale 0.5 → 40 local px.
    expect(m!.transform).toContain("translate(40px, 0px)");
    expect(m!.origin).toBe("0 0");
  });

  it("falls back to an instant swap under reduced motion (no animation)", () => {
    const stage = document.createElement("div");
    const from = document.createElement("span");
    from.innerHTML = `<span>a</span>`;
    stage.appendChild(from);
    const to = document.createElement("span");
    to.innerHTML = `<span>b</span>`;
    new MorphController(stage).morphTo(to, { reducedMotion: true });
    expect(captured.length).toBe(0);
    expect(stage.firstElementChild).toBe(to);
  });
});
