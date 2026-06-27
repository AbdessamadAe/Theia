import { parse } from "@chalk/parser";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderDeck } from "../src/index.js";

const deck = renderDeck(
  parse(
    [
      "## Clip",
      "",
      ":::scene",
      "@axes ax x:[-5, 5] y:[-3, 5]",
      '@video clip on ax of "clip.mp4" at (0, 1) width:6',
      "+animate play clip from 0:03 to 0:09",
      "+animate pause clip",
      ":::",
      "",
      "## Next",
      "",
      "Done.",
    ].join("\n"),
  ),
);

function stubCtx(): CanvasRenderingContext2D {
  return new Proxy({}, { get: () => () => undefined, set: () => true }) as unknown as CanvasRenderingContext2D;
}

interface FakeVideo {
  __plays: number;
  __pauses: number;
  __ct: number;
}

async function boot(): Promise<Window & typeof globalThis> {
  const dom = new JSDOM(deck, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://t/" });
  const w = dom.window as unknown as Window & typeof globalThis;
  (w as unknown as { matchMedia: unknown }).matchMedia = () => ({
    matches: true, // reduced motion: deterministic; media verbs still fire
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  w.HTMLCanvasElement.prototype.getContext = (() => stubCtx()) as unknown as HTMLCanvasElement["getContext"];
  // jsdom doesn't implement media playback — record calls instead.
  const proto = w.HTMLMediaElement.prototype as unknown as FakeVideo & { play: () => Promise<void>; pause: () => void };
  proto.play = function (this: FakeVideo) {
    this.__plays = (this.__plays || 0) + 1;
    return Promise.resolve();
  };
  proto.pause = function (this: FakeVideo) {
    this.__pauses = (this.__pauses || 0) + 1;
  };
  Object.defineProperty(w.HTMLMediaElement.prototype, "currentTime", {
    get(this: FakeVideo) {
      return this.__ct || 0;
    },
    set(this: FakeVideo, v: number) {
      this.__ct = v;
    },
    configurable: true,
  });
  for (let i = 0; i < 50; i++) {
    if (w.document.querySelector(".slide.is-active")) break;
    await new Promise((r) => setTimeout(r, 0));
  }
  return w;
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const press = (w: Window, key: string): void =>
  void w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true }));
const video = (w: Window): HTMLVideoElement & FakeVideo =>
  w.document.querySelector(".chalk-scene__media--video") as HTMLVideoElement & FakeVideo;

describe("advance-driven video: play / segment / pause ordering", () => {
  it("does not play before its advance step", async () => {
    const w = await boot();
    await tick();
    expect(video(w)).toBeTruthy();
    expect(video(w).__plays || 0).toBe(0);
  });

  it("plays and seeks to the trim start on the play advance", async () => {
    const w = await boot();
    await tick();
    press(w, "ArrowRight"); // crosses `+animate play clip from 0:03 to 0:09`
    await tick();
    expect(video(w).__plays).toBe(1);
    expect(video(w).currentTime).toBe(3); // sought to 0:03
  });

  it("pauses at the trim end (0:09) via the timeupdate guard", async () => {
    const w = await boot();
    await tick();
    press(w, "ArrowRight");
    await tick();
    const v = video(w);
    v.currentTime = 9; // playhead reaches the segment end
    v.dispatchEvent(new w.Event("timeupdate"));
    expect(v.__pauses).toBeGreaterThanOrEqual(1);
  });

  it("pauses on the explicit pause advance", async () => {
    const w = await boot();
    await tick();
    press(w, "ArrowRight"); // play
    await tick();
    const before = video(w).__pauses || 0;
    press(w, "ArrowRight"); // crosses `+animate pause clip`
    await tick();
    expect(video(w).__pauses).toBeGreaterThan(before);
  });

  it("pauses when you leave the slide", async () => {
    const w = await boot();
    await tick();
    press(w, "ArrowRight"); // play
    await tick();
    const before = video(w).__pauses || 0;
    press(w, "ArrowRight"); // pause verb
    press(w, "ArrowRight"); // advance to the next slide → leaving pauses media
    await tick();
    expect(video(w).__pauses).toBeGreaterThan(before);
  });
});
